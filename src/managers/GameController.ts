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
import type { GameBus, Phase } from '../core/events';
import { LevelManager } from './LevelManager';
import { RewardManager } from './RewardManager';
import type { BallState, PhysicsEngine } from '../physics/PhysicsEngine';
import { Renderer, type CaptureState, type Squash } from '../render/Renderer';
import { TweenSystem, Ease } from '../render/Tweens';
import { CAPTURE_MS, STEP_MS_DEFAULT } from '../render/constants';
import { Sound } from '../audio/Sound';
import { clamp } from '../physics/math';
import { TERMINAL_VY } from '../physics/constants';
import type { DropResult, Hit } from '../physics/types';
import { targetAt } from '../levels/target';
import type { Level, Segment } from '../levels/types';

const STEP_MS = STEP_MS_DEFAULT;
const FLASH_MS = 2600;

const HIT_COLOR: Record<string, string> = {
  ramp: '#3ec8ff', wall: '#c3ccdd', obstacle: '#ff6b78',
  breakable: '#ffb066', booster: '#7dffd4', portal: '#d8a0ff',
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
];

/** What a finished level shows on the win card. */
export interface WinCard {
  stars: number; note: string; bonus: number; coins: number;
  isLast: boolean; nextId: number | null;
}

export class GameController {
  phase: Phase = 'plan';
  tries = 0;
  /* Whatever the engine produced. The controller never names a concrete
     ball class - see PhysicsEngine. */
  ball: BallState | null = null;
  capture: CaptureState | null = null;
  draft: Segment | null = null;
  selected = -1;
  dragging: { mode: 'p1' | 'p2' | 'move'; ix: number; lx: number; ly: number } | null = null;
  /** Forces a seed, for tests and the solver. null means a fresh random one. */
  seedOverride: number | null = null;

  lastResult: DropResult | null = null;
  winCard: WinCard | null = null;
  flash = '';

  readonly squash: Squash = { amt: 0, nx: 0, ny: -1 };
  readonly tweens = new TweenSystem();

  /* The mimed drag on level 1. Both halves - the glide and the beat between
     loops - ride the same tween helper the bounce juice uses. */
  readonly tutHand = { t: 0, gap: 0 };
  private tutLooping = false;

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
    for (const e of ['balls:changed', 'coins:changed', 'ramps:changed'] as const)
      bus.on(e, () => this.changed());
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
        this.engine.step(b, this.levels.level, this.levels.rampSegments);
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
    const lv = this.levels.level;

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
    // steps 1 and 2 have both happened: a ramp went down, and this is the tap
    if (this.tutorialStep() === 2) this.tutorialDone();

    this.draft = null; this.capture = null; this.dragging = null; this.selected = -1;
    this.hideFlash();
    const seed = this.seedOverride !== null
      ? this.seedOverride : (Math.random() * 0x7fffffff) | 0;
    this.releaseBall();
    this.ball = this.engine.createBall(this.levels.level, seed, this.levels.sessionBroken);
    this.seenHit = 0; this.seenBroke = 0; this.squash.amt = 0;
    this.renderer.particles.clear(); this.renderer.trail.clear();
    this.acc = 0;

