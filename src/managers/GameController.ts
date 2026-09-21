/* ============================================================
   GAME CONTROLLER

   The orchestrator: the phase machine, the fixed-timestep loop,
   and the one place that turns a physics record into juice.

   Note what is NOT in the simulation: sound, particles and the
   squash are all fired from HERE, off what stepBall recorded
   (ball.hit, ball.justBroke). That is what keeps simulate()
   silent and side-effect free for the solver sweep.

   It emits on the bus and never touches React directly; the UI
   subscribes to a version counter and re-reads whatever it needs.
   ============================================================ */
import type { FlightKind, GameBus, Phase } from '../core/events';
import { LevelManager, DEL_R, HANDLE_R, AIM_R } from './LevelManager';
import { RewardManager, prizeLabel } from './RewardManager';
import type { BallState, PhysicsEngine } from '../physics/PhysicsEngine';
import { Renderer, type CaptureState, type Squash } from '../render/Renderer';
import { TweenSystem, Ease } from '../render/Tweens';
import { CAPTURE_MS, STEP_MS_DEFAULT } from '../render/constants';
import { Sound } from '../audio/Sound';
import { clamp } from '../physics/math';
import { TERMINAL_VY, MIN_RAMP } from '../physics/constants';
import type { DropResult, Hit } from '../physics/types';
import { targetAt } from '../levels/target';
import type { BoostRampDef, Level, Segment, Vec } from '../levels/types';
import type { ItemKind } from '../items/items';

const STEP_MS = STEP_MS_DEFAULT;
const FLASH_MS = 2600;

const HIT_COLOR: Record<string, string> = {
  ramp: '#1680f0', wall: '#5b6188', obstacle: '#f0223f',
  breakable: '#e0761c', booster: '#ff9d3d', portal: '#a54bd6',
  /* The boost ramp's own orange, so the sparks off a launch are the colour of
     the thing that threw the ball rather than of an ordinary bounce. */
  boost: '#ff7a18',
};

/* The mechanics tips. The game is plan-first, so a new mechanic is taught the
   moment it APPEARS on a board - not when the ball hits it, by which point
   the plan it should have informed is already committed. The obstacle keeps
   its on-contact tip: "that scattered you randomly" only means something once
   it has. Short on purpose: the flash is one fixed-height line. */
export const MECH_TIPS: { key: string; has: (lv: Level) => boolean; text: string }[] = [
  { key: 'booster',   has: lv => lv.boosters.length > 0,
    text: 'Booster: fires you where the arrow points.' },
  { key: 'wind',      has: lv => lv.wind.length > 0,
    text: 'Wind: pushes the ball while it is inside.' },
  { key: 'slippery',  has: lv => lv.slippery.length > 0,
    text: 'Ice: bounces here keep nearly all their speed.' },
  { key: 'portal',    has: lv => lv.portals.length > 0,
    text: 'Portal: in one ring, out of the other.' },
  { key: 'breakable', has: lv => lv.breakables.length > 0,
    text: 'Breakable: bounces once, then shatters.' },
  { key: 'star',      has: lv => lv.stars.length > 0,
    text: 'Gold stars are optional pickups.' },
  { key: 'box',       has: lv => lv.boxes.length > 0,
    text: 'Mystery box: hit it for a random reward.' },
];

/* ============================================================
   "THERE IS A GIFT IN THIS TARGET"

   Not in MECH_TIPS, and the difference is the whole reason: a
   mechanic tip is taught ONCE, ever, because a mechanic is a rule
   to learn. A gift in the target is not a rule, it is a fact
   about the board in front of you - the same class of thing as
   `needsBooster` - so it is said every time that board is
   entered, and only while the gift is still there to be had.
   ============================================================ */
export const GIFT_TIP = 'There is a gift inside this target - land in it and it is yours.';

/* ============================================================
   THE FIRST-RUN WALKTHROUGH

   Level 1 only, one step at a time, each step waiting for the
   player to actually do the thing it asks:

     intro  - what the game is: get the ball into the target
     draw   - drag across the board to draw a ramp
     drop   - tap empty board to drop
     retry  - (only if that first drop missed) your ramp stayed,
              nudge it and go again

   The step is DERIVED from the board every time it is asked -
   no ramp means "draw" again even after it was passed - with
   two small flags for what the board cannot tell us: the intro
   was read, and the first drop missed. Nothing here blocks play;
   Coach.tsx draws the bubble and Skip ends all of it.

   There is no "aim" step any more, and there is nothing missing:
   a drawn ramp was aimed BY the drag that made it. That step
   only existed to undo a ramp the game had placed for you.
   ============================================================ */
export type TutStep = 'intro' | 'draw' | 'drop' | 'retry';

