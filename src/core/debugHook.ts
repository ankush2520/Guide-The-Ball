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
import { LEVELS, COUNTRIES, countryOf, cityOf, cityIndex, initLevel, buildWalls, levelSeed } from '../levels';
import type { Level, RawLevel, Segment } from '../levels/types';
import { RAMP_LEN } from '../items/items';
import { createEngine, MatterEngine, MATTER_TUNED, MATTER_PURE } from '../physics/engines';
import * as C from '../physics/constants';
import { targetAt } from '../levels/target';
import { patrolLane, rampAllowed, layoutAllowed } from '../levels/patrol';
import { CAPTURE_MS } from '../render/constants';
import { VIEW_SCALE } from '../render/view';
import { DEL_OFF, DEL_R, DEL_GRAB } from '../managers/LevelManager';
import * as PAL from '../render/palette';
import type { GameServices } from './GameContext';
import { starsFor, BALLS_PER_LEVEL, BALLS_EXAM, CONTINUE_BALLS, ballsFor,
         STARTING_COINS, RAMP_PRICE, RAMP_BUNDLES,
         SPRING_PRICE, SPRING_BUNDLES, SPRING_UNLOCK_LEVEL, BOX_PRIZES,
         COIN_CLEAR, coinsFor,
         SPIN_PRIZES, SPIN_COOLDOWN_MS, SPIN_MS } from '../managers/RewardManager';
import { SPIN_KEY, WALLET_KEY } from '../managers/ProgressStore';
import { readEvents } from '../analytics/track';
import { STAR_N } from '../render/Starfield';
import { Ease } from '../render/Tweens';
import { Sound } from '../audio/Sound';

/* The generator injects candidates into scratch slots at the end of LEVELS,
   sweeps them with the real simulator, and only levels that pass are ever
   written into the shipped set. */
const scratchIx: number[] = [];

/* ============================================================
   A LAYOUT THE GAME WOULD REFUSE

   A ramp across a moving target's lane cannot be placed (see
   levels/patrol.ts), so no headless probe may count it either:
   every solver in the repo - the generator's sweep, the box
   placer, the suite - reaches the simulator through here, and a
   level proved with a ramp the player is not allowed to draw is
   not proved. Reported as its own result rather than as a miss,
   so a tool that cares can tell "refused" from "lost".
   ============================================================ */
const ILLEGAL = Object.freeze({
  result: 'illegal' as const, steps: 0, hits: 0, segHits: 0,
  spdMin: 0, spdMax: 0, vyMax: 0, restMin: 0, secs: 0,
  stars: 0, boosts: 0, springs: 0, boxes: 0,
  broken: [] as boolean[], bounces: [], x: 0, y: 0,
});

