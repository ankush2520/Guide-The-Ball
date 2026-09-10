/* ============================================================
   TEST HOOK - used by the Playwright suite and the solver sweep
   in tools/genlevels.mjs.

   The shape is deliberately UNCHANGED from the original build:
   the generator proves every shipped level winnable against the
   real simulator through this surface, and a hook that drifted
   would quietly invalidate that proof.

   Split in two. The PHYSICS half is installed at module load and
   needs no game running, so a headless sweep never has to boot
   React. The GAME half is attached once the managers exist.
   ============================================================ */
import { LEVELS, WORLDS, worldOf, initLevel, buildWalls } from '../levels';
import type { Level, RawLevel, Segment } from '../levels/types';
import { Ball } from '../physics/Ball';
import { stepBall, simulate } from '../physics/simulate';
import * as C from '../physics/constants';
import { CAPTURE_MS } from '../render/constants';
import type { GameServices } from './GameContext';
import { starsFor, STARTING_BALLS, AD_REWARD, CLEAR_BONUS,
         SPIN_PRIZES, SPIN_COOLDOWN_MS, SPIN_MS } from '../managers/RewardManager';
import { BALLS_KEY, SPIN_KEY } from '../managers/ProgressStore';
import { STAR_N } from '../render/Starfield';
import { Ease } from '../render/Tweens';
import { Sound } from '../audio/Sound';

/* The generator injects candidates into scratch slots at the end of LEVELS,
   sweeps them with the real simulator, and only levels that pass are ever
   written into the shipped set. */
const scratchIx: number[] = [];

const physics = {
  LEVELS,
  WORLDS,
  worldOf,
  buildWalls,
  CONSTS: {
    W: C.W, H: C.H, BALL_R: C.BALL_R,
    GRAVITY: C.GRAVITY, TERMINAL_VY: C.TERMINAL_VY, MAX_VX: C.MAX_VX,
    MAX_SPEED: C.MAX_SPEED, RESTITUTION: C.RESTITUTION, MIN_BOUNCE: C.MIN_BOUNCE,
    SUBSTEPS: C.SUBSTEPS, MAX_STEPS: C.MAX_STEPS,
    REST_STEPS: C.REST_STEPS, REST_PX: C.REST_PX,
    OB_JITTER: C.OB_JITTER, OB_MAX_DEV: C.OB_MAX_DEV,
    MIN_RAMP: C.MIN_RAMP, MAX_RAMP: C.MAX_RAMP,
    RAMP_HT: C.RAMP_HT, WALL_HT: C.WALL_HT,
    CAPTURE_MS,
  },
  MECH: {
    SPEED_CAP: C.SPEED_CAP, SLIP_REST: C.SLIP_REST, PORTAL_CD: C.PORTAL_CD,
    STAR_R: C.STAR_R, WIND_CAP: C.WIND_CAP, RESTITUTION: C.RESTITUTION,
  },
  BALLS: { key: BALLS_KEY, start: STARTING_BALLS,
           adReward: AD_REWARD, clearBonus: CLEAR_BONUS.slice() },
  SPIN: { key: SPIN_KEY, cooldownMs: SPIN_COOLDOWN_MS, animMs: SPIN_MS,
          prizes: SPIN_PRIZES.map(p => ({ balls: p.balls, w: p.w })) },
  starsFor,

  /* The legacy argument order, kept exactly: (ramps, seed, levelIdx, broken).
     levelIdx is optional, as it was - the tuning rig calls simulate(ramps,
     seed) and expects the current level, which is level 1 headlessly. */
  simulate(ramps: Segment[], seed: number, levelIdx = 0, broken?: boolean[] | null) {
    return simulate(LEVELS[levelIdx], ramps, seed, broken);
  },

  /** A scratch slot at the end of LEVELS. */
  scratch(lv: RawLevel, slot = 0): number {
    const norm = initLevel(lv);
    slot = slot | 0;
    while (scratchIx.length <= slot) { LEVELS.push(norm); scratchIx.push(LEVELS.length - 1); }
    LEVELS[scratchIx[slot]] = norm;
    return scratchIx[slot];
  },

  /* Per-step samples of a whole drop. The isolation tests assert on the
     velocity curve itself rather than inferring a mechanic from where the
     ball happened to land. */
  trace(ramps: Segment[], seed: number, levelIdx: number, broken?: boolean[] | null) {
    const lv: Level = LEVELS[levelIdx];
    const b = new Ball(lv, seed >>> 0, broken);
    const out = [];
    while (!b.result && out.length < 900) {
      stepBall(b, lv, ramps);
      out.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, sp: Math.hypot(b.vx, b.vy),
                 boosts: b.boosts, teleports: b.teleports, stars: b.stars,
                 broken: b.broken.filter(Boolean).length });
    }
    return { result: b.result, steps: b.steps, samples: out };
  },
};

/** Install the half that needs no running game. */
export function installPhysicsHook(): void {
  (window as unknown as Record<string, unknown>).__gtb = { ...physics };
}