/** What a finished level shows on the win card. */
export interface WinCard {
  stars: number; note: string; bonus: number; coins: number;
  isLast: boolean; nextId: number | null;
  /** Boosters this win actually spent. Zero on all but a handful of boards. */
  boosters: number;
}

export class GameController {
  phase: Phase = 'plan';
  tries = 0;
  /* Whatever the engine produced. The controller never names a concrete
     ball class - see PhysicsEngine. */
  ball: BallState | null = null;
  capture: CaptureState | null = null;
  selected = -1;
  /* The player's booster on this board, selected separately from the ramps.
     Two fields rather than one tagged selection because they are two
     different kinds of thing with two different sets of grips, and because
     the ramp's selection is load-bearing everywhere - it is not worth
     reshaping to make room for a second item. Only one is ever >= 0. */
  selectedBooster = -1;
  /** Which boxes this controller has already reacted to, this drop. */
  private boxSeen: boolean[] = [];
  /** Which of the player's own boosters this drop has actually fired through.
      The same test the engine fires them on, run at the same step boundaries,
      so the two can never disagree about whether one went off. */
  private boosterFired: boolean[] = [];
  private tutIntroDone = false;
  private tutRetry = false;
  /** Set on the walkthrough's own drop, so a miss knows to coach a retry. */
  private tutDropping = false;
  dragging: { mode: 'p1' | 'p2' | 'move'; ix: number; lx: number; ly: number } | null = null;
  /* ============================================================
     THE RAMP BEING DRAWN

     A drag across empty board IS the ramp: where it starts is one
     end, where the finger is now is the other, and the thing on
     screen is the thing that will be placed. No spawn step, no
     default length to correct - one gesture sets position, length
     and angle together.

     It lives here rather than on LevelManager because it is not a
     ramp yet: nothing in the simulation can see it, and letting
     go below MIN_RAMP throws it away.
     ============================================================ */
  draft: Segment | null = null;
  /** A booster drag: its body, or the knob that aims it. */
  boosterDrag: { mode: 'move' | 'aim'; ix: number; lx: number; ly: number } | null = null;
  /** Forces a seed, for tests and the solver. null means a fresh random one. */
  seedOverride: number | null = null;

  lastResult: DropResult | null = null;
  winCard: WinCard | null = null;
  /* ============================================================
     THE GIFT IN THE TARGET, MID-REVEAL

     Set by finish() on a board whose target is wrapped, and the
     win card is held in `pendingCard` while it is up: the two
     celebrations are SEQUENTIAL, never stacked. That ordering is
     why the card is withheld rather than the panel being drawn
     over it - the confetti and the coin flight both key off
     `winCard`, so holding the card back holds the whole win beat
     back with it, and there is no second gate to keep in step.

     The prize is rolled HERE, when the gift is opened, and paid
     when the panel closes. Nothing is owed in between that a
     closed tab could lose: the roll is not money until
     collectGift() hands it to the ledger, and the claim that
     stops a second gift is written the moment it is claimed.
     ============================================================ */
  gift: { kind: FlightKind; n: number } | null = null;
  private pendingCard: WinCard | null = null;
  flash = '';

  readonly squash: Squash = { amt: 0, nx: 0, ny: -1 };
  readonly tweens = new TweenSystem();

  clock = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private seenHit = 0;
  private seenBroke = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bumped on every change the UI should re-read. React subscribes to this. */
  version = 0;
  private listeners = new Set<() => void>();

  constructor(
    readonly bus: GameBus,
    readonly levels: LevelManager,
    readonly rewards: RewardManager,
    readonly renderer: Renderer,
    private readonly engine: PhysicsEngine,
  ) {
    /* The wallet can change without the GAME changing - a purchase in the
       shop, a wheel settling, a spare ramp spent - and every one of those is
       on screen somewhere. The counters are React reading this version
       number, so anything that moves a balance has to bump it, or the HUD
       and the shop go stale until something else happens to redraw them. */
    for (const e of ['balls:changed', 'coins:changed', 'ramps:changed',
                     'boosters:changed', 'spin:granted'] as const)
      bus.on(e, () => this.changed());
  }

  /** Whether a drag on empty board may start a ramp at all: this level's own
      budget, or a spare in the drawer to cover it. Read by the canvas before
      a draft begins and by the caption that offers the gesture. */
  get canDraw(): boolean {
    return this.phase === 'plan' &&
           (this.levels.canPlaceRamp || this.rewards.extraRamps > 0);
  }

  /** Begin a ramp at `p`. Returns false when there is nothing left to draw
      with, which is the canvas's cue to let the gesture be a tap instead. */
  beginDraft(p: Vec): boolean {
    if (!this.canDraw) return false;
    this.draft = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    return true;
  }

