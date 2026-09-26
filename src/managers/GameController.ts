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
import { LevelManager, DEL_R, HANDLE_R } from './LevelManager';
import { RewardManager, prizeLabel, ballsFor, starsFor, CONTINUE_BALLS, SPRING_UNLOCK_LEVEL, CHALLENGE_BALLS,
         SPARE_PER_LEVEL, SPARE_FROM, STUCK_AFTER_RESTARTS } from './RewardManager';
import type { BallState, PhysicsEngine } from '../physics/PhysicsEngine';
import { Renderer, type CaptureState, type Squash } from '../render/Renderer';
import { TweenSystem, Ease } from '../render/Tweens';
import { CAPTURE_MS, STEP_MS_DEFAULT } from '../render/constants';
import { Sound } from '../audio/Sound';
import { clamp } from '../physics/math';
import { TERMINAL_VY, MIN_RAMP } from '../physics/constants';
import type { DropResult, Hit } from '../physics/types';
import { targetAt } from '../levels/target';
import { strikeAt } from '../levels/storm';
import { levelSeed, LEVELS, COUNTRIES } from '../levels';
import { INTROS, GLOSSARY, type IntroCtx } from '../ui/glossary';
import { track } from '../analytics/track';
import { HINTS } from '../levels/hints.data';
import { boardCycles } from '../levels/fish';
import type { Circle, Level, Segment, Vec } from '../levels/types';
import type { ItemKind } from '../items/items';

const STEP_MS = STEP_MS_DEFAULT;
const FLASH_MS = 2600;

const HIT_COLOR: Record<string, string> = {
  ramp: '#1680f0', wall: '#5b6188', obstacle: '#f0223f',
  breakable: '#e0761c', booster: '#ff9d3d',
  /* The boost ramp's own orange, so the sparks off a launch are the colour of
     the thing that threw the ball rather than of an ordinary bounce. */
  boost: '#ff7a18',
};

/* ============================================================
   "THERE IS A GIFT IN THIS TARGET"

   Not an intro card (ui/glossary), and the difference is the whole
   reason: a mechanic is introduced ONCE, ever, because it is a rule
   to learn. A gift in the target is not a rule, it is a fact
   about the board in front of you - the same class of thing as
   `needsSpring` - so it is said every time that board is
   entered, and only while the gift is still there to be had.
   ============================================================ */
export const GIFT_TIP = 'There is a gift inside this target - land in it and it is yours.';

/** Said when a ramp is let go across a moving target's track. The track is
    drawn on the board, so this names the rule rather than explaining it. */
export const LANE_TIP = 'Ramps can\'t cross the moving target\'s track.';

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
export type TutStep = 'intro' | 'draw' | 'drop' | 'retry'
  /* the spring walkthrough, on first reaching level 10 */
  | 'springBag' | 'springRamp';

/* ============================================================
   INTRO CARDS

   A card that explains something NEW before the board becomes
   playable: title, one line, a drawn icon, "Got it". Queued, so
   several new things on one level come one after another. While
   any card is up, nothing can be drawn and nothing dropped.

   `onDone` runs when the card is dismissed - the spring card
   uses it to hand over the springs and start the walkthrough.
   ============================================================ */
export interface IntroCard {
  key: string;
  title: string;
  text: string;
  /** Which drawing the card shows - see ui/introIcons. */
  icon: string;
  onDone?: () => void;
  /** The board objects to pulse while this card is up. */
  highlight?: (lv: Level, simT: number) => Circle[];
  /** A WORLD card: bigger, in the world's own sky. */
  world?: { sky: [string, string, string]; accent: string };
}

/** What a finished level shows on the win card. */
export interface WinCard {
  stars: number; note: string; coins: number;
  isLast: boolean; nextId: number | null;
  /** Springs this win actually spent. Zero on all but a handful of boards. */
  springs: number;
  /** Whether the coins have been paid yet - the card offers "Collect" or the
      doubled ad first. `paid` is what actually landed. */
  collected: boolean;
  paid: number;
  /** During a Challenge Run: where the run is, and whether this win ended it. */
  challenge?: { at: number; of: number; balls: number; done: boolean; skin: string | null };
}