/** Attach the live-game half once the managers exist. */
export function installGameHook(s: GameServices): void {
  const { controller: c, levels, rewards } = s;
  const w = window as unknown as Record<string, unknown>;
  w.__gtb = {
    ...physics,

    /* With a game running, an omitted level index means the one on screen. */
    simulate(ramps: Segment[], seed: number, levelIdx?: number, broken?: boolean[] | null) {
      return physics.simulate(ramps, seed, levelIdx ?? levels.levelIndex, broken);
    },

    state() {
      const lv = levels.level;
      const b = c.ball;
      return {
        phase: c.phase, levelIndex: levels.levelIndex, levelId: lv.id,
        highest: rewards.highest,
        ramps: levels.rampSegments.map(r => ({ ...r })),
        maxBlocks: lv.maxBlocks, rampsLeft: levels.rampsLeft,
        walls: lv.walls.length, targetType: lv.targetType, target: lv.target,
        capturing: !!c.capture, selected: c.selected,
        dragging: c.dragging ? c.dragging.mode : null,
        tutorial: { step: c.tutorialStep(), seen: rewards.tutorialSeen,
                    obstacleTipSeen: rewards.obstacleTipSeen,
                    skipShown: !!document.getElementById('btn-skip'),
                    dropPulsing: !!document.getElementById('btn-drop')
                                    ?.classList.contains('tut-pulse'),
                    handT: c.tutHand.t },
        infoOpen: !!document.getElementById('infopanel'),
        infoText: document.getElementById('info-body')?.textContent ?? '',
        juice: { squash: c.squash.amt, tweens: c.tweens.count,
                 trail: c.renderer.trail.length, stars: STAR_N,
                 live: c.renderer.particles.live },
        draw: { x: c.renderer.lastDraw.x, y: c.renderer.lastDraw.y },
        tips: { ...rewards.tipsSeen },
        flash: c.flash, flashOn: !!c.flash,
        result: b ? b.result : c.lastResult,
        ball: b ? { x: b.x, y: b.y, px: b.px, py: b.py, vx: b.vx, vy: b.vy,
                    hits: b.hit.n, speed: b.speed } : null,
        mech: b ? { boosts: b.boosts, teleports: b.teleports, stars: b.stars,
                    broken: b.broken.slice() }
                : { broken: levels.sessionBroken.slice() },
      };
    },

    /* juice helpers, exercised in isolation by the suite */
    Ease,
    tween: (target: Record<string, number>, prop: string, from: number, to: number,
            dur: number, ease?: (t: number) => number, onDone?: () => void) =>
      c.tweens.add(target, prop as never, from, to, dur, ease ?? Ease.outQuad, onDone),
    burst: (x: number, y: number, nx: number, ny: number, color: string,
            n: number, speed: number, spread: number, lifeMs: number) =>
      c.renderer.particles.burst(x, y, nx, ny, color, n, speed, spread, lifeMs),

    audioMix: () => Sound.debugMix(),

    balls: () => rewards.balls,
    setBalls: (n: number) => rewards.setBallsForTest(n),
    clearBonus: (id: number) => rewards.clearBonus(id),
    cleared: () => ({ ...rewards.clearedLevels }),
    stars: () => ({ ...rewards.bestStars }),
    pickups: () => ({ ...rewards.bestPickups }),
    tries: () => c.tries,
    pickPrize: () => rewards.pickPrize(),
    spinInfo: () => {
      const el = (id: string) => document.getElementById(id);
      const cd = el('spin-cd');
      return { last: rewards.spinLast, ready: rewards.spinReady(),
               spinning: rewards.spinning,
               nextMs: rewards.msToSpin(),
               deg: rewards.wheelDeg,
               shown: rewards.spinShown,
               btnReady: !!el('btn-spin')?.classList.contains('ready'),
               panelOpen: !!el('spinpanel'),
               goDisabled: !!(el('btn-spin-go') as HTMLButtonElement | null)?.disabled,
               btnLocked: !!el('btn-spin')?.classList.contains('locked'),
               cdText: cd ? cd.textContent ?? '' : '',
               sub: el('spin-sub')?.textContent ?? '' };
    },

    ballInfo: () => {
      const buy = document.getElementById('btn-buy') as HTMLButtonElement | null;
      const drop = document.getElementById('btn-drop') as HTMLButtonElement | null;
      return { balls: rewards.balls,
               dropDisabled: !!drop?.disabled,
               stopShown: !!document.getElementById('noballs'),
               buyDisabled: buy ? buy.disabled : true,
               buyText: buy ? buy.textContent ?? '' : 'Buy Balls — Coming Soon' };
    },

    spinTarget(ix: number, from: number, jitter = 0) {
      const n = SPIN_PRIZES.length, segDeg = 360 / n;
      const aim = ix * segDeg + segDeg / 2 + jitter * (segDeg * 0.32);
      const want = (((-aim) % 360) + 360) % 360;
      let target = from + 5 * 360;
      target += (((want - (target % 360)) % 360) + 360) % 360;
      return target;
    },

    setSeed: (v: number | null) => { c.seedOverride = v === null ? null : (v >>> 0); },
    setRamps: (list: Segment[]) => {
      levels.clearRamps();
      for (const r of list) levels.addRamp({ ...r });
      c.notifyRampsChanged();
    },
    setLevel: (i: number) => c.setLevel(i),
    select: (i: number) => { c.selected = i; c.notifyRampsChanged(); },
    skipTutorial: () => c.tutorialSkip(),
    drop: () => c.drop(),
    clock: () => c.clock,

    reset() {
      levels.clearRamps();
      c.ball = null; c.draft = null; c.tries = 0;
      c.selected = -1; c.dragging = null; c.lastResult = null; c.winCard = null;
      c.renderer.trail.clear();
      c.renderer.particles.clear();
      c.squash.amt = 0;
      c.hideFlash();
      c.adjust();
    },

    /* Resets IN PLACE rather than reloading: a reload would tear down the
       page mid-suite and destroy Playwright's execution context. */
    clearProgress() {
      rewards.resetAll();
      c.setLevel(0);
      c.tries = 0;
    },
  };
}