  /** The far end follows the finger, held to MAX_RAMP from where it started.

      NO changed() HERE. A finger moving across a 120Hz screen fires this a
      hundred times a second, and changed() re-renders every React component
      subscribed to the version counter - the HUD, the controls, the coach -
      for a line that only the CANVAS draws. The renderer reads this.draft out
      of renderState() on its own frame, so the ramp already follows the
      finger at exactly the rate the board is painted at; the re-renders were
      pure overhead, and they were what made a slow drag feel sticky. */
  updateDraft(p: Vec): void {
    const d = this.draft;
    if (!d) return;
    const q = this.levels.truncate({ x: d.x1, y: d.y1 }, p);
    d.x2 = q.x; d.y2 = q.y;
  }

  /** Let go. A draft shorter than MIN_RAMP is thrown away - that is a tap, or
      a twitch, and neither is a ramp. Only a draft that is actually KEPT
      spends a spare, so a discarded scribble costs nothing.

      Returns true if a ramp was placed. */
  commitDraft(): boolean {
    const d = this.draft;
    this.draft = null;
    if (!d) return false;
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    if (len < MIN_RAMP) { this.changed(); return false; }
    if (!this.levels.canPlaceRamp && !this.useExtraRamp()) { this.changed(); return false; }
    const ok = this.levels.addRamp(d);
    this.notifyRampsChanged();
    return ok;
  }

  cancelDraft(): void {
    if (!this.draft) return;
    this.draft = null;
    this.changed();
  }

  /** Take one spare ramp from the drawer and add it to THIS level's budget.
      The two halves belong to different managers - the drawer is the player's
      and the budget is the board's - so joining them is the controller's job,
      as it is for every other spend. */
  useExtraRamp(): boolean {
    if (this.phase !== 'plan') return false;
    if (!this.rewards.spendExtraRamp()) return false;
    this.levels.extraBudget++;
    const left = this.rewards.extraRamps;
    this.showFlash(`Extra ramp added - ${left} left in your drawer.`);
    this.changed();
    return true;
  }

  /** How many of an item the inventory can hand out right now.

      RAMPS ARE NOT IN HERE, and that is the distinction the whole input model
      rests on: a ramp is drawn by hand, out of a per-level budget, and a
      booster is an owned thing taken out of a bag. One is the player's
      expressive tool, the other is scarce. */
  itemCount(kind: ItemKind): { left: number; spare: number } {
    switch (kind) {
      /* A booster has no level budget at all - every one of them is yours -
         so `left` is simply what is in the bag, minus any already sitting on
         this board waiting to find out whether they get spent. */
      case 'booster':
        return { left: Math.max(0, this.rewards.extraBoosters - this.levels.boostersReserved),
                 spare: 0 };
    }
  }

  /** Whether the bag may show this item at all. Boosters do not exist before
      level 21 - see RewardManager.boostersUnlocked. */
  itemUnlocked(kind: ItemKind): boolean {
    return kind === 'booster' ? this.rewards.boostersUnlocked : true;
  }

  /** Take one item out of the inventory and put it on the board, selected,
      so the very next drag moves it. Returns false when there is nothing to
      give or the board is not in planning. */
  placeItem(kind: ItemKind): boolean {
    if (this.phase !== 'plan') return false;
    switch (kind) {
      /* Nothing is charged here. Taking a booster out of the bag puts it on
         the board and reserves it; the coins only leave when a drop that used
         it wins - see commitBoosters(). */
      case 'booster': {
        if (!this.itemUnlocked('booster')) return false;
        if (this.itemCount('booster').left <= 0) return false;
        const ix = this.levels.placeBooster();
        this.selectedBooster = ix;
        this.selected = -1;
        this.dragging = null;
        this.boosterDrag = null;
        this.bus.emit('item:placed', { kind, index: ix });
        this.notifyRampsChanged();
        return true;
      }
    }
  }

  /* ============================================================
     PAYING FOR A BOOSTER

     Only from finish(), and finish() only runs on a win. That is
     most of the rule, and it is why this is not folded into
     placeItem the way a spare ramp's spend is: a booster that
     went down, missed, was nudged and dropped again has cost
     nothing at all, however many attempts that took.

     The rest of the rule is `boosterFired`: the drop has to have
     actually gone THROUGH it. Winning with one parked in a
     corner it never touched is not a booster that worked, and
     charging for it would make "you only pay when it works" a
     lie in the one case a player would notice.

     Idempotent through the paid flags, so a Replay of a board
     already won cannot charge for the same booster twice.
     ============================================================ */
  private commitBoosters(): number {
    let paid = 0;
    for (let i = 0; i < this.levels.boostersUsed; i++) {
      if (!this.boosterFired[i] || this.levels.boosterPaid[i]) continue;
      if (!this.rewards.spendExtraBooster()) break;   // bag emptied elsewhere
      this.levels.boosterPaid[i] = true;
      paid++;
    }
    return paid;
  }