export class GameController {
  phase: Phase = 'plan';
  /* ============================================================
     TRIES, AND THIS LEVEL'S BALLS

     `tries` is every drop since the player ENTERED this level -
     across restarts and ad continues alike - and it is what the
     star rating reads, so restarting cannot wash out a bad run.
     It resets only on leaving the level (setLevel).

     `ballsLeft` is this level's own supply (RewardManager.ballsFor).
     A drop uses one; running out opens the choice to restart or
     continue. `restarts` counts restarts in this entry, for the
     "Stuck?" offer.
     ============================================================ */
  tries = 0;
  /** Intro cards waiting to be shown, in order - see IntroCard. */
  intros: IntroCard[] = [];
  /** How many cards this batch had, for the "1/2" dots. */
  introTotal = 0;
  /** Where the spring walkthrough is, or null when it is not running. */
  private springCoach = false;
  ballsLeft = 0;
  ballsMax = 0;
  restarts = 0;
  /* ============================================================
     THE CHALLENGE RUN

     While `challenge` is set, the world's levels are played in a
     row on ONE pool of CHALLENGE_BALLS (ballsLeft carries across
     them instead of being refilled per level). Running out sends
     the player back to the world's first level with a full pool.
     No hints, no spare ramps, no out-of-balls choice, no continue
     ad - and nothing is recorded: stars, coins and clears are
     never touched by a run. Picking a level from the picker ends
     it.
     ============================================================ */
  challenge: { id: number; from: number; to: number; name: string } | null = null;
  /* Whatever the engine produced. The controller never names a concrete
     ball class - see PhysicsEngine. */
  ball: BallState | null = null;
  capture: CaptureState | null = null;
  selected = -1;
  /** Which boxes this controller has already reacted to, this drop. */
  private boxSeen: boolean[] = [];
  /** Which of the player's RAMPS this drop has actually fired a spring on.
      Read straight off the engine, which is the only thing that knows: a
      spring fires on a real Matter contact, and a contact is not something
      this side can re-derive from a position. */
  private springFired: boolean[] = [];
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
  /* ============================================================
     THE PATROL CLOCK

     A moving target is already moving when its level appears -
     the player reads where it is and where it will be, and times
     the drop, the same way they plan around fire. So its clock
     does not wait for the ball: it starts at 0 on level entry
     and runs at the simulation's own rate (steps, 60 a second)
     while the player plans.

     A drop starts at t0 = the clock, floored to a whole step, and
     the engine takes over from there (BallState.t0): the target
     never jumps at the moment of release. When the drop ends the
     clock resumes from wherever the target had got to.

     DETERMINISTIC. Nothing here reads the wall clock into the
     physics except through t0, and t0 is an integer the solver
     sweeps over. Entering a level always starts the patrol from
     the same phase, and Replay re-drops at the SAME t0 as the
     drop it replays, so a replay of a win is the same win.
     ============================================================ */
  private patrolClock = 0;
  /** The t0 of the last drop - what Replay drops at again. */
  private lastT0 = 0;
  /** The patrol clock as it stands, and the phase Replay would use. Read by
      the test hook; nothing in the game needs them from outside. */
  get patrolT(): number { return this.patrolClock; }
  get replayT0(): number { return this.lastT0; }
  /** Put the patrol clock somewhere exact. Test hook only: a UI test has to
      be able to drop at a known phase rather than whenever the page got to. */
  setPatrolClock(t: number): void { if (this.phase === 'plan') this.patrolClock = Math.max(0, t); }
  private last = 0;
  private raf = 0;
  private seenHit = 0;
  private seenBroke = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bumped on every change the UI should re-read. React subscribes to this. */
  version = 0;
  private listeners = new Set<() => void>();