    /* one ball per press, win or lose: what costs is throwing it, not the
       result. Committed before the drop runs, so an interrupted run still
       paid. */
    this.rewards.spendBall();
    this.tries++;
    this.setPhase('drop');
    this.bus.emit('drop:started', { level: this.levels.level, seed, tries: this.tries });
  }

  /* A win is swallowed by the target first; the card waits for the animation.
     A miss does not stop the game at all - see missed(). */
  private land(result: DropResult): void {
    const b = this.ball!;
    // a block broken this run stays broken for the next drop
    this.levels.sessionBroken = b.broken.slice();
    this.rewards.recordPickups(this.levels.levelIndex, b.stars);

    if (result !== 'win') { this.missed(result); return; }
    /* Where the target WAS when the ball reached it. On a patrolling board
       the authored centre is only its start, and swallowing the ball toward
       that would drag it sideways to a place the target had already left. */
    const c = targetAt(this.levels.level, b.steps);
    Sound.win();
    this.setPhase('capture');
    this.capture = { t: 0, bx: b.x, by: b.y, cx: c.x, cy: c.y };
    // the same particle helper, pointed straight up and fanned all the way round
    this.renderer.particles.burst(b.x, b.y, 0, -1, '#7dffb4', 14, 3.0, Math.PI, 420);
    this.bus.emit('ball:captured', { level: this.levels.level });
  }

  /* A losing drop: say what went wrong above the board, put the ball back on
     the spawn, and return to planning at once. The player's ramps are left
     exactly where they put them so the next move is an adjustment, not a
     rebuild. No overlay, no button to dismiss. */
  private missed(result: DropResult): void {
    this.lastResult = result;
    this.releaseBall();
    this.capture = null; this.draft = null;
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
    /* Judged against the level's OWN budget, not the one in force: a spare
       ramp bought from the drawer must not be able to buy a star with it. */
    const { stars, bonus, coins, note, firstClear } = this.rewards.recordClear(
      this.levels.levelIndex, lv.id, this.levels.isLast,
      this.tries, this.levels.rampsUsed, this.levels.levelBudget);

    this.winCard = {
      stars, note, bonus, coins, isLast: this.levels.isLast,
      nextId: this.levels.isLast ? null : this.levels.levelIndex + 2,
    };
    this.capture = null;
    this.setPhase('over');
    this.hideFlash();
    this.bus.emit('level:cleared',
      { level: lv, index: this.levels.levelIndex, stars, firstClear });
    this.emitEnded(result);
  }

  private emitEnded(result: DropResult): void {
    this.bus.emit('drop:ended', { result, level: this.levels.level,
                                  tries: this.tries, rampsUsed: this.levels.rampsUsed });
  }

  /* ---------------- level flow ---------------- */

  setLevel(i: number): void {
    this.levels.setLevel(i);
    this.releaseBall();
    this.capture = null; this.draft = null;
    this.selected = -1; this.dragging = null; this.lastResult = null;
    this.winCard = null;
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
    this.teachNewMechanics();
    this.syncTutorial();
  }

  nextLevel(): void { this.setLevel(this.levels.levelIndex + 1); }

  /** Replay: drop the same layout again, which costs a ball like any drop. */
  retry(): void { this.setPhase('plan'); this.winCard = null; this.drop(); }

  /** Put the board back in the player's hands with the ramps untouched, and
      no ball spent. It was the win card's Adjust button until that card was
      cut to two choices; it stays because it is also how a reset returns to
      planning - see debugHook.reset(). */
  adjust(): void { this.releaseBall(); this.winCard = null; this.setPhase('plan'); }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.bus.emit('phase:changed', { phase: p });
    this.changed();
  }

  /* ---------------- teaching ---------------- */

  tutorialStep(): 0 | 1 | 2 {
    if (this.rewards.tutorialSeen || this.levels.levelIndex !== 0 || this.phase !== 'plan')
      return 0;
    return this.levels.rampsUsed === 0 ? 1 : 2;
  }

  /** One loop of the mimed drag, then a beat, then again. */
  private tutHandLoop = (): void => {
    if (this.tutorialStep() !== 1) { this.tutLooping = false; return; }  // player moved on
    this.tutLooping = true;
    this.tweens.add(this.tutHand, 't', 0, 1, 1400, Ease.inOutQuad, () => {
      this.tweens.add(this.tutHand, 'gap', 0, 1, 420, Ease.linear, this.tutHandLoop);
    });
  };

  /** Undoing the first ramp drops back to step 1, so the mime has to be able
      to restart from wherever the last cycle left it. */
  syncTutorial(): void {
    if (this.tutorialStep() === 1 && !this.tutLooping) this.tutHandLoop();
  }

  tutorialDone(): void {
    if (this.rewards.tutorialSeen) return;
    this.rewards.tutorialSeen = true;
    this.rewards.saveProgress();
    this.changed();
  }

  /** Skip means skip all of it, the just-in-time obstacle tip included. */
  tutorialSkip(): void {
    this.rewards.tutorialSeen = true;
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

  notifyRampsChanged(): void { this.syncTutorial(); this.changed(); }

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
      capture: this.capture,
      captureMs: CAPTURE_MS,
      squash: this.squash,
      deleteButtonAt: (s: Segment) => this.levels.deleteButtonAt(s),
      handleR: 7,
      delR: 12,
      tutorial: { step: this.tutorialStep(), t: this.tutHand.t },
    };
  }

  /** The hint line under the board - a read-only view of state. */
  get hint(): string {
    if (this.tutorialStep() === 2) return 'Tap Drop Ball when ready.';
    if (this.phase === 'drop' || this.phase === 'capture') return 'Watching the drop…';
    if (this.phase === 'over') return 'Replay drops this same layout again. Next moves on.';
    if (this.selected >= 0) return 'Drag an end to reshape, the middle to move, × to delete.';
    if (this.levels.rampsLeft <= 0)
      return this.rewards.extraRamps > 0
        ? 'No ramps left — tap Ramps to spend a spare, or drop the ball.'
        : 'No ramps left — tap one to edit or delete it, or drop the ball.';
    return 'Drag on the board to draw a ramp. Tap a ramp to edit it.';
  }
}