  /** Take the selected booster back off the board. Free, always - see above. */
  removeBooster(ix: number): void {
    this.levels.removeBooster(ix);
    this.selectedBooster = -1;
    this.boosterDrag = null;
    this.notifyRampsChanged();
  }

  /** Matter builds a world per drop; let the engine tear it down. */
  private releaseBall(): void {
    if (this.ball) this.engine.dispose?.(this.ball);
    this.ball = null;
  }

  /* ---------------- UI subscription (useSyncExternalStore) ---------------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = (): number => this.version;

  private changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  /* ---------------- the loop ---------------- */

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      let dt = now - this.last;
      this.last = now;
      if (dt > 250) dt = 250;               // tab was backgrounded
      this.clock += dt / 1000;              // keeps running in every phase, so
                                            // the target breathes while planning
      this.tweens.update(dt);
      this.renderer.particles.update(dt);
      this.tick(dt);
      this.renderer.render(this.renderState());
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private tick(dt: number): void {
    if (this.phase === 'drop' && this.ball) {
      this.acc += dt;
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS;
        const b = this.ball;
        b.px = b.x; b.py = b.y;
        this.engine.step(b, this.levels.playLevel, this.levels.rampSegments);
        this.reactToStep(b);
        if (b.result) { this.land(b.result); break; }
      }
    } else if (this.phase === 'capture' && this.capture) {
      this.capture.t += dt;
      if (this.capture.t >= CAPTURE_MS) this.finish('win');
    }
  }

  /* Everything the physics RECORDED, turned into things you can see and hear.
     Driven from here, never from stepBall. */
  private reactToStep(b: BallState): void {
    const lv = this.levels.playLevel;

    /* Which of the player's boost ramps have actually fired. Read straight off
       the engine, which is the only thing that knows: a bar fires on a real
       Matter contact, and a contact is not something this side can re-derive
       from a position - the old disc's "is the ball inside it" test has no
       equivalent for a 14-unit-thick bar a ball crosses in a single frame.
       `boostOffset` skips any the LEVEL authored: only the player's are
       charged for. */
    const off = this.levels.boostOffset;
    for (let k = 0; k < this.boosterFired.length; k++)
      if (b.firedBoost[off + k]) this.boosterFired[k] = true;

    /* a box the ball opened this step. Before the hit reaction, so a box sat
       against a wall pops on the frame it is touched rather than the one
       after the bounce. */
    for (let k = 0; k < b.gotBox.length; k++) {
      if (!b.gotBox[k] || this.boxSeen[k]) continue;
      this.boxSeen[k] = true;
      this.openBox(k, lv.boxes[k]);
    }

    // a block that shattered this step throws its pieces
    while (this.seenBroke < b.justBroke.length) {
      const bk = lv.breakables[b.justBroke[this.seenBroke++]];
      this.renderer.particles.burst(bk.x, bk.y, 0, -1, '#e08a3c', 16, 3.2, Math.PI, 460);
      this.renderer.particles.burst(bk.x, bk.y, 0, -1, '#ffd7a8', 8, 2.2, Math.PI, 340);
      this.bus.emit('breakable:broke', { index: b.justBroke[this.seenBroke - 1] });
    }

    if (b.hit.n !== this.seenHit) {
      this.seenHit = b.hit.n;
      Sound.bounce(b.hit.kind === 'obstacle' || b.hit.kind === 'breakable'
                   ? 'obstacle' : 'ramp');
      this.reactToHit(b.hit);
      /* The just-in-time obstacle tip, and the reason it needs its own flag:
         level 1 has no obstacles at all, so this can only ever fire on a later
         level - long after tutorialSeen has been set. */
      if (b.hit.kind === 'obstacle' && !this.rewards.obstacleTipSeen) {
        this.rewards.obstacleTipSeen = true;
        this.rewards.saveProgress();
        this.showFlash('Obstacles bounce you randomly — try to avoid them.');
      }
    }
  }

  /* ============================================================
     OPENING A MYSTERY BOX

     The pop is unconditional - the ball hit a chest, the chest
     reacts - and the PAYOUT is not: claimBox() is the ledger's
     one-per-level gate, and a box already claimed on an earlier
     visit pays nothing at all. That ordering is deliberate: the
     feedback belongs to the contact, the reward belongs to the
     record.

     The roll happens HERE and not in the simulation, which never
     learns what a box is worth. That is what keeps simulate()
     pure enough for the solver sweep to run a thousand drops
     without paying a player a thousand times.
     ============================================================ */
  private openBox(ix: number, at: { x: number; y: number }): void {
    // the same burst helper everything else uses - gold shards, then a
    // brighter flash of white through them
    this.renderer.particles.burst(at.x, at.y, 0, -1, '#ffc53a', 18, 3.4, Math.PI, 520);
    this.renderer.particles.burst(at.x, at.y, 0, -1, '#fff3c4', 9, 2.3, Math.PI, 360);
    Sound.coin(0);
    this.bus.emit('box:collected', { index: ix });

    if (!this.rewards.claimBox(this.levels.levelIndex)) return;
    const prize = this.rewards.rollBoxPrize(this.levels.level.id);
    this.rewards.payBoxPrize(prize);
    this.showFlash(
      prize.kind === 'spin'
        ? 'Mystery box: a free spin! Tap the gear.'
        : `Mystery box: ${prizeLabel(prize.kind, prize.n)}!`);
    /* The mark flies from the chest itself to whatever now holds it. The
       controller cannot reach the DOM, so it says where and what, and
       CoinFlight - which owns that layer - does the flying. */
    this.bus.emit('box:reward', { kind: prize.kind, n: prize.n, x: at.x, y: at.y });
    this.changed();
  }

  /** Fire everything a single contact is worth: sparks and squash. */
  private reactToHit(h: Hit): void {
    const col = HIT_COLOR[h.kind] || '#ffffff';
    // hard hits throw more, and further - a graze stays quiet
    const k = clamp(h.speed / TERMINAL_VY, 0.25, 1.6);
    this.renderer.particles.burst(h.x, h.y, h.nx, h.ny, col,
                                  4 + Math.round(k * 3), 1.5 + k * 1.6, 0.85, 230);
    this.squash.nx = h.nx; this.squash.ny = h.ny;
    /* squash in along the normal, then overshoot slightly past round on the
       way back out - that overshoot is what reads as a rebound, not a nudge */
    this.tweens.add(this.squash, 'amt', 0.20 + 0.22 * k, 0, 105, Ease.outBack);
    this.bus.emit('ball:hit', { x: h.x, y: h.y, nx: h.nx, ny: h.ny,
                                kind: h.kind as never, speed: h.speed });
  }

  /* ---------------- the drop ---------------- */

  drop(): void {
    if (this.phase !== 'plan') return;
    /* Out of balls. Drop is deliberately left ENABLED for this: a dead grey
       button tells a player they are stuck without telling them what to do
       about it, so the press opens the way to get more instead. */
    if (this.rewards.balls <= 0) { this.bus.emit('balls:empty', {}); this.changed(); return; }
    // the walkthrough's last step is this very tap
    this.tutDropping = this.tutorialStep() === 'drop';
    if (this.tutDropping) this.tutorialDone();
    this.tutRetry = false;

    this.capture = null; this.dragging = null; this.selected = -1;
    this.boosterDrag = null; this.selectedBooster = -1; this.draft = null;
    this.hideFlash();
    const seed = this.seedOverride !== null
      ? this.seedOverride : (Math.random() * 0x7fffffff) | 0;
    this.releaseBall();
    this.ball = this.engine.createBall(this.levels.playLevel, seed, this.levels.sessionBroken);
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0;
    /* A box already opened - this session or a previous visit - must not pop
       again, so the run starts with those already accounted for. */
    this.boxSeen = this.levels.sessionBoxes.slice();
    // whether a booster fired is a fact about THIS drop, not the board
    this.boosterFired = this.levels.placedBoosters.map(() => false);
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.acc = 0;

    /* one ball per press, win or lose: what costs is throwing it, not the
       result. Committed before the drop runs, so an interrupted run still
       paid. */
    this.rewards.spendBall();
    this.tries++;
    this.setPhase('drop');
    this.bus.emit('drop:started', { level: this.levels.playLevel, seed, tries: this.tries });
  }

  /* A win is swallowed by the target first; the card waits for the animation.
     A miss does not stop the game at all - see missed(). */
  private land(result: DropResult): void {
    const b = this.ball!;
    // a block broken this run stays broken for the next drop
    this.levels.sessionBroken = b.broken.slice();
    // and a box opened this run stays open, win or lose: it was claimed the
    // instant it was touched, so it must not come back for the next attempt
    this.levels.sessionBoxes = this.levels.sessionBoxes.map((g, i) => g || !!b.gotBox[i]);
    this.rewards.recordPickups(this.levels.levelIndex, b.stars);

    if (result !== 'win') { this.missed(result); return; }
    /* Where the target WAS when the ball reached it. On a patrolling board
       the authored centre is only its start, and swallowing the ball toward
       that would drag it sideways to a place the target had already left. */
    const c = targetAt(this.levels.playLevel, b.steps);
    Sound.capture();
    this.setPhase('capture');
    this.capture = { t: 0, bx: b.x, by: b.y, cx: c.x, cy: c.y };
    // the same particle helper, pointed straight up and fanned all the way round
    this.renderer.particles.burst(b.x, b.y, 0, -1, '#2fc95a', 14, 3.0, Math.PI, 420);
    this.bus.emit('ball:captured', { level: this.levels.level });
  }

  /* A losing drop: say what went wrong above the board, put the ball back on
     the spawn, and return to planning at once. The player's ramps are left
     exactly where they put them so the next move is an adjustment, not a
     rebuild. No overlay, no button to dismiss. */
  private missed(result: DropResult): void {
    this.lastResult = result;
    if (this.tutDropping) { this.tutRetry = true; this.tutDropping = false; }
    this.releaseBall();
    this.capture = null;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.squash.amt = 0; this.seenHit = 0; this.seenBroke = 0;
    this.setPhase('plan');
    /* Fire says what it was, because a run that ends on contact with
       something looks like a bug unless the board names it. */
    this.showFlash(
      result === 'burned' ? 'Burned up! Fire ends the drop - go around it.'
      : result === 'timeout' ? 'Got stuck! Try readjusting your ramps.'
      : 'Missed! Try readjusting your ramps.');
    this.emitEnded(result);
  }

  /* Only a win reaches here - it is the one moment that still earns a
     full-screen beat, with stars and the route on to the next level. */
  private finish(result: DropResult): void {
    this.lastResult = result;
    const lv = this.levels.level;
    /* THE ONE PLACE A BOOSTER IS SPENT. Before the clear is recorded, so the
       win card and the bag are already telling the same story by the time
       either is looked at. */
    const boostersUsed = this.commitBoosters();
    /* Judged against the level's OWN budget, not the one in force: a spare
       ramp bought from the drawer must not be able to buy a star with it. */
    const { stars, bonus, coins, note, firstClear } = this.rewards.recordClear(
      this.levels.levelIndex, lv.id, this.levels.isLast,
      this.tries, this.levels.rampsUsed, this.levels.levelBudget);

    const card: WinCard = {
      stars, note, bonus, coins, isLast: this.levels.isLast,
      nextId: this.levels.isLast ? null : this.levels.levelIndex + 2,
      boosters: boostersUsed,
    };
    this.capture = null;

    /* IS THIS TARGET WRAPPED? Claimed here rather than when the panel opens,
       so the one thing that must never happen twice - a second gift out of the
       same target - is settled by the same call that decides to show one. */
    const gift = lv.targetGift && this.rewards.claimGift(this.levels.levelIndex)
      ? this.rewards.rollBoxPrize(lv.id) : null;
    if (gift) {
      this.gift = { kind: gift.kind, n: gift.n };
      this.pendingCard = card;
      this.winCard = null;
      /* NOT the win fanfare: that belongs to the card, and the card is a beat
         away. The chest's own chime opens the gift instead. */
      Sound.coin(0);
    } else {
      this.winCard = card;
      // the confetti starts on this phase change, so the fanfare starts with it
      Sound.win();
    }
    this.setPhase('over');
    this.hideFlash();
    this.bus.emit('level:cleared',
      { level: lv, index: this.levels.levelIndex, stars, firstClear });
    this.emitEnded(result);
  }

  /* ============================================================
     THE GIFT, TAKEN

     Called by the panel once its unwrap has played out. The order
     matters: the ledger is credited first, so the counters the
     reward flies INTO are already right when it lands, and then
     the win card is released - which is what starts the confetti,
     the payout flight and the stars, all of them a beat late and
     none of them competing with the gift.

     The FLIGHT itself is the panel's job, not this method's: it
     launches from the wrapping it just opened, and only the DOM
     knows where that is. See GiftPanel.
     ============================================================ */
  collectGift(): void {
    const g = this.gift;
    if (!g) return;
    this.gift = null;
    this.rewards.payBoxPrize(g);
    this.showFlash(g.kind === 'spin'
      ? 'The target held a free spin! Tap the gear.'
      : `The target held ${prizeLabel(g.kind, g.n)}!`);
    this.winCard = this.pendingCard;
    this.pendingCard = null;
    Sound.win();
    this.bus.emit('gift:opened', { kind: g.kind, n: g.n });
    this.changed();
  }

  private emitEnded(result: DropResult): void {
    this.bus.emit('drop:ended', { result, level: this.levels.level,
                                  tries: this.tries, rampsUsed: this.levels.rampsUsed });
  }

  /* ---------------- level flow ---------------- */

  setLevel(i: number): void {
    this.levels.setLevel(i);
    this.tutRetry = false; this.tutDropping = false;
    this.releaseBall();
    this.capture = null;
    this.selected = -1; this.dragging = null; this.lastResult = null;
    this.selectedBooster = -1; this.boosterDrag = null; this.draft = null;
    this.boxSeen = []; this.boosterFired = [];
    this.winCard = null; this.pendingCard = null; this.gift = null;
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.renderer.invalidateBackdrop();
    this.tries = 0;
    this.hideFlash();
    this.setPhase('plan');
    if (this.levels.levelIndex > this.rewards.highest) {
      this.rewards.highest = this.levels.levelIndex;
      this.rewards.saveProgress();
    }
    /* Whether this board's box has already been taken is the ledger's fact
       and the board's appearance, so joining them is this method's job - the
       same cross-manager seam as every other spend here. */
    this.levels.setBoxesClaimed(this.rewards.boxClaimed(this.levels.levelIndex));
    /* Reaching Solmesa is what puts the first booster in the bag. Announced
       with a flash rather than a modal: it is a gift, not an interruption. */
    if (this.rewards.noteLevelReached(this.levels.level.id))
      this.showFlash('Booster ramps unlocked - one is in your bag!');
    this.teachNewMechanics();
    this.teachBoosterBoard();
    this.teachGiftBoard();
  }

  nextLevel(): void { this.setLevel(this.levels.levelIndex + 1); }

  /** Replay: drop the same layout again, which costs a ball like any drop. */
  retry(): void {
    this.setPhase('plan');
    this.winCard = null; this.pendingCard = null; this.gift = null;
    this.drop();
  }

  /** Put the board back in the player's hands with the ramps untouched, and
      no ball spent. It was the win card's Adjust button until that card was
      cut to two choices; it stays because it is also how a reset returns to
      planning - see debugHook.reset(). */
  adjust(): void {
    this.releaseBall();
    this.winCard = null; this.pendingCard = null; this.gift = null;
    this.setPhase('plan');
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.bus.emit('phase:changed', { phase: p });
    this.changed();
  }

  /* ---------------- teaching ---------------- */

  tutorialStep(): TutStep | null {
    if (this.levels.levelIndex !== 0 || this.phase !== 'plan') return null;
    if (this.tutRetry) return 'retry';
    if (this.rewards.tutorialSeen) return null;
    if (!this.tutIntroDone) return 'intro';
    if (this.levels.rampsUsed === 0) return 'draw';
    return 'drop';
  }

  /** The bubble's own button: "Let's go", "Done", "OK". */
  tutorialNext(): void {
    switch (this.tutorialStep()) {
      case 'intro': this.tutIntroDone = true; break;
      case 'retry': this.tutRetry = false; break;
      default: return;
    }
    this.changed();
  }

  /** A drag on a placed ramp just ended. Nothing to teach here any more -
      see the note on the walkthrough - but the UI still has to re-read. */
  rampAdjusted(): void { this.notifyRampsChanged(); }

  tutorialDone(): void {
    if (this.rewards.tutorialSeen) return;
    this.rewards.tutorialSeen = true;
    this.rewards.saveProgress();
    this.changed();
  }

  /** Skip means skip all of it, the just-in-time obstacle tip included. */
  tutorialSkip(): void {
    this.rewards.tutorialSeen = true;
    this.tutRetry = false;
    this.rewards.obstacleTipSeen = true;
    for (const t of MECH_TIPS) this.rewards.tipsSeen[t.key] = true;
    this.rewards.saveProgress();
    this.changed();
  }

  private teachNewMechanics(): void {
    if (!this.rewards.tutorialSeen) return;      // the ramp lesson comes first
    const lv = this.levels.level;
    for (const t of MECH_TIPS) {
      if (!this.rewards.tipsSeen[t.key] && t.has(lv)) {
        this.rewards.tipsSeen[t.key] = true;
        this.rewards.saveProgress();
        this.showFlash(t.text);
        this.bus.emit('tip:shown', { key: t.key, text: t.text });
        return;
      }
    }
  }

  /* ============================================================
     "THIS ONE NEEDS A BOOSTER"

     A board that cannot be solved with ramps has to say so. The
     puzzle is meant to be the placement, not the discovery that
     the level is a wall - a player who spends fifteen balls
     proving a board impossible has been tricked, not challenged.

     Said EVERY time the level is entered, unlike the mechanic
     tips, which are once-ever: this is not a thing to learn, it
     is a fact about the board in front of you. And it says
     something different when the bag is empty, because then the
     next move is the shop rather than the bag.
     ============================================================ */
  private teachBoosterBoard(): void {
    if (!this.levels.level.needsBooster) return;
    this.showFlash(this.rewards.extraBoosters > 0
      ? 'Ramps cannot reach this one - use a booster ramp.'
      : 'Ramps cannot reach this one - the shop has booster ramps.');
  }

  /** Say so when the board's target holds a gift, every visit, until it has
      been taken. Announced after the booster line, which is the one that
      affects whether the board can be solved at all. */
  private teachGiftBoard(): void {
    if (!this.levels.level.targetGift) return;
    if (this.rewards.giftClaimed(this.levels.levelIndex)) return;
    this.showFlash(GIFT_TIP);
  }

  showFlash(text: string): void {
    this.flash = text;
    if (this.flashTimer) clearTimeout(this.flashTimer);   // a new miss replaces the old
    this.flashTimer = setTimeout(() => {
      this.flash = ''; this.flashTimer = null; this.changed();
    }, FLASH_MS);
    this.bus.emit('flash', { text });
    this.changed();
  }

  hideFlash(): void {
    if (this.flashTimer) { clearTimeout(this.flashTimer); this.flashTimer = null; }
    this.flash = '';
    this.bus.emit('flash:hide', {});
  }

  /* ---------------- ramp editing, driven by the canvas ---------------- */

  notifyRampsChanged(): void { this.changed(); }

  /** A drag on a placed booster just ended. Its own method rather than a
      branch inside rampAdjusted(), which belongs to the walkthrough and must
      not be taught anything by an item the walkthrough never mentions. */
  boosterAdjusted(): void { this.changed(); }

  /* ---------------- what the renderer needs ---------------- */

  /* Public only so the test hook can read exactly what the renderer is given.
     Nothing in the game calls it from outside. */
  renderState() {
    const lv = this.levels.level;
    return {
      level: lv,
      country: this.levels.country,
      entities: this.levels.entities,
      ramps: this.levels.rampSegments,
      draft: this.draft,
      minRamp: MIN_RAMP,
      selected: this.selected,
      phase: this.phase,
      clock: this.clock,
      alpha: this.acc / STEP_MS,
      /* Steps plus the part-step the renderer is interpolating through, so a
         patrolling target slides instead of stepping. Zero with no ball on
         the board, which parks it at the start of its run - the position the
         player plans against. */
      simT: this.ball ? this.ball.steps + this.acc / STEP_MS : 0,
      ball: this.ball,
      broken: this.ball ? this.ball.broken : this.levels.sessionBroken,
      got: this.ball ? this.ball.got : [],
      /* OR-ed rather than taken from the ball: a box claimed on an earlier
         visit is open before this drop starts, and the live run only ever
         adds to that. */
      gotBox: this.levels.sessionBoxes.map(
        (g, i) => g || !!(this.ball && this.ball.gotBox[i])),
      /* Asked of the LEDGER, not of the board: whether a wrapped target has
         already paid out is a fact about the save, and the one mid-win case -
         the gift is on screen being opened - still counts as taken, because
         claimGift() has already been called by then. */
      giftTaken: this.rewards.giftClaimed(this.levels.levelIndex),
      capture: this.capture,
      captureMs: CAPTURE_MS,
      squash: this.squash,
      deleteButtonAt: (s: Segment) => this.levels.deleteButtonAt(s),
      /* The player's boosters, and the grips for whichever one is selected.
         Passed the same way the ramp's are, from the same manager, so the
         thing drawn and the thing the finger hits cannot disagree. */
      boosters: this.levels.placedBoosters,
      selectedBooster: this.selectedBooster,
      boosterHandleAt: (b: BoostRampDef) => this.levels.boosterHandleAt(b),
      boosterDeleteAt: (b: BoostRampDef) => this.levels.boosterDeleteAt(b),
      aimR: AIM_R,
      /* read from the same constants the hit-test uses: these were once
         literals, and the × was resized for the finger while still being
         painted at its old size */
      handleR: HANDLE_R,
      delR: DEL_R,
      tutorial: { step: this.tutorialStep() },
    };
  }

  /** The caption on the board: how to get a ramp on the first visit, how
      to drop after that. Null when the caption slot should stay empty. */
  get cue(): string | null {
    // the walkthrough's bubble does this job while it is up
    if (this.phase !== 'plan' || this.selected >= 0 || this.selectedBooster >= 0
        || this.tutorialStep()) return null;
    return this.canDraw
      ? 'Drag to draw a ramp, or tap to drop the ball'
      : 'Touch or click on screen to drop ball';
  }

  /** The hint line under the board - a read-only view of state. */
  get hint(): string {
    const step = this.tutorialStep();
    if (step === 'intro') return 'Get the ball into the green target.';
    if (step === 'draw') return 'Drag across the board to draw a ramp under the ball.';
    if (step === 'drop') return 'Tap anywhere to drop the ball.';
    if (this.phase === 'drop' || this.phase === 'capture') return 'Watching the drop…';
    if (this.phase === 'over') return 'Replay drops this same layout again. Next moves on.';
    if (this.selectedBooster >= 0)
      return 'Drag the booster ramp to move it, the knob to turn it, × to take it back.';
    if (this.selected >= 0) return 'Drag the middle to move it, an end to reshape it, × to remove it.';
    if (this.levels.rampsLeft <= 0 && this.rewards.extraRamps <= 0)
      return 'No ramps left — tap a ramp to adjust it, or tap empty board to drop.';
    return 'Drag to draw a ramp. Tap a ramp to adjust it, or empty board to drop.';
  }
}