const physics = {
  LEVELS,
  COUNTRIES,
  countryOf,
  cityOf,
  cityIndex,
  buildWalls,
  /* The live board, which is NOT CONSTS.W: that is the design box every level
     is authored in and every proof was made against, and it never changes.
     This is the box the player actually gets, which is wider on a tablet. */
  board: () => ({ pad: C.BOARD.pad, w: C.BOARD.w, x0: C.BOARD.x0, x1: C.BOARD.x1 }),

  /* Headlessly switch profiles. The game sets this from the viewport; the
     harness sets it by hand, which is what lets tests/board.test.mjs prove
     the two boards agree about every solution. */
  setBoardPad: (pad: number) => C.setBoardPad(pad),

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
    /* The × that deletes a ramp. Published because the suite has to tap it,
       and a test that re-derives these from memory silently stops tapping the
       button the moment either one is retuned. */
    DEL_OFF, DEL_R, DEL_GRAB,
    /* How much smaller than the board the SCENE is painted (render/view.ts).
       Published because the suite drives the game by clicking design
       coordinates, and a mapping that ignored this would silently start
       tapping somewhere else on the level. */
    VIEW_SCALE,
  },
  /* The canvas palette, so the suite can hold the toon reskin to its own
     contrast rules rather than to a comment. */
  PALETTE: { INK: PAL.INK, OBSTACLE: PAL.OBSTACLE, TARGET: PAL.TARGET,
             RAMP: PAL.RAMP, WALL: PAL.WALL, BALL: PAL.BALL, BOOST: PAL.BOOST },
  isLightSky: (hex: string) => PAL.isLightSky(hex),
  MECH: {
    SPEED_CAP: C.SPEED_CAP, SLIP_REST: C.SLIP_REST,
    STAR_R: C.STAR_R, BOX_R: C.BOX_R, WIND_CAP: C.WIND_CAP, RESTITUTION: C.RESTITUTION,
    BOOST_GAIN: C.BOOST_GAIN, BOOST_CAP: C.BOOST_CAP, BOOST_STEPS: C.BOOST_STEPS,
    /* The SPRING's own mechanism, published beside the pads' so a test can
       hold each to its own rules rather than to numbers copied out of here. */
    SPRING_GAIN: C.SPRING_GAIN, SPRING_CAP: C.SPRING_CAP,
    SPRING_DECAY: C.SPRING_DECAY, SPRING_CD: C.SPRING_CD,
    BOOST_SUB_PX: C.BOOST_SUB_PX, BOOST_SUBSTEPS_MAX: C.BOOST_SUBSTEPS_MAX,
  },
  BALLS: { perLevel: BALLS_PER_LEVEL, exam: BALLS_EXAM, continueBalls: CONTINUE_BALLS },
  WALLET: { key: WALLET_KEY, startCoins: STARTING_COINS,
            rampPrice: RAMP_PRICE,
            springPrice: SPRING_PRICE,
            clearTable: COIN_CLEAR.map(r => r.slice()) },
  /* The spring and the box table, published so the suite can hold the shipped
     numbers to the rules rather than to numbers copied out of the UI.

     There is no builder here any more. The item has no shape of its own: a
     sprung ramp is a ramp with `spring: true` on it, which a headless probe
     writes onto whatever ramp it was going to draw anyway. */
  SPRING: { unlockLevel: SPRING_UNLOCK_LEVEL,
            gain: C.SPRING_GAIN, cap: C.SPRING_CAP,
            bundles: SPRING_BUNDLES.map(b => ({ ...b })) },
  BOX_PRIZES: BOX_PRIZES.map(p => ({ ...p })),
  SPIN: { key: SPIN_KEY, cooldownMs: SPIN_COOLDOWN_MS, animMs: SPIN_MS,
          prizes: SPIN_PRIZES.map(p => ({ kind: p.kind, n: p.n, w: p.w })) },
  starsFor,
  coinsFor,
  /* The patrol solved directly, so a test can check the curve itself rather
     than inferring it from where a ball happened to land. */
  targetAt,
  /** The seed the game drops every level with - what hints are proved on. */
  levelSeed,

  /* The legacy argument order, kept exactly: (ramps, seed, levelIdx, broken).
     levelIdx is optional, as it was - the tuning rig calls simulate(ramps,
     seed) and expects the current level, which is level 1 headlessly. */
  /* `t0` is the patrol clock at the moment of the drop (see BallState.t0),
     appended so every existing call keeps its meaning: omitted, a drop starts
     at the patrol's beginning, exactly as every level was proved. */
  simulate(ramps: Segment[], seed: number, levelIdx = 0, broken?: boolean[] | null, t0 = 0) {
    if (!layoutAllowed(LEVELS[levelIdx], ramps)) return ILLEGAL;
    return createEngine().simulate(LEVELS[levelIdx], ramps, seed, broken, t0);
  },

  /* The moving target's rules, so a tool can ask the same question the game
     asks before it spends a candidate - see levels/patrol.ts. */
  patrolLane,
  rampAllowed,
  layoutAllowed,

  /** Matter with every guard removed - see MATTER_PURE. */
  simulatePureMatter(ramps: Segment[], seed: number, levelIdx = 0) {
    return new MatterEngine(MATTER_PURE).simulate(LEVELS[levelIdx], ramps, seed, null);
  },

  MATTER: { tuned: MATTER_TUNED, pure: MATTER_PURE },

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
  trace(ramps: Segment[], seed: number, levelIdx: number, broken?: boolean[] | null, t0 = 0) {
    const lv: Level = LEVELS[levelIdx];
    if (!layoutAllowed(lv, ramps)) return { result: ILLEGAL.result, steps: 0, samples: [] };
    const engine = createEngine();
    const b = engine.createBall(lv, seed >>> 0, broken, t0);
    const out = [];
    while (!b.result && out.length < 900) {
      engine.step(b, lv, ramps);
      out.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, sp: Math.hypot(b.vx, b.vy),
                 boosts: b.boosts, springs: b.springs, stars: b.stars,
                 broken: b.broken.filter(Boolean).length });
    }
    const traced = { result: b.result, steps: b.steps, samples: out };
    engine.dispose?.(b);   // Matter holds a world per ball
    return traced;
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

    /* With a game running, `simulate` still means "what will THIS game do":
       same engine, but defaulting to the level on screen. A solution found
       here has to be one the live drop reproduces, or every headless probe in
       the suite is answering a different question from the one on screen. */
    simulate(ramps: Segment[], seed: number, levelIdx?: number, broken?: boolean[] | null, t0 = 0) {
      const lv = LEVELS[levelIdx ?? levels.levelIndex];
      if (!layoutAllowed(lv, ramps)) return ILLEGAL;
      return createEngine().simulate(lv, ramps, seed, broken, t0);
    },

    /** Pin the moving target's clock, so a test drops at a known phase. */
    setPatrolClock(t: number) { c.setPatrolClock(t); },

    state() {
      const lv = levels.level;
      const b = c.ball;
      return {
        phase: c.phase, levelIndex: levels.levelIndex, levelId: lv.id,
        highest: rewards.highest,
        ramps: levels.rampSegments.map(r => ({ ...r })),
        maxBlocks: lv.maxBlocks, rampsLeft: levels.rampsLeft,
        budget: levels.budget, extraBudget: levels.extraBudget,
        coins: rewards.coins, spareRamps: rewards.extraRamps,
        walls: lv.walls.length, targetType: lv.targetType, target: lv.target,
        /* Exactly what the renderer feeds the target entity, and the live
           position that comes out of it - so a test can assert on the drawn
           patrol rather than on a number it recomputed for itself. */
        simT: c.renderState().simT,
        patrolT: c.patrolT, replayT0: c.replayT0,
        targetNow: { ...targetAt(lv, c.renderState().simT) },
        capturing: !!c.capture, selected: c.selected,
        dragging: c.dragging ? c.dragging.mode : null,
        tutorial: { step: c.tutorialStep(), seen: rewards.tutorialSeen,
                    obstacleTipSeen: rewards.obstacleTipSeen,
                    skipShown: !!document.getElementById('btn-skip'),
                    /* step 2 used to be signalled by a pulsing Drop Ball
                       button; there is no button now, so the step itself is
                       the signal and `step` above already carries it */
                    dropPulsing: false },
        infoOpen: !!document.getElementById('infopanel'),
        settingsOpen: !!document.getElementById('settingspanel'),
        infoText: document.getElementById('info-body')?.textContent ?? '',
        juice: { squash: c.squash.amt, tweens: c.tweens.count,
                 trail: c.renderer.trail.length, stars: STAR_N,
                 live: c.renderer.particles.live },
        draw: { x: c.renderer.lastDraw.x, y: c.renderer.lastDraw.y },
        tips: { ...rewards.tipsSeen },
        flash: c.flash, flashOn: !!c.flash,
        result: b ? b.result : c.lastResult,
        ball: b ? { x: b.x, y: b.y, px: b.px, py: b.py, vx: b.vx, vy: b.vy, t0: b.t0,
                    hits: b.hit.n, speed: b.speed } : null,
        mech: b ? { boosts: b.boosts, springs: b.springs, stars: b.stars,
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

    /* this LEVEL's balls - there is no tank any more */
    /** The tracking ring buffer (Part K), oldest first. */
    events: () => readEvents(),
    balls: () => c.ballsLeft,
    setBalls: (n: number) => { c.ballsLeft = Math.max(0, n | 0); },
    ballsFor: (id: number) => ballsFor(id),
    restartLevel: () => c.restartLevel(),
    continueLevel: () => c.continueLevel(),
    coins: () => rewards.coins,
    spareRamps: () => rewards.extraRamps,
    setWallet: (coins: number, ramps: number, springs?: number) =>
      rewards.setWalletForTest(coins, ramps, springs),
    wallet: () => ({ coins: rewards.coins, ramps: rewards.extraRamps,
                     springs: rewards.springs }),
    /** Slide a ramp, which is what a drag on its middle does. */
    moveRamp: (ix: number, dx: number, dy: number) => {
      levels.moveRampBy(ix, dx, dy);
      c.notifyRampsChanged();
    },
    buyRamps: (n: number) => rewards.buyRamps(n),
    buySprings: (n: number) => rewards.buySprings(n),
    springCost: (n: number) => rewards.springCost(n),
    /* Everything about the booster item in one read: what is owned, what is
       on this board, whether the shop and the bag may show it at all. */
    springInfo: () => ({
      owned: rewards.springs,
      unlocked: rewards.springsUnlocked,
      gifted: rewards.springGift,
      fitted: levels.springsUsed,
      paid: levels.springsPaid,
      free: c.itemCount('spring').left,
      armed: c.armedSpring,
      /** Which ramp indices carry one. */
      onRamps: levels.rampList
        .map((r: Segment, i: number) => (r.spring ? i : -1)).filter((i: number) => i >= 0),
      /* Which of them the LIVE ball has fired off, straight off the engine -
         the same array the controller charges from. */
      fired: c.ball ? c.ball.firedSpring.slice() : [],
      inShop: !!document.getElementById('shop-springs-head'),
      inBag: !!document.getElementById('btn-item-spring'),
    }),
    /** Arm one, exactly as the bag's Use button does. */
    takeSpring: () => c.placeItem('spring'),
    /** ...and land it on a ramp, exactly as the next tap would. */
    fitSpring: (rampIx: number) => c.fitSpring(rampIx),
    unfitSpring: (rampIx: number) => {
      const owed = levels.unspringRamp(rampIx);
      c.notifyRampsChanged();
      return owed;
    },
    /* Mystery boxes: what this board carries, what has been claimed, and the
       table a given level is allowed to roll on. */
    boxInfo: () => ({
      onBoard: levels.level.boxes.map(b => ({ ...b })),
      open: levels.sessionBoxes.slice(),
      claimed: { ...rewards.claimedBoxes },
      claimedHere: rewards.boxClaimed(levels.levelIndex),
      table: rewards.boxTableFor(levels.level.id).map(p => ({ ...p })),
      ballBoxes: c.ball ? c.ball.boxes : 0,
    }),
    rollBox: (levelId: number, rnd?: number) =>
      ({ ...rewards.rollBoxPrize(levelId, rnd) }),
    /* The gift in a target: whether this board has one, whether it is still
       there, and what the reveal is showing right now. One read, so a test can
       follow the whole beat without knowing which component draws it. */
    giftInfo: () => ({
      wrapped: !!levels.level.targetGift,
      claimed: { ...rewards.claimedGifts },
      claimedHere: rewards.giftClaimed(levels.levelIndex),
      showing: c.gift ? { ...c.gift } : null,
      panelOpen: !!document.getElementById('giftpanel'),
      takeDisabled:
        !!(document.getElementById('btn-gift-take') as HTMLButtonElement | null)?.disabled,
      prizeText: document.getElementById('gift-prize')?.textContent ?? '',
      /* The win card is HELD while a gift is up - see GameController.gift - so
         these two say whether the two beats are correctly sequenced. */
      cardOpen: !!document.getElementById('card'),
      winCard: c.winCard ? { ...c.winCard } : null,
    }),
    takeGift: () => {
      const btn = document.getElementById('btn-gift-take') as HTMLButtonElement | null;
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    },
    /* Mark this level's box already taken, so a drop that happens to route
       through it pays nothing. Tests that measure the BALL a drop costs need
       that: a box paying five balls mid-flight is a real thing that happens
       to a player, and it is not what those tests are asking about. */
    claimBox: () => rewards.claimBox(levels.levelIndex),
    bonusSpins: () => rewards.bonusSpins,
    grantBonusSpin: (n = 1) => rewards.grantBonusSpin(n),
    /* The shop's table and the prices it charges, so a test can check the two
       against each other rather than against numbers copied out of the UI. */
    RAMP_BUNDLES,
    rampCost: (n: number) => rewards.rampCost(n),
    useExtraRamp: () => c.useExtraRamp(),
    budget: () => ({ level: levels.levelBudget, inForce: levels.budget,
                     left: levels.rampsLeft, extra: levels.extraBudget }),
    cleared: () => ({ ...rewards.clearedLevels }),
    stars: () => ({ ...rewards.bestStars }),
    pickups: () => ({ ...rewards.bestPickups }),
    tries: () => c.tries,
    pickPrize: () => rewards.pickPrize(),
    /* The suite turns the self-opening wheel OFF at boot: a modal that can
       appear on a timer makes every other test in the file flaky. */
    setAutoSpin: (on: boolean) => {
      (window as unknown as Record<string, unknown>).__gtbNoAutoSpin = !on;
    },
    /* btnReady/btnLocked read the GEAR, not the wheel's own button: the wheel
       moved into the settings panel, so its button only exists while that
       panel is open, and the thing the player can actually see from the
       board is the gear wearing the wheel's state. cdText still comes from
       the wheel's row, which is where the countdown is now written. */
    spinInfo: () => {
      const el = (id: string) => document.getElementById(id);
      const cd = el('spin-cd');
      const gear = el('btn-settings');
      return { last: rewards.spinLast, ready: rewards.spinReady(),
               spinning: rewards.spinning,
               nextMs: rewards.msToSpin(),
               dailyReady: rewards.dailyReady(),
               bonus: rewards.bonusSpins,
               deg: rewards.wheelDeg,
               shown: rewards.spinShown ? rewards.spinShown.n : 0,
               shownKind: rewards.spinShown ? rewards.spinShown.kind : null,
               btnReady: !!gear?.classList.contains('ready'),
               offered: rewards.spinOffered,
               wouldOffer: rewards.shouldOfferSpin(),
               autoSpin: !(window as unknown as Record<string, unknown>).__gtbNoAutoSpin,
               panelOpen: !!el('spinpanel'),
               settingsOpen: !!el('settingspanel'),
               goDisabled: !!(el('btn-spin-go') as HTMLButtonElement | null)?.disabled,
               btnLocked: !!gear?.classList.contains('locked'),
               badge: !!gear?.querySelector('.dot'),
               cdText: cd ? cd.textContent ?? '' : '',
               sub: el('spin-sub')?.textContent ?? '' };
    },

    ballInfo: () => {
      return { balls: c.ballsLeft, max: c.ballsMax,
               /* the drop is a tap on the board now: it is refused by phase,
                  not by a disabled button */
               dropDisabled: c.phase !== 'plan',
               stopShown: !!document.getElementById('noballs') };
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
    tutorialNext: () => c.tutorialNext(),
    /** Take an item out of the bag, exactly as the tray does. */
    placeItem: (kind: 'spring' = 'spring') => c.placeItem(kind),
    /* Drawing a ramp, as one gesture rather than three calls - the suite
       drives the real pointer handlers as well, and this is for the places
       that only need a ramp on the board. */
    drawRamp: (x1: number, y1: number, x2: number, y2: number) => {
      c.beginDraft({ x: x1, y: y1 });
      c.updateDraft({ x: x2, y: y2 });
      return c.commitDraft();
    },
    draft: () => (c.draft ? { ...c.draft } : null),
    canDraw: () => c.canDraw,
    RAMP_LEN,
    drop: () => c.drop(),
    /** The win card's Replay: the same layout, dropped at the same phase. */
    retry: () => c.retry(),
    clock: () => c.clock,

    reset() {
      levels.clearRamps();
      c.ball = null; c.tries = 0;
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