  /* ============================================================
     THE RENDER STATE'S SCRATCH

     renderState() is built ONCE PER FRAME and read synchronously
     by the renderer, which keeps nothing: so the parts of it that
     used to be freshly allocated every frame - the gotBox array,
     the tutorial wrapper, the deleteButtonAt closure - are reused
     buffers instead. Same values, no per-frame garbage.

     Anything that wants to KEEP one of these past the frame has
     to copy it, which is what debugHook already does.
     ============================================================ */
  private readonly gotBoxScratch: boolean[] = [];
  private readonly tutorialScratch: { step: TutStep | null } = { step: null };
  private static readonly NO_GOT: readonly boolean[] = [];
  private readonly deleteButtonAt = (s: Segment) => this.levels.deleteButtonAt(s);

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
    for (const e of ['coins:changed', 'ramps:changed',
                     'springs:changed', 'spin:granted', 'cosmetics:changed'] as const)
      bus.on(e, () => this.changed());
  }

  /** Whether a drag on empty board may start a ramp at all: this level's own
      budget, or a spare in the drawer to cover it. Read by the canvas before
      a draft begins and by the caption that offers the gesture. */
  get canDraw(): boolean {
    return this.phase === 'plan' && !this.intros.length &&
           (this.levels.canPlaceRamp || this.spareAvailable);
  }

  /** Whether a spare ramp may be taken on THIS board right now: not on the
      first levels, at most SPARE_PER_LEVEL, and only if one is in the bag. */
  get spareAvailable(): boolean {
    return !this.challenge && this.sparesAllowed && this.levels.extraBudget < SPARE_PER_LEVEL
      && this.rewards.extraRamps > 0;
  }
  /** Spares are not a thing at all on the first few levels - the HUD hides
      them there. */
  get sparesAllowed(): boolean { return this.levels.level.id >= SPARE_FROM; }

  /** Whether the "Stuck?" offer is up: after STUCK_AFTER_RESTARTS restarts in
      this entry, once, until dismissed. */
  stuckDismissed = false;
  get stuckOffer(): boolean {
    return !this.challenge && this.restarts >= STUCK_AFTER_RESTARTS && !this.stuckDismissed
      && this.phase === 'plan' && !this.intros.length;
  }
  dismissStuck(): void { this.stuckDismissed = true; this.changed(); }

  /* ============================================================
     THE HINT

     One proven winning plan per level (levels/hints.data.ts, made
     by tools/genhints.mjs on the level's own seed). Showing it
     draws its ramps as a dashed ghost for the rest of this level
     ENTRY, and on a timed board pulses the drop point at the
     proven moment. It counts as help: the clear is capped at
     HELPED_MAX_STARS, like a spare ramp.

     Paying for it (the first one free, then an ad) is the UI's
     job; this only shows it.
     ============================================================ */
  hintShown = false;
  /** Whether this board has a hint, not yet shown this entry. */
  get hintAvailable(): boolean {
    return !this.challenge && !!HINTS[this.levels.level.id] && !this.hintShown;
  }
  showHint(): void {
    const h = HINTS[this.levels.level.id];
    if (!h || this.hintShown) return;
    this.hintShown = true;
    this.stuckDismissed = true;
    track('hint_used', { level: this.levels.level.id });
    // short: the caption is one line on a phone
    this.showFlash('Trace the dashed ramp' + (h.ramps.length > 1 ? 's' : '')
      + (h.ramps.some(r => r.spring) ? ' + spring' : '')
      + (h.t0 !== undefined ? ', drop on the pulse' : '') + '. Max 2★');
    this.changed();
  }

  /** Take a ramp off the board (its × button). If that brings the board back
      within its own budget, a reserved spare goes back to the bag. */
  removeRamp(i: number): void {
    this.levels.removeRamp(i);
    this.selected = -1;
    if (this.levels.releaseSpareIfUnused())
      this.showFlash('Spare ramp returned to your bag.');
    this.notifyRampsChanged();
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
    /* Checked BEFORE a spare can be spent: a ramp across a moving target's
       track is refused, and refusing it must not cost the player anything. */
    if (!this.levels.rampAllowed(d)) { this.showFlash(LANE_TIP); return false; }
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

  /** RESERVE a spare ramp for this board: its budget grows by one, but the
      bag is only charged if the level is WON with it (finish). Restarting,
      leaving, or removing it hands it back. */
  useExtraRamp(): boolean {
    if (this.phase !== 'plan' || !this.spareAvailable) return false;
    this.levels.extraBudget++;
    this.showFlash('Spare ramp in use - only spent if you win. Max 2 stars.');
    this.changed();
    return true;
  }

  /** How many of an item the inventory can hand out right now.

      RAMPS ARE NOT IN HERE, and that is the distinction the whole input model
      rests on: a ramp is drawn by hand, out of a per-level budget, and a
      spring is an owned thing taken out of a bag. One is the player's
      expressive tool, the other is scarce. */
  itemCount(kind: ItemKind): { left: number; spare: number } {
    switch (kind) {
      /* A spring has no level budget at all - every one of them is yours - so
         `left` is simply what is in the bag, minus any already fitted to a
         ramp on this board and waiting to find out whether they get spent. */
      case 'spring':
        return { left: Math.max(0, this.rewards.springs - this.levels.springsReserved),
                 spare: 0 };
    }
  }

  /** Whether the bag may show this item at all. Springs do not exist before
      level 10 - see RewardManager.springsUnlocked. */
  itemUnlocked(kind: ItemKind): boolean {
    return kind === 'spring' ? this.rewards.springsUnlocked : true;
  }

  /* ============================================================
     ARMING A SPRING

     The old item was PLACED: it came out of the bag as a bar of
     its own, landed in the middle of the board and was then
     dragged and turned into position. A spring has no position
     of its own - it goes on a ramp the player drew - so taking
     one out of the bag cannot put anything anywhere.

     What it does instead is ARM: the next tap on a ramp fits it.
     One tap, on the line they already drew, and the gesture is
     over. Tapping anywhere else puts the spring back.
     ============================================================ */
  armedSpring = false;

  /** Take one item out of the inventory. For the spring that means arming it
      for the next tap on a ramp; nothing is charged and nothing moves yet.
      False when there is nothing to give or the board is not in planning. */
  placeItem(kind: ItemKind): boolean {
    if (this.phase !== 'plan') return false;
    switch (kind) {
      case 'spring': {
        if (!this.itemUnlocked('spring')) return false;
        if (this.itemCount('spring').left <= 0) return false;
        if (this.levels.rampsUsed === 0) {
          this.showFlash('Draw a ramp first - a spring goes on one of yours.');
          return false;
        }
        this.armedSpring = true;
        this.selected = -1;
        this.dragging = null;
        this.bus.emit('item:placed', { kind, index: -1 });
        this.notifyRampsChanged();
        return true;
      }
    }
  }

  /** The armed spring meets a ramp. Returns true if it went on. */
  fitSpring(rampIx: number): boolean {
    if (!this.armedSpring) return false;
    this.armedSpring = false;
    if (!this.levels.springRamp(rampIx)) {
      this.showFlash('That ramp already has a spring.');
      this.notifyRampsChanged();
      return false;
    }
    this.selected = rampIx;
    this.showFlash('Spring fitted - that ramp now throws four times harder.');
    if (this.springCoach) this.endSpringCoach();
    this.notifyRampsChanged();
    return true;
  }

  /** Put an armed spring back in the bag without fitting it. */
  disarmSpring(): void {
    if (!this.armedSpring) return;
    this.armedSpring = false;
    this.notifyRampsChanged();
  }

  /* ============================================================
     PAYING FOR A SPRING

     Only from finish(), and finish() only runs on a win. That is
     most of the rule, and it is why this is not folded into
     placeItem the way a spare ramp's spend is: a spring that was
     fitted, missed, moved and dropped again has cost nothing at
     all, however many attempts that took.

     The rest of the rule is `springFired`: the drop has to have
     actually BOUNCED OFF it. Winning with one on a ramp in a
     corner the ball never touched is not a spring that worked,
     and charging for it would make "you only pay when it works"
     a lie in the one case a player would notice.

     Idempotent through the paid flags, so a Replay of a board
     already won cannot charge for the same spring twice.
     ============================================================ */
  private commitSprings(): number {
    let paid = 0;
    for (let i = 0; i < this.levels.rampsUsed; i++) {
      const r = this.levels.rampAt(i);
      if (!r?.spring || r.springPaid || !this.springFired[i]) continue;
      if (!this.rewards.spendSpring()) break;         // bag emptied elsewhere
      r.springPaid = true;
      paid++;
    }
    return paid;
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
    if (this.phase === 'plan') this.patrolClock += dt / STEP_MS;
    this.weather();
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

  /** The board's sound: rain on a storm level, a crackle where there is
      fire, and a thunder RUMBLE on every lightning strike - read off the same
      step clock the bolt is drawn on, so the two are in time. The CRACK is
      only for a strike that hits the ball (see reactToStep). */
  private lastStrike = -1;
  private lastRumble = -1;
  private weather(): void {
    const lv = this.levels.playLevel;
    Sound.setAmbience(lv.storm ? 'rain' : lv.fish && lv.fish.length ? 'water' : lv.fires.length ? 'fire' : 'none');
    if (!lv.storm) return;
    const simT = this.ball ? this.ball.t0 + this.ball.steps : this.patrolClock;
    const s = strikeAt(lv, simT);
    if (s && s.key !== this.lastRumble) { this.lastRumble = s.key; Sound.thunder(); }
  }

  /* Everything the physics RECORDED, turned into things you can see and hear.
     Driven from here, never from stepBall. */
  private reactToStep(b: BallState): void {
    const lv = this.levels.playLevel;

    /* Which sprung ramps have actually thrown the ball. Indexed by RAMP, and
       read straight off the engine for the reason above. */
    for (let k = 0; k < b.firedSpring.length; k++)
      if (b.firedSpring[k]) this.springFired[k] = true;

    /* a box the ball opened this step. Before the hit reaction, so a box sat
       against a wall pops on the frame it is touched rather than the one
       after the bounce. */
    for (let k = 0; k < b.gotBox.length; k++) {
      if (!b.gotBox[k] || this.boxSeen[k]) continue;
      this.boxSeen[k] = true;
      this.openBox(k, lv.boxes[k]);
    }

    // lightning that knocked the ball this step: that, and only that, cracks
    if (b.struck !== -1 && b.struck !== this.lastStrike) {
      this.lastStrike = b.struck;
      Sound.crack();
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
      if (b.hit.kind !== 'fire')
        Sound.bounce(b.hit.kind === 'obstacle' || b.hit.kind === 'breakable'
                     ? 'obstacle' : 'ramp');
      this.reactToHit(b.hit);
      /* The just-in-time obstacle tip, and the reason it needs its own flag:
         level 1 has no obstacles at all, so this can only ever fire on a later
         level - long after tutorialSeen has been set. */
      if (b.hit.kind === 'obstacle' && !this.rewards.obstacleTipSeen) {
        this.rewards.obstacleTipSeen = true;
        this.rewards.saveProgress();
        this.showFlash('Obstacles knock you off at an angle — try to avoid them.');
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

  /* ============================================================
     THE BOARD IGNORES A TAP THAT WAS MEANT FOR A BUTTON

     A card or panel that closes on a tap leaves the board under
     the finger. The second tap of a double-tap - or a quick
     follow-up tap on a button that has just gone - then lands on
     the board and draws or DROPS, spending a ball the player
     never meant to. So for a moment after anything that swaps
     the screen (a level change, a restart, a card or panel
     closing) the board's own pointer input is ignored.

     Only the board's input: drop() itself is not held, so the
     debug hook and the tests can still drop straight away.
     ============================================================ */
  private boardHoldUntil = 0;
  holdBoardInput(ms = 350): void {
    this.boardHoldUntil = Math.max(this.boardHoldUntil, performance.now() + ms);
  }
  get boardInputHeld(): boolean { return performance.now() < this.boardHoldUntil; }

  /* ---------------- the drop ---------------- */

  drop(): void {
    if (this.phase !== 'plan' || this.intros.length) return;
    /* Out of balls. Drop is deliberately left ENABLED for this: a dead grey
       button tells a player they are stuck without telling them what to do
       about it, so the press opens the restart / continue choice instead. */
    if (this.ballsLeft <= 0) { this.bus.emit('balls:empty', {}); this.changed(); return; }
    // the walkthrough's last step is this very tap
    this.tutDropping = this.tutorialStep() === 'drop';
    if (this.tutDropping) this.tutorialDone();
    this.tutRetry = false;

    this.capture = null; this.dragging = null; this.selected = -1;
    this.armedSpring = false; this.draft = null;
    this.hideFlash();
    /* DETERMINISTIC bounces: the obstacle scatter is seeded by the LEVEL,
       not rolled per drop, so the same ramps always give the same run - a
       miss means the ramps need changing, never that the dice were bad.
       Each level has its own seed, so the pattern differs board to board. */
    const seed = this.seedOverride !== null
      ? this.seedOverride : levelSeed(this.levels.level.id);
    this.releaseBall();
    const t0 = Math.floor(this.patrolClock);
    this.lastT0 = t0;
    this.ball = this.engine.createBall(this.levels.playLevel, seed, this.levels.sessionBroken, t0);
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0; this.lastStrike = -1;
    /* A box already opened - this session or a previous visit - must not pop
       again, so the run starts with those already accounted for. */
    this.boxSeen = this.levels.sessionBoxes.slice();
    // whether a spring fired is a fact about THIS drop, not the board
    this.springFired = [];
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.acc = 0;

    /* One of this level's balls per drop. A win ends the level, so in
       practice it is the misses that use them up. */
    this.ballsLeft = Math.max(0, this.ballsLeft - 1);
    this.tries++;
    this.setPhase('drop');
    this.bus.emit('drop:started', { level: this.levels.playLevel, seed, tries: this.tries });
  }

  /* A win is swallowed by the target first; the card waits for the animation.
     A miss does not stop the game at all - see missed(). */
  private land(result: DropResult): void {
    const b = this.ball!;
    // the patrol carries on from where the drop left it - see patrolClock
    this.patrolClock = b.t0 + b.steps;
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
    const c = targetAt(this.levels.playLevel, b.t0 + b.steps);
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
    if (result === 'burned') Sound.burn();
    if (result === 'eaten') Sound.chomp();
    // where the ball died, read before it is released
    const at = this.ball ? { x: this.ball.x, y: this.ball.y } : null;
    if (this.tutDropping) { this.tutRetry = true; this.tutDropping = false; }
    this.releaseBall();
    this.capture = null;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.squash.amt = 0; this.seenHit = 0; this.seenBroke = 0;
    /* The ball goes up in light: embers for fire, sparks for lightning.
       Two small bursts from the fixed particle pool (PARTICLE_MAX), so it
       costs nothing extra on a phone. */
    if (at && result === 'burned') {
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#ff4a12', 16, 3.4, Math.PI, 700, 2.6);
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#ffa800', 12, 2.4, Math.PI * 0.6, 900, 2.2);
    } else if (at && result === 'eaten') {
      // a cloud of bubbles where it was swallowed
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#ffffff', 14, 3.0, Math.PI, 700, 2.4);
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#3fb6e8', 12, 2.2, Math.PI, 800, 2.2);
    } else if (at && result === 'zapped') {
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#ffc400', 16, 4.6, Math.PI, 600, 2.6);
      this.renderer.particles.burst(at.x, at.y, 0, -1, '#2f8cff', 12, 3.4, Math.PI, 700, 2.2);
    }
    this.setPhase('plan');
    /* Fire says what it was, because a run that ends on contact with
       something looks like a bug unless the board names it. */
    this.showFlash(
      result === 'burned' ? 'Burned up! Fire ends the drop - go around it.'
      : result === 'zapped' ? 'Zapped! Lightning ends the drop - time it or go around it.'
      : result === 'eaten' ? 'Eaten! A fish got the ball - time your drop around it.'
      : result === 'timeout' ? 'Got stuck! Try readjusting your ramps.'
      : 'Missed! Try readjusting your ramps.');
    this.emitEnded(result);
    track('ball_lost', { level: this.levels.level.id, result, ballsLeft: this.ballsLeft, tries: this.tries });
    /* That was the last ball: offer the way on straight away, rather than
       waiting for a Drop press that can only lead there. In a Challenge Run
       there is no choice - the run starts again from the world's first level. */
    if (this.ballsLeft <= 0) {
      if (this.challenge) {
        const ch = this.challenge;
        this.ballsLeft = CHALLENGE_BALLS;
        this.setLevel(ch.from - 1, true);
        this.showFlash(`Out of balls - the ${ch.name} Challenge Run starts again from level ${ch.from}.`);
      } else this.bus.emit('balls:empty', {});
    }
  }

  /* ============================================================
     OUT OF BALLS: THE TWO WAYS ON

     continueLevel() - after a WATCHED rewarded ad (the panel only
     calls it on true): more balls, and the board exactly as it
     was, every ramp and spring where the player left them.

     restartLevel() - free and instant: a fresh board and a full
     set of balls. The drawn ramps are cleared; a spring fitted to
     one goes back to the bag with it, because a spring is only
     ever charged on a win. `tries` is NOT reset - see above.
     Never followed by an ad.
     ============================================================ */
  continueLevel(): void {
    this.holdBoardInput();
    if (this.phase !== 'plan') return;
    this.ballsLeft += CONTINUE_BALLS;
    this.ballsMax = Math.max(this.ballsMax, this.ballsLeft);
    this.showFlash(`+${CONTINUE_BALLS} balls - your ramps are right where you left them.`);
    this.changed();
  }

  restartLevel(): void {
    this.holdBoardInput();
    this.releaseBall();
    this.capture = null;
    this.winCard = null; this.pendingCard = null; this.gift = null;
    this.selected = -1; this.dragging = null; this.armedSpring = false; this.draft = null;
    this.levels.restartBoard();
    this.levels.setBoxesClaimed(this.rewards.boxClaimed(this.levels.levelIndex));
    this.boxSeen = []; this.springFired = [];
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.patrolClock = 0; this.lastT0 = 0; this.lastStrike = -1; this.lastRumble = -1;
    this.ballsMax = ballsFor(this.levels.level.id);
    this.ballsLeft = this.ballsMax;
    this.restarts++;
    track('level_restart', { level: this.levels.level.id, restarts: this.restarts, tries: this.tries });
    this.lastResult = null;
    this.hideFlash();
    this.setPhase('plan');
  }

  /* Only a win reaches here - it is the one moment that still earns a
     full-screen beat, with stars and the route on to the next level. */
  private finish(result: DropResult): void {
    this.lastResult = result;
    const lv = this.levels.level;
    /* THE ONE PLACE A SPRING IS SPENT. Before the clear is recorded, so the
       win card and the bag are already telling the same story by the time
       either is looked at. */
    const springsUsed = this.commitSprings();
    /* THE ONE PLACE A SPARE RAMP IS SPENT: a win that actually needed it. */
    const usedSpare = this.levels.extraBudget > 0 && this.levels.rampsUsed > this.levels.levelBudget;
    if (usedSpare) {
      this.rewards.spendExtraRamp();
      track('spare_ramp_used', { level: lv.id });
    }
    if (springsUsed > 0) track('spring_used', { level: lv.id, n: springsUsed });
    /* Judged against the level's OWN budget, not the one in force: a spare
       ramp bought from the drawer must not be able to buy a star with it. */
    /* A Challenge Run records nothing - see `challenge`. The card still shows
       the rating, worked out the same way. */
    const ch = this.challenge;
    const { stars, coins, note, firstClear } = ch
      ? { stars: starsFor(this.tries, this.levels.rampsUsed, this.levels.levelBudget),
          coins: 0, note: '', firstClear: false }
      : this.rewards.recordClear(
          this.levels.levelIndex, lv.id, this.levels.isLast,
          this.tries, this.levels.rampsUsed, this.levels.levelBudget,
          usedSpare ? 'spare' : this.hintShown ? 'hint' : null);
    let challenge: WinCard['challenge'];
    if (ch) {
      const done = lv.id >= ch.to;
      const skin = done ? this.rewards.completeChallenge(ch.id) : null;
      challenge = { at: lv.id - ch.from + 1, of: ch.to - ch.from + 1, balls: this.ballsLeft, done, skin };
      if (done) this.challenge = null;
    }

    track('level_win', { level: lv.id, stars, tries: this.tries, usedSpareRamp: usedSpare,
                         usedHint: this.hintShown, usedSpring: springsUsed > 0, firstClear });
    const card: WinCard = {
      stars, note, coins, isLast: this.levels.isLast,
      nextId: this.levels.isLast ? null : this.levels.levelIndex + 2,
      springs: springsUsed,
      collected: coins <= 0, paid: 0,
      challenge,
    };
    if (challenge?.done) card.isLast = true;      // the run ends here: no Next
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
    this.holdBoardInput();
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

  /* ============================================================
     COLLECTING A CLEAR

     The win card pays on the player's choice: "Collect N" or
     "Watch ad: collect 2N" (the UI calls this with doubled=true
     ONLY after a watched ad). Leaving the card any other way -
     Next, Replay, the level picker - collects the plain amount,
     so a clear can never go unpaid.
     ============================================================ */
  collectWin(doubled = false, onCard = true): void {
    const card = this.winCard ?? this.pendingCard;
    if (!card || card.collected) return;
    card.collected = true;
    /* Paid off the card, the coins fly from it and the counter waits for
       them. Paid on the way OUT (Next, Replay, the picker) there is no card
       left to fly from - so it is paid as a plain grant and the counter shows
       it at once, rather than sitting 8 seconds behind waiting for a flight
       that is never coming. */
    card.paid = this.rewards.payClear(card.coins, doubled, onCard ? 'clear' : 'grant');
    this.changed();
  }

  private emitEnded(result: DropResult): void {
    this.bus.emit('drop:ended', { result, level: this.levels.level,
                                  tries: this.tries, rampsUsed: this.levels.rampsUsed });
  }

  /* ---------------- level flow ---------------- */

  /** Enter level index `i`. `inChallenge` is the run moving itself on; any
      other call (the picker, a test) ends a Challenge Run. */
  setLevel(i: number, inChallenge = false): void {
    this.holdBoardInput();
    if (!inChallenge) this.challenge = null;
    this.collectWin(false, false);      // an uncollected clear is paid, never lost
    this.levels.setLevel(i);
    this.tutRetry = false; this.tutDropping = false;
    this.releaseBall();
    this.capture = null;
    this.selected = -1; this.dragging = null; this.lastResult = null;
    this.armedSpring = false; this.draft = null;
    this.boxSeen = []; this.springFired = [];
    this.winCard = null; this.pendingCard = null; this.gift = null;
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.renderer.invalidateBackdrop();
    track('level_start', { level: this.levels.level.id });
    this.tries = 0;
    this.restarts = 0;
    this.stuckDismissed = false;
    this.hintShown = false;
    if (this.challenge) {
      // the run's one pool carries across its levels
      this.ballsMax = CHALLENGE_BALLS;
    } else {
      this.ballsMax = ballsFor(this.levels.level.id);
      this.ballsLeft = this.ballsMax;
    }
    // every visit starts the patrol (and the storm) from the same phase
    this.patrolClock = 0; this.lastT0 = 0; this.lastStrike = -1; this.lastRumble = -1;
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
    this.intros = []; this.introTotal = 0;
    /* Reaching level 10 is what puts the first springs in the bag. It is a
       NEW POWER, so it gets a card before the board is playable - and the
       springs are credited when the card is dismissed, then flown in, then
       the walkthrough shows how to use one. */
    if (this.rewards.springGiftDue(this.levels.level.id)) {
      this.queueIntro({
        key: 'spring', icon: 'spring', title: 'New power: Spring!',
        text: 'Put it on a ramp you drew and the ball launches 4x harder. Only used up if you win.',
        onDone: () => {
          this.markSeen('spring');
          const n = this.rewards.claimSpringGift();
          if (n > 0) this.bus.emit('springs:gifted', { n });
          this.startSpringCoach();
        },
      });
    } else if (this.rewards.springGift && !this.rewards.springUnlockSeen
               && this.levels.level.id >= SPRING_UNLOCK_LEVEL) {
      // the walkthrough was interrupted last time - carry on with it
      this.startSpringCoach();
    }
    this.teachNewMechanics();
    this.teachSpringBoard();
    this.teachGiftBoard();
  }

  nextLevel(): void { this.setLevel(this.levels.levelIndex + 1, !!this.challenge); }

  /** Start a world's Challenge Run from its first level - only once every
      level of it has been cleared. */
  startChallenge(countryId: number): boolean {
    const c = COUNTRIES.find(k => k.id === countryId);
    if (!c || c.to - c.from + 1 < 20 || !this.rewards.worldCleared(c.from, c.to)) return false;
    this.setLevel(c.from - 1);                 // ends any other run first
    this.challenge = { id: c.id, from: c.from, to: c.to, name: c.name };
    this.ballsMax = CHALLENGE_BALLS;
    this.ballsLeft = CHALLENGE_BALLS;
    this.showFlash(`${c.name} Challenge Run: all ${c.to - c.from + 1} levels, ${CHALLENGE_BALLS} balls. No hints, no help.`);
    this.changed();
    return true;
  }

  /** Replay: drop the same layout again, at the same patrol phase, so it is
      the same drop, not a new roll. A replay of a cleared board follows the
      same few-balls rule as any visit, so it starts a fresh supply. */
  retry(): void {
    this.collectWin(false, false);
    this.patrolClock = this.lastT0;
    if (!this.challenge) {
      this.ballsMax = ballsFor(this.levels.level.id);
      this.ballsLeft = this.ballsMax;
    }
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

  /* ---------------- intro cards ---------------- */

  get intro(): IntroCard | null { return this.intros[0] ?? null; }
  /** 1-based position of the card on screen within its batch. */
  get introIndex(): number { return this.introTotal - this.intros.length + 1; }

  queueIntro(card: IntroCard): void {
    if (this.intros.some(c => c.key === card.key)) return;
    this.intros.push(card);
    this.introTotal++;
    this.changed();
  }

  /** "Got it" on the card on screen. */
  dismissIntro(): void {
    this.holdBoardInput();
    const card = this.intros.shift();
    if (!this.intros.length) this.introTotal = 0;
    card?.onDone?.();
    this.changed();
  }

  /* ---------------- the spring walkthrough ----------------

     Two coach steps, shown once: point at the bag ("tap Use"), then - once a
     spring is armed - at the player's ramp ("tap your ramp"). Fitting a spring
     finishes it; the coach's Skip ends it early. Either way it is recorded,
     and never runs again. */
  private startSpringCoach(): void {
    if (this.rewards.springUnlockSeen) return;
    this.springCoach = true;
    this.changed();
  }

  private endSpringCoach(): void {
    this.springCoach = false;
    this.rewards.springUnlockSeen = true;
    this.rewards.saveProgress();
    this.changed();
  }

  /* ---------------- teaching ---------------- */

  tutorialStep(): TutStep | null {
    if (this.phase !== 'plan' || this.intros.length) return null;
    /* only while there is a spring to use - an empty bag has nothing to Use,
       and the need-a-spring strip is the way on there instead */
    if (this.springCoach && (this.armedSpring || this.itemCount('spring').left > 0))
      return this.armedSpring ? 'springRamp' : 'springBag';
    if (this.levels.levelIndex !== 0) return null;
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
      // the spring coach's button is its Skip
      case 'springBag': case 'springRamp': this.endSpringCoach(); return;
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
  /** Skip ends the level-1 walkthrough and the on-contact obstacle tip. The
      intro cards are NOT skipped with it: each is one card, once, and it is
      the only place a new mechanic is explained before it matters. */
  tutorialSkip(): void {
    this.rewards.tutorialSeen = true;
    this.tutRetry = false;
    this.rewards.obstacleTipSeen = true;
    this.rewards.saveProgress();
    this.changed();
  }

  /* ============================================================
     "NEW THING" INTRO CARDS

     On entering a level: first, on the first visit to a new WORLD,
     its world card ("New here: ..."); then a card for every thing
     on this board the player has never been introduced to, in the
     registry's order (ui/glossary INTROS). Each is recorded in
     tipsSeen when its "Got it" is pressed, and never comes back on
     its own. The Info panel can replay a board's cards.
     ============================================================ */
  private introCtx(): IntroCtx {
    return { spares: this.sparesAllowed ? this.rewards.extraRamps : 0,
             hint: !!HINTS[this.levels.level.id] };
  }

  private markSeen(key: string): void {
    if (this.rewards.tipsSeen[key]) return;
    this.rewards.tipsSeen[key] = true;
    this.rewards.saveProgress();
  }

  private queueEntry(e: (typeof INTROS)[number], mark: boolean): void {
    this.queueIntro({ key: e.key, title: e.title!, text: e.intro!, icon: e.icon ?? '',
                      highlight: e.highlight,
                      onDone: mark ? () => this.markSeen(e.key) : undefined });
  }

  private teachNewMechanics(): void {
    if (!this.rewards.tutorialSeen) return;      // the ramp lesson comes first
    const lv = this.levels.level, seen = this.rewards.tipsSeen, ctx = this.introCtx();
    /* the world card, the first time a world after the first is entered */
    const country = this.levels.country, wkey = `world-${country.id}`;
    if (country.from > 1 && !seen[wkey]) {
      const inWorld = LEVELS.filter(l => l.id >= country.from && l.id <= country.to);
      const news = INTROS.filter(e => !seen[e.key] && e.key !== 'balls' && e.key !== 'spareRamp'
                                      && e.key !== 'hint' && inWorld.some(l => e.has(l, ctx)));
      this.queueIntro({ key: wkey, icon: '', title: `Welcome to ${country.name}!`,
                        text: news.length ? `New here: ${news.map(e => e.title!.replace(/^New power: /, '').replace(/!$/, '')).join(' + ')}`
                                          : 'A new world - same rules, harder boards.',
                        world: { sky: country.sky, accent: country.accent },
                        onDone: () => this.markSeen(wkey) });
    }
    for (const e of INTROS) {
      if (seen[e.key] || !e.has(lv, ctx)) continue;
      if (e.key === 'spring' && this.intros.some(c => c.key === 'spring')) continue;
      this.queueEntry(e, true);
    }
    this.devGuard();
  }

  /** The Info panel's "show this board's cards again". */
  replayIntros(): void {
    const lv = this.levels.level, ctx = this.introCtx();
    for (const e of INTROS) if (e.has(lv, ctx)) this.queueEntry(e, false);
  }

  /** DEV builds: warn about any entity on this board that no registry entry
      explains, so no future mechanic ships without a card. */
  private devGuard(): void {
    if (!import.meta.env?.DEV) return;
    for (const ent of this.levels.entities) {
      if (!GLOSSARY.some(g => g.covers?.includes(ent.kind)))
        console.warn(`[intro] level ${this.levels.level.id}: '${ent.kind}' has no glossary/intro entry`);
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
  private teachSpringBoard(): void {
    if (!this.levels.level.needsSpring) return;
    this.showFlash(this.rewards.springs > 0
      ? 'A plain ramp cannot reach this one - put a spring on yours.'
      : 'A plain ramp cannot reach this one - the shop has springs.');
  }

  /** Say so when the board's target holds a gift, every visit, until it has
      been taken. Announced after the spring line, which is the one that
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
      /* The patrol clock: during a drop, its start phase plus the steps run
         plus the part-step being interpolated, so the target slides instead
         of stepping; while planning, the planning clock itself, because the
         target is already moving - see patrolClock. */
      simT: this.ball ? this.ball.t0 + this.ball.steps + this.acc / STEP_MS : this.patrolClock,
      ball: this.ball,
      broken: this.ball ? this.ball.broken : this.levels.sessionBroken,
      got: this.ball ? this.ball.got : GameController.NO_GOT,
      gotBox: this.fillGotBox(),
      /* Asked of the LEDGER, not of the board: whether a wrapped target has
         already paid out is a fact about the save, and the one mid-win case -
         the gift is on screen being opened - still counts as taken, because
         claimGift() has already been called by then. */
      giftTaken: this.rewards.giftClaimed(this.levels.levelIndex),
      capture: this.capture,
      captureMs: CAPTURE_MS,
      squash: this.squash,
      deleteButtonAt: this.deleteButtonAt,
      /* Whether a spring is armed and waiting for a ramp to land on, so the
         board can say so while it is. */
      armedSpring: this.armedSpring,
      /* read from the same constants the hit-test uses: these were once
         literals, and the × was resized for the finger while still being
         painted at its old size */
      handleR: HANDLE_R,
      delR: DEL_R,
      tutorial: this.fillTutorial(),
      /* the hint's ghost ramps, while it is shown, and whether the drop point
         should pulse right now (a timed board at the proven moment) */
      hint: this.hintShown ? HINTS[lv.id]?.ramps ?? null : null,
      /* what the intro card on screen is about, pulsing on the board */
      introHighlight: this.intro?.highlight
        ? this.intro.highlight(this.levels.playLevel, this.patrolClock) : null,
      hintPulse: this.hintShown && this.phase === 'plan' && this.atHintMoment(),
    };
  }

  /** On a timed board: is the board back at the moment the hint was proven
      at? Only if EVERY clock on it is - within a few steps, since the drop
      itself is floored to a step. */
  private atHintMoment(): boolean {
    const h = HINTS[this.levels.level.id];
    if (!h || h.t0 === undefined) return false;
    const t = this.patrolClock;
    return boardCycles(this.levels.playLevel).every(P => {
      const d = (((t - h.t0!) % P) + P) % P;
      return Math.min(d, P - d) <= 3;
    });
  }

  /* OR-ed rather than taken from the ball: a box claimed on an earlier visit
     is open before this drop starts, and the live run only ever adds to that.
     Written into the scratch buffer, which is resized only when the board's
     box count actually changes. */
  private fillGotBox(): readonly boolean[] {
    const session = this.levels.sessionBoxes, out = this.gotBoxScratch;
    out.length = session.length;
    const live = this.ball;
    for (let i = 0; i < session.length; i++)
      out[i] = session[i] || !!(live && live.gotBox[i]);
    return out;
  }

  private fillTutorial(): { step: TutStep | null } {
    this.tutorialScratch.step = this.tutorialStep();
    return this.tutorialScratch;
  }

  /** The caption on the board: how to get a ramp on the first visit, how
      to drop after that. Null when the caption slot should stay empty. */
  get cue(): string | null {
    // the walkthrough's bubble does this job while it is up
    if (this.phase !== 'plan' || this.selected >= 0 || this.armedSpring
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
    if (this.armedSpring) return 'Tap one of your ramps to fit the spring.';
    if (this.selected >= 0) return 'Drag the middle to move it, an end to reshape it, × to remove it.';
    if (this.levels.rampsLeft <= 0 && !this.spareAvailable)
      return 'No ramps left — tap a ramp to adjust it, or tap empty board to drop.';
    return 'Drag to draw a ramp. Tap a ramp to adjust it, or empty board to drop.';
  }
}
