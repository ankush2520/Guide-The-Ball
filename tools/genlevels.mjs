/**
 * Semi-procedural level generation with solver verification.
 *
 *   node tools/genlevels.mjs 2            # generate world 2, report, write nothing
 *   node tools/genlevels.mjs 2 --write    # ...and splice it into the level data
 *
 * Nothing reaches index.html until it has PROVED, in the real simulator, that
 * it is winnable on every obstacle seed, not winnable by accident, and not
 * won by luck off a random bounce. A template that cannot produce a passing
 * level is reported as a template problem - never shipped unverified.
 */
import { chromium } from 'playwright';
import esbuild from 'esbuild';
import { attachHarness } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* How far each glow reaches, read from the file the entities DRAW with - see
   src/render/glow.ts. Bundled rather than copied, so a bloom widened there
   is given room by the next regeneration without anyone editing this file. */
const { FIRE_GLOW, TARGET_GLOW, GLOW_PAD, BALL_R } = await (async () => {
  const out = await esbuild.build({ stdin: { contents: `export * from './src/render/glow';
                                                        export { BALL_R } from './src/physics/constants';`,
                                             resolveDir: root, loader: 'ts' },
                                    bundle: true, write: false, format: 'esm', platform: 'node' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
})();
/* THE PASSABLE GAP. Between any two hazards - obstacle, fire or breakable,
   same kind or not - the edge-to-edge gap is at least the ball's diameter,
   so every gap on a board is one the ball can actually be routed through.
   Anything narrower is not an obstacle, it is a dead zone: measured in the
   simulator, a straight drop between two obstacles is blocked on every seed
   at a 16px gap and gets through on every seed at 17px and up. Read from
   BALL_R, never typed, so a resized ball resizes the rule.
   tools/checkSpacing.mjs holds every shipped level 1-40 to it. */
const MIN_GAP = 2 * BALL_R;
const WORLD = Number(process.argv[2]);
const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');
const DUMP = (process.argv.find(a => a.startsWith('--dump=')) || '').slice(7);
/* --only=35-39 generates just those ids, for iterating on one stretch of a
   country. Dry runs only: a write always regenerates the whole country, so
   the spread check between targets sees every one of them. */
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split('-').map(Number);
if (ONLY[0] && WRITE){ console.error('--only is for dry runs; --write regenerates the whole country'); process.exit(1); }
const W = 480, H = 800;

/* deterministic RNG, so a regeneration reproduces the same set exactly */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
/* The narrowest drop window, in steps, a patrolling board may be proved with:
   12 steps is 0.2s - a moment a player can see coming and tap inside, where
   one or two steps would be a frame-perfect reflex test. See verify(). */
const MIN_DROP_WINDOW = 12;
const rng  = (r, lo, hi) => lo + r() * (hi - lo);
const rint = (r, lo, hi) => Math.round(rng(r, lo, hi));

/* ---------------------------------------------------------------- */
/* Country specs. `make` builds a candidate; `gate` is what it must clear.
   Keyed by country id - country 1 is Verdholm (1-20), country 6 is
   Emberkeep (21-40). */
/* ---------------------------------------------------------------- */

/** Distance from a point to every existing circle, for overlap rejection.
    Used for keep-outs round a target, a star or the spawn; the pad is how
    much room THAT thing needs. Hazard to hazard goes through spaced(). */
function clear(pt, rad, list, pad = 12){
  return list.every(o => Math.hypot(o.x - pt.x, o.y - pt.y) > o.r + rad + pad);
}
/** Hazard to hazard: centres at least r1 + r2 + MIN_GAP apart, so the ball
    fits through between any two. */
function spaced(o, list){
  return list.every(q => Math.hypot(q.x - o.x, q.y - o.y) >= q.r + o.r + MIN_GAP);
}

const SPECS = {
  1: {
    name: 'Verdholm',
    /* ============================================================
       VERDHOLM - the first world, levels 1-20, ramps only

       It was hand-designed and frozen; it is generated now, by
       the same template-and-proof pipeline as every other world,
       because its density had to climb far past what twenty hand
       layouts carried (four obstacles at most).

       RAMPS ONLY, in spirit and in fact: the red obstacle is the
       only furniture, and it is the density driver. VERD_DENSITY
       is the curve - level N carries about N obstacles:

         1-3     1 -> 3, one ramp, a lesson each
         4-10    4 -> 9, two ramps, the field fills
         11-14   10 -> 13, the first walls round the target
         15-20   14 -> 18, the final exam (a patrol counts as one)

       SPACIOUS, NOT CLUSTERED. Obstacles are laid in horizontal
       bands down the whole play area, each band filled across the
       full width by best-candidate sampling, with FREE_GAP of air
       between any two - and a board that still leaves a third of
       itself empty is refused (covers). See the placement note
       above bandSpread().

       THE FINAL EXAM, 15-20: the same shape as every world's
       closing stretch (see Emberkeep's note, which measures why
       "top-middle" means the upper third). The target sits in the
       upper middle inside a cage of obstacles open only on the
       far side; the route goes out past it and back in; the gate
       proves every winning route crosses the board. The rest of
       the obstacles are spread evenly over what is left, not piled
       in one place.

       MOVING TARGETS on 17, 19 and 20 - where they first lived.
       Each has to matter (frozen, the route loses) and has to be
       fair (it wins across a drop window of MIN_DROP_WINDOW steps,
       because the target is already moving while you plan).
       ============================================================ */
    gate: (i, n) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const exam = verdPhase(i) === 'final';
      return { minTol: 3,
               /* the first three are lessons: a wide band and a board a
                  first-time player can win without being told how */
               maxTol: i < 3 ? 40 : 30 - 22 * t,
               maxBlind: i < 3 ? 0.35 : 0.06,
               maxSols2: Math.round(30 - 26 * t),
               requireTwoRamp: exam,
               requireCross: exam,
               moveMustMatter: true,
               minWindow: MIN_DROP_WINDOW,
               maxObHits: exam ? 1.6 : 1.4 };
    },
    make(r, i, n, taken){
      return verdPhase(i) === 'final' ? verdExam(r, i, taken) : verdField(r, i, taken);
    }
  },

  6: {
    name: 'Emberkeep',
    /* ============================================================
       EMBERKEEP - TWENTY cities, and the pacing pattern in full

       The country absorbed Solmesa, so it runs 21-40 and carries
       the whole difficulty arc of a world rather than half of
       one. Fire is the density-driver: a breakable is a hazard
       you are ALLOWED to spend a drop on, a fire is one you are
       not, and learning which is which is the country.

       DENSITY IS SCHEDULED, NOT RANDOM. EMBER_DENSITY below is
       the total hazard count per city - fires + obstacles +
       breakables, and a moving target counts as one - and it is
       the curve the world is built on:

         21        1   one fire in the fall line, nothing else
         22-34     2 -> 10, a steady climb, a step every city or two
         35-39     12 -> 17, the final exam
         40        the hand-tuned spring boss, kept as written

       THREE PHASES, keyed off the city index so the same shape
       works at any world length:

         21-27  early   the fire in the fall line; from 25 a second
                        fire, and breakables.
                        Target LOW and across the board.
         28-34  middle  a third fire, plain obstacles and the first
                        walls. Still low and across; the field
                        spreads over the whole board (bandSpread).
         35-39  final   THE FINAL EXAM, a different shape - below.

       THE FINAL EXAM. The target moves UP to the top-middle of
       the board and the hazards fill the board, so a drop has to
       travel the whole width: out to the far side and back in.

       "Top-middle" is the UPPER THIRD (y ~230-310), not the top
       edge, and that is physics, not caution: the ball tops out
       at terminal speed and keeps 90% of it on a bounce, so it
       climbs back less than ~90px. A target at the very top is
       reached before the ball ever descends into the field - the
       field is then scenery - or needs the spring (level 40 is
       exactly that board). Measured: a target in the upper third
       still has hundreds of two-ramp routes that go out to the
       far side and back, which is the route this layout is for.

       What makes it an exam and not "more of the same":
         - the fall-line fire burns the do-nothing drop;
         - a guard of hazards on the NEAR side of the target, and
           a lid over it, refuse the short diagonal from spawn;
         - a POCKET target is open only on the FAR side;
         - the far side and the flight line over the top are kept
           clear, so the long way round exists;
         - everything else is spread over the rest of the board,
           band by band across the full width, so a drop that
           comes in short or low meets it wherever it falls;
         - the gate proves the WINNING ROUTE CROSSES the board
           (requireCross): a route that reaches the target without
           going past its far side rejects the board.

       MOVING TARGETS are a tool here, not a rule: three middle
       cities (28, 31, 34 - EMBER_FIELD_MOVERS) and two of the final
       five (EMBER_MOVERS - 36, and 39 to close). A patrol has to matter - the
       winning route must lose against a frozen copy of the target
       - or the city is rejected as decoration.
       ============================================================ */
    gate: (i, n) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const exam = emberPhase(i) === 'final';
      return { minTol: 3,
               /* Down to a band barely wider than the floor by the close, so
                  a board that one ramp CAN solve has to be an exact one. */
               maxTol: 26 - 21 * t, maxBlind: 0.05,
               /* the same curve for two-ramp boards: plenty of routes early,
                  few by the close. Without this the back half is ungraded. */
               maxSols2: Math.round(28 - 25 * t),
               /* the closing stretch: two ramps minimum, by construction */
               requireTwoRamp: t >= 0.70,
               /* ...and the route has to go all the way round */
               requireCross: exam,
               /* a patrol that the winning route could ignore is decoration */
               moveMustMatter: true,
               /* ...and one that needs a frame-perfect drop is a reflex test */
               minWindow: MIN_DROP_WINDOW,
               requireFire: true,
               /* a packed board brushes a hazard now and then; the cap is
                  still what keeps a winning route from being a pinball run */
               maxObHits: exam ? 1.6 : 1.4 };
    },
    make(r, i, n, taken){
      return emberPhase(i) === 'final' ? emberExam(r, i, taken) : emberField(r, i, taken);
    }
  },

  /* ---------------------------------------------------------------- */
  /* The remaining ten countries. Every mechanic they use was already
     built and shipped - what was missing was only the level data, which
     is why these are specs and not engine work. */
  /* ---------------------------------------------------------------- */

  /* 3 - Windemere (41-60) is NOT generated here. Its cities are placed
     directly by tools/windLevels.mjs (41-56, Emberkeep's layouts with wind)
     and tools/ovalLevels.mjs --only=57-60 (the oval exam), and play-tested by
     hand. There is deliberately no spec, so `genlevels 3 --write` refuses
     rather than splicing ten old boards over the twenty that ship. */

  /* 4 - Stormhold (61-80) and the old 5 - Zunmara Ruins are NOT generated
     here either: tools/stormLevels.mjs places 61-76 (Emberkeep's layouts
     with a thunderstorm) and tools/ovalLevels.mjs --only=77-80 the oval
     exam. No spec, so `genlevels 4 --write` refuses instead of overwriting. */

  7: {
    name: 'Nocturne Sands',
    /* Stars change nothing about the physics, so these boards are ordinary
       boards with a second, optional question laid over them: the route that
       wins and the route that collects are not the same route. */
    gate: i => ({ minTol: 3, maxTol: 26 - i * 1.2, maxBlind: 0.06,
                  requireStars: 1, maxObHits: 1.2 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 80, 170) : rint(r, 310, 400), y: 40 };
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = leftSpawn ? rint(r, 270, 425) : rint(r, 55, 210);
        const ty = rint(r, 590, 740);
        if (Math.abs(tx - spawn.x) < 145) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 38) };
      }
      if (!target) return null;
      /* Strung along the straight line from spawn to target, jittered off it.
         Placed on the natural route rather than at random, so at least one is
         always collectable - which is the only thing the gate can check. */
      const stars = [];
      const nStars = last ? 3 : (i < 4 ? 2 : 3);
      for (let k = 0; k < nStars; k++){
        const t = (k + 1) / (nStars + 1);
        stars.push({ x: clampX(Math.round(spawn.x + (target.x - spawn.x) * t + rint(r, -40, 40)), 30),
                     y: Math.round(spawn.y + (target.y - spawn.y) * t + rint(r, -30, 30)) });
      }
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 260, 600), r: rint(r, 26, 34) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (!clear(o, o.r, stars.map(st => ({ ...st, r: 14 })), 12)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!spaced(o, obstacles)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['Constellation'] : STAR_NAMES), maxBlocks: 2,
               targetType: last ? 'SIDE_WALL' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, stars, target };
    }
  },

  /* 8 - Neonaka is gone, and 9 - Coralis Deep (81-100) is NOT generated
     here: tools/fishLevels.mjs places 81-96 (Emberkeep's layouts, underwater,
     with eater fish) and tools/ovalLevels.mjs --only=97-100 the oval exam.
     No spec, so `genlevels 9 --write` refuses instead of overwriting. */

  11: {
    name: 'Cascadia Falls',
    /* No new mechanic - the idea is LENGTH. Three ramps, and a target in the
       far corner at the bottom of the board, so the route is a chain rather
       than a single deflection. */
    gate: i => ({ minTol: 3, maxTol: 24 - i * 1.0, maxBlind: 0.05, maxObHits: 1.4 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 55, 120) : rint(r, 360, 425), y: 40 };
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = leftSpawn ? rint(r, 330, 440) : rint(r, 40, 150);
        const ty = rint(r, 660, 755);
        if (Math.abs(tx - spawn.x) < 230) continue;          // the long diagonal
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 36) };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 4 : 2 + (i > 4 ? 1 : 0);
      let guard = 0;
      while (obstacles.length < want && guard++ < 220){
        const o = { x: rint(r, 55, 425), y: rint(r, 240, 640), r: rint(r, 24, 32) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!spaced(o, obstacles)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['The Cataract'] : FALL_NAMES), maxBlocks: 3,
               targetType: last ? 'POCKET' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, target };
    }
  },

  12: {
    name: 'Ironvale',
    /* The inverse of Cascadia: a crowded board and FEWER ramps. One ramp for
       most of the country, so the single placement has to be exactly right. */
    gate: i => ({ minTol: 2.5, maxTol: 20 - i * 0.9, maxBlind: 0.04, maxObHits: 1.6 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 90, 180) : rint(r, 300, 390), y: 40 };
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = rint(r, 55, 425);
        const ty = rint(r, 620, 750);
        if (Math.abs(tx - spawn.x) < 110) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 36) };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 6 : 3 + Math.floor(i / 3);
      let guard = 0;
      while (obstacles.length < want && guard++ < 300){
        const o = { x: rint(r, 55, 425), y: rint(r, 240, 620), r: rint(r, 22, 30) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 24 }], 12)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 190) continue;
        if (!spaced(o, obstacles)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['The Forgeworks'] : IRON_NAMES),
               maxBlocks: i < 6 ? 1 : 2,
               targetType: last ? 'SIDE_WALL' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, target };
    }
  },

  13: {
    name: 'Aerith Heights',
    gate: i => ({ minTol: 2.5, maxTol: 19 - i * 0.9, maxBlind: 0.04,
                  minMechanics: 2, maxObHits: 1.2 }),
    make(r, i, n, taken){ return combo(r, i, n, taken, 2, SKY_NAMES, 'The Summit Gate'); }
  },

  14: {
    name: 'The Zenith',
    /* The finale. Three mechanics, the tightest bands in the game, and a
       target small enough that arriving is not the same as landing. */
    gate: i => ({ minTol: 2, maxTol: 15 - i * 0.7, maxBlind: 0.03,
                  minMechanics: 3, maxObHits: 1.0 }),
    make(r, i, n, taken){ return combo(r, i, n, taken, 3, ZENITH_NAMES, 'The Zenith', true); }
  }
};

/* ---------------------------------------------------------------- */
/* THE COMBO BUILDER

   Countries 8, 9, 13 and 14 are not defined by a new mechanic but by how
   many run at once. Rather than four near-identical templates, one builder
   takes the COUNT and draws that many from the pool - which is also what
   stops the four of them producing the same board with a different palette.
   ---------------------------------------------------------------- */
function combo(r, i, n, taken, want, names, bossName, hard = false){
  const last = i === n - 1;
  const leftSpawn = i % 2 === 0;
  const spawn = { x: leftSpawn ? rint(r, 85, 165) : rint(r, 315, 395), y: 40 };
  const toward = leftSpawn ? 1 : -1;
  const lv = { spawn, obstacles: [], maxBlocks: 2,
               targetType: 'OPEN', wallSide: leftSpawn ? 'right' : 'left' };

  let target = null;
  for (let a = 0; a < 220 && !target; a++){
    const tx = leftSpawn ? rint(r, 280, 425) : rint(r, 55, 200);
    const ty = rint(r, 600, 745);
    if (Math.abs(tx - spawn.x) < 150) continue;
    if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
    target = { x: tx, y: ty, r: hard ? rint(r, 22, 27) : (last ? rint(r, 26, 30) : rint(r, 30, 36)) };
  }
  if (!target) return null;
  lv.target = target;

  /* Rotated by level index rather than drawn at random, so a country covers
     its whole pool instead of landing on the same pair six times.

     NO 'booster'. The circular pad is not a thing the game ships any more -
     see the note in src/levels/levels.data.ts - so a mechanic pool that could
     still roll one would quietly put twenty-three of them back the next time
     a late country was regenerated. */
  const POOL = ['wind', 'slippery', 'breakable', 'star'];
  const chosen = [];
  for (let k = 0; k < POOL.length && chosen.length < want; k++)
    chosen.push(POOL[(i + k) % POOL.length]);

  for (const m of chosen){
    if (m === 'wind'){
      lv.wind = [{ x: 0, y: rint(r, 300, 380), w: W, h: rint(r, 150, 220),
                   ax: toward * rng(r, 0.3, 0.8), ay: 0 }];
    } else if (m === 'slippery'){
      lv.slippery = [{ x: 0, y: rint(r, 430, 500), w: W, h: rint(r, 150, 220) }];
    } else if (m === 'breakable'){
      lv.breakables = [{ x: rint(r, 90, 390), y: rint(r, 340, 560), r: rint(r, 26, 33) }];
    } else if (m === 'star'){
      lv.stars = [0, 1].map(k => ({
        x: clampX(Math.round(spawn.x + (target.x - spawn.x) * ((k + 1) / 3) + rint(r, -35, 35)), 30),
        y: Math.round(spawn.y + (target.y - spawn.y) * ((k + 1) / 3) + rint(r, -25, 25)) }));
    }
  }

  const solids = [lv.breakables].filter(Boolean).flat();
  const wantOb = last ? 3 : (i < 3 ? 1 : 2);
  let guard = 0;
  while (lv.obstacles.length < wantOb && guard++ < 240){
    const o = { x: rint(r, 60, 420), y: rint(r, 260, 600), r: rint(r, 24, 32) };
    if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
    if (!spaced(o, solids)) continue;
    if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
    if (!spaced(o, lv.obstacles)) continue;
    lv.obstacles.push(o);
  }
  lv.name = last ? bossName : pick(r, names);
  if (last) lv.targetType = 'SIDE_WALL';
  return lv;
}

/* ================================================================ */
/* THE FIRST TWO WORLDS' BUILDERS - Verdholm (1-20), Emberkeep (21-40) */
/* ================================================================ */

/* ---- placement: spread over the WHOLE board, never clustered ----

   Two rules every object on these boards is placed under.

   SPACING. A free-standing object keeps FREE_GAP of clear air to every other
   one, rim to rim: wider than the ball, so a dense board is still a field to
   thread, and wide enough that nothing is ever drawn touching. The pieces of
   an exam CAGE sit closer, at MIN_GAP - the floor no two hazards anywhere
   may go below, because it is the ball's own width.

   COVERAGE. Objects are laid in horizontal BANDS down the play area, about
   one band per two or three objects, and each band is filled across the
   FULL WIDTH of the board by best-candidate sampling: of a few dozen random
   spots, the one farthest from everything already placed wins. Bands stop
   a field piling into one height; best-candidate stops it piling into one
   side. covers() then refuses any board that still leaves a whole third of
   the board - a column or a row - empty.

   GLOW. Spacing is measured to what the player SEES, not only to the body
   the ball hits. A fire paints a heat haze out to FIRE_GLOW times its
   radius, so two fires whose bodies clear FREE_GAP can still smear into one
   blob on screen. need() therefore asks for both: the bodies keep their
   gap, and when either object glows, the visible edges keep GLOW_PAD too -
   fire to fire, fire to obstacle, fire to breakable. Obstacle to obstacle
   is unchanged: neither glows. To make that possible an object's KIND is
   decided before it is placed, not dealt out afterwards. */
const FREE_GAP = 30;

/** Where what the player sees of an object ends: its glow if it has one. */
const vis = o => o.vr ?? o.r;
/** The centre distance two objects need: `gap` between bodies - never less
    than MIN_GAP, the ball's width - and, when either glows, GLOW_PAD between
    the visible edges as well. */
function need(a, b, gap){
  const body = a.r + b.r + Math.max(gap, MIN_GAP);
  return (vis(a) > a.r || vis(b) > b.r) ? Math.max(body, vis(a) + vis(b) + GLOW_PAD) : body;
}
const apart = (a, b, gap) => Math.hypot(a.x - b.x, a.y - b.y) >= need(a, b, gap);
/** A placed object of a kind: 'f' fire (glows), 'b' breakable, 'o' obstacle. */
const piece = (kind, x, y, r) => kind === 'f' ? { x, y, r, vr: r * FIRE_GLOW, kind } : { x, y, r, kind };
/* A cage (guard, lid, floor) used to be SEALED, 11px between pieces - a
   gap the ball cannot pass, which made it a wall with holes painted on and
   level 15 a basket nothing gets into from the side. No exception any more:
   its pieces keep MIN_GAP like every other pair, so the ball can be routed
   through any of them. */
const CAGE_GAP = MIN_GAP;
const CAGE_R = 19;
const CAGE_STEP = 2 * CAGE_R + CAGE_GAP;

/** Whether a circle clears every keep-out rect by `pad`. */
function clearOfRects(o, rects, pad = 8){
  return rects.every(q => {
    const nx = Math.max(q.x, Math.min(o.x, q.x + q.w));
    const ny = Math.max(q.y, Math.min(o.y, q.y + q.h));
    return Math.hypot(o.x - nx, o.y - ny) > o.r + pad;
  });
}

/** Best-candidate placement (Mitchell's algorithm) inside one region: each
    object is the candidate, of `tries`, farthest from everything already on
    the board. The side walls count as neighbours too, so a field does not
    hug the edge of the board. `kinds` is one entry per object to place, so
    a fire is spaced by its glow from the moment it is a candidate. Returns
    what it placed and the kinds it found no room for. */
function spreadOut(r, kinds, region, radius, placed, keep, rects, gap, tries = 40){
  const out = [], missed = [];
  for (const kind of kinds){
    let best = null, bestScore = -Infinity;
    for (let c = 0; c < tries; c++){
      const rad = rint(r, radius[0], radius[1]);
      const o = piece(kind, rint(r, Math.max(region.x0, rad + 8), Math.min(region.x1, W - rad - 8)),
                      rint(r, region.y0, region.y1), rad);
      if (!keep.every(q => apart(o, q, 14))) continue;
      if (!placed.every(q => apart(o, q, gap)) || !out.every(q => apart(o, q, gap))) continue;
      if (!clearOfRects(o, rects)) continue;
      /* scored on VISIBLE edges, so a fire is steered toward open air */
      let score = Math.min(o.x - o.r, W - o.x - o.r);
      for (const q of [...placed, ...out, ...keep])
        score = Math.min(score, Math.hypot(q.x - o.x, q.y - o.y) - vis(q) - vis(o));
      if (score > bestScore){ bestScore = score; best = o; }
    }
    if (best) out.push(best); else missed.push(kind);
  }
  return { out, missed };
}

/** `kinds.length` objects laid in horizontal bands down `region`, each band
    filled across the full width. Whatever a band could not take (a keep-out
    ate it) is topped up anywhere in the region, still by best-candidate. */
function bandSpread(r, kinds, region, radius, placed, keep, rects, gap = FREE_GAP){
  const want = kinds.length;
  if (want <= 0) return [];
  const nb = Math.max(1, Math.round(want / 2.5));
  const h = (region.y1 - region.y0) / nb;
  const counts = new Array(nb).fill(Math.floor(want / nb));
  const order = [...counts.keys()].sort(() => r() - 0.5);
  for (let k = 0; k < want - Math.floor(want / nb) * nb; k++) counts[order[k]]++;
  const out = [], missed = [];
  let next = 0;
  for (let b = 0; b < nb; b++){
    const band = { x0: region.x0, x1: region.x1,
                   y0: Math.round(region.y0 + b * h), y1: Math.round(region.y0 + (b + 1) * h) };
    const got = spreadOut(r, kinds.slice(next, next + counts[b]), band, radius,
                          [...placed, ...out], keep, rects, gap);
    next += counts[b];
    out.push(...got.out); missed.push(...got.missed);
  }
  if (missed.length)
    out.push(...spreadOut(r, missed, region, radius, [...placed, ...out], keep, rects, gap, 80).out);
  return out;
}

/** No third of the board left empty. On a board of six or more objects every
    column (left / centre / right) and every row (top / middle / bottom) of
    the play area must hold at least one; on twelve or more, at least seven of
    the nine cells must. Rows are measured from under the spawn to the floor. */
function covers(objs){
  if (objs.length < 6) return true;
  const col = o => Math.min(2, Math.floor(o.x / (W / 3)));
  const row = o => Math.min(2, Math.max(0, Math.floor((o.y - 90) / ((H - 50 - 90) / 3))));
  const cols = new Set(objs.map(col)), rows = new Set(objs.map(row));
  if (cols.size < 3 || rows.size < 3) return false;
  if (objs.length >= 12 && new Set(objs.map(o => col(o) + 3 * row(o))).size < 7) return false;
  if (emptiest(objs) > MAX_EMPTY) return false;
  return true;
}

/* THE HOLE. Thirds can all be occupied and the board still carry one big
   bare patch - measured, spacing fires by their glow pushed six-to-nine
   piece boards to 290px holes that covers() alone let through. So the
   largest empty square anywhere in the play area is capped as well. 260px
   is a little over what an even spread of six leaves (~225px). The same
   measurement tools/audit-spread.mjs reports. */
const MAX_EMPTY = 260;
/** Side of the largest axis-aligned square in the play area, wall to wall
    and from under the spawn to the floor, that no body touches. */
function emptiest(objs){
  const X0 = 0, X1 = W, Y0 = 110, Y1 = 745;
  let best = 0;
  for (let x = X0; x < X1; x += 8)
    for (let y = Y0; y < Y1; y += 8){
      let lo = best, hi = Math.min(X1 - x, Y1 - y);
      if (hi <= lo) continue;
      const free = sz => objs.every(o => {
        const nx = Math.max(x, Math.min(o.x, x + sz)), ny = Math.max(y, Math.min(o.y, y + sz));
        return Math.hypot(o.x - nx, o.y - ny) > o.r;
      });
      if (!free(lo + 1)) continue;
      while (hi - lo > 1){ const m = (lo + hi) >> 1; if (free(m)) lo = m; else hi = m; }
      best = lo;
    }
  return best;
}

/* THE WHOLE PLAY AREA the free objects are spread over: under the spawn's
   first-ramp room, down to just above the floor, wall to wall. */
const FIELD = { x0: 30, x1: 450, y0: 110, y1: 745 };

/* ---------------------------------------------------------------- */
/* VERDHOLM - see the country's note in SPECS above                  */
/* ---------------------------------------------------------------- */

/* Obstacles per level, 1..20. Level N carries about N of them - up to the
   final exam, which levels off at 14-18 hazards (a patrol counts as one).
   Twenty pieces on a 480px board reads as noise however well it is spaced;
   past this point difficulty comes from the cage, the patrol and the ramp
   count, not from cramming. */
const VERD_DENSITY = [1, 2, 3, 4, 4, 5, 6, 7, 8, 9,
                      10, 11, 12, 13, 14, 15, 15, 17, 16, 17];
/* The names the hand-made twenty shipped with, kept: a player who knows
   "Master's Drop" as the finale should still find it there. */
const VERD_NAMES = ['First Drop', 'Long Reach', 'Watch Out', 'Two Steps', 'Around It',
                    'The Gap', 'One Shot', 'Staircase', 'Tight Corridor', 'Cross Court',
                    'One Way In', 'The Pocket', 'Threading It', 'Steady Hands', 'The Basket',
                    'Breather', 'Full House', 'No Room', 'The Gauntlet', "Master's Drop"];
/* Levels 17, 19 and 20 patrol their target - their historical spots. */
const VERD_MOVERS = new Set([16, 18, 19]);
/* The final exam picks its spawn side per level rather than alternating, so
   two patrols that start from the same side never want the same few pixels
   (a patrol starts at its near end). true = spawn on the left.

   Three movers means two have to share a side, and which two is decided by
   the targets before 20 as much as by 20 itself: the upper-middle band they
   all share is barely wider than the spread rule, so level 20 can find its
   lane already taken ("target too close to another") and never be built.
   Re-measure this whenever the exam builder or its densities change - with
   the current ones, 17 and 19 on the right and 20 on the left pass all six. */
const VERD_EXAM_LEFT = { 14: true, 15: false, 16: false, 17: true, 18: false, 19: true };

function verdPhase(i){ return i < 10 ? 'early' : i < 14 ? 'middle' : 'final'; }

/* ---- 1-14: a field spread over the whole board, target LOW and across ---- */
function verdField(r, i, taken){
  const N = VERD_DENSITY[i];
  const middle = verdPhase(i) === 'middle';
  const leftSpawn = i % 2 === 0;
  const spawn = { x: leftSpawn ? rint(r, 70, 170) : rint(r, 310, 410), y: 40 };
  const target = lowTarget(r, spawn, leftSpawn, taken, Math.round(46 - i * 1.1));
  if (!target) return null;
  /* the room under the spawn is where the first ramp goes */
  const keep = [{ x: target.x, y: target.y, r: target.r + 30 }];
  const rects = [{ x: spawn.x - 55, y: 40, w: 110, h: 190 }];
  const rMax = Math.max(19, Math.min(34, 37 - N)), rMin = rMax - 6;
  const obstacles = bandSpread(r, Array(N).fill('o'), FIELD, [rMin, rMax], [], keep, rects);
  if (obstacles.length < N || !covers(obstacles)) return null;
  const WALLS = ['SIDE_WALL', 'POCKET', 'NARROW_GAP', 'POCKET'];
  const targetType = middle ? WALLS[i - 10] : 'OPEN';
  const lv = { name: VERD_NAMES[i], maxBlocks: i < 3 ? 1 : i >= 9 ? 3 : 2, targetType,
               wallSide: leftSpawn ? 'right' : 'left', spawn, obstacles, target };
  if (targetType === 'NARROW_GAP') lv.gapW = rint(r, 46, 54);
  return lv;
}

function verdExam(r, i, taken){
  /* Verdholm's density is an OBSTACLE count, so a patrol is on top of it -
     examBoard counts a moving target as one hazard, the way Emberkeep does */
  const mover = VERD_MOVERS.has(i);
  return examBoard(r, taken, { N: VERD_DENSITY[i] + (mover ? 1 : 0), mover,
                               leftSpawn: VERD_EXAM_LEFT[i], name: VERD_NAMES[i],
                               fire: false });
}

/* ---------------------------------------------------------------- */
/* EMBERKEEP - see the country's note in SPECS above                  */
/* ---------------------------------------------------------------- */

/* Total hazards per city, 21..39 (40 is the hand-tuned spring boss and is
   never generated). A moving target counts as one. */
const EMBER_DENSITY = [1, 2, 3, 3, 4, 4, 5,          // 21-27 early
                       6, 6, 7, 8, 8, 9, 10,         // 28-34 middle
                       12, 13, 15, 16, 17];          // 35-39 final exam, capped at 17
/* Which final-exam cities patrol their target, by city index: 36, and 39 to
   close the world. One right-spawn board and one left-spawn board on
   purpose - a patrol STARTS at its near end, and two from the same side
   would both want the same few pixels, which the spread rule between a
   country's targets will not allow. */
const EMBER_MOVERS = new Set([15, 18]);
/* ...and three middle-phase cities before them, 28, 31 and 34, so the patrol
   is a presence across the world's back half rather than two late surprises.
   These are the ordinary field boards with the low target set moving along
   the far side - see lowPatrol(). */
const EMBER_FIELD_MOVERS = new Set([7, 10, 13]);

function emberPhase(i){ return i < 7 ? 'early' : i < 14 ? 'middle' : 'final'; }
function emberCount(i){ return EMBER_DENSITY[Math.min(i, EMBER_DENSITY.length - 1)]; }

/** Split a hazard total into fires / breakables / obstacles for the early
    and middle phases. The final exam builds its cage first and fills what is
    left - see examBoard. */
function emberMix(N, phase){
  if (phase === 'early'){
    const F = N >= 4 ? 2 : 1;
    const B = Math.min(2, N - F);
    return { F, B, O: N - F - B };
  }
  const F = N >= 8 ? 3 : 2;
  const B = N >= 9 ? 3 : 2;
  return { F, B, O: N - F - B };
}

/* ---- 21-34: fire in the fall line, the rest spread over the board ---- */
function emberField(r, i, taken){
  const phase = emberPhase(i);
  const mid = phase === 'middle';
  const mover = EMBER_FIELD_MOVERS.has(i);
  /* a patrol is one of the city's hazards, so it comes out of the pieces */
  const N = emberCount(i) - (mover ? 1 : 0);
  const { F, B, O } = emberMix(N, phase);
  const leftSpawn = i % 2 === 0;
  const spawn = { x: leftSpawn ? rint(r, 80, 170) : rint(r, 310, 400), y: 40 };

  /* THE FIRE SITS IN THE FALL LINE. That is the whole board at 21: do
     nothing and you burn, so the first ramp is not an optimisation, it is
     the only way the drop survives. Placed high enough that the player has
     room to turn the ball before reaching it. */
  const fall = piece('f', clampX(spawn.x + rint(r, -10, 10), 40), rint(r, 215, 300), rint(r, 24, 30));
  const big = mid ? 34 : 38;
  let target = null, targetMove = null;
  if (mover){
    const p = lowPatrol(r, spawn, leftSpawn, taken, big, [fall]);
    if (p) ({ target, targetMove } = p);
  } else target = lowTarget(r, spawn, leftSpawn, taken, big, [fall]);
  if (!target) return null;

  /* Everything else - the other fires, the breakables, the obstacles - is
     spread over the whole board in bands. The kinds are shuffled FIRST, so
     no kind collects in one place and each fire is spaced by its glow from
     the moment it is a candidate. Radii shrink as the count climbs, so a
     busier board is busier, not solid. A patrol keeps its whole lane clear,
     not just the spot it starts from. */
  const lo = targetMove ? Math.min(targetMove.x0, targetMove.x1) : target.x;
  const hi = targetMove ? Math.max(targetMove.x0, targetMove.x1) : target.x;
  const keep = [];
  for (let x = lo; x < hi; x += 12) keep.push({ x, y: target.y, r: target.r + 30 });
  keep.push({ x: hi, y: target.y, r: target.r + 30 });
  const rects = [{ x: spawn.x - 55, y: 40, w: 110, h: fall.y - fall.r - 50 }];
  const shrink = N >= 8 ? 0.8 : N >= 6 ? 0.9 : 1;
  const kinds = [...Array(F - 1).fill('f'), ...Array(B).fill('b'), ...Array(O).fill('o')]
    .sort(() => r() - 0.5);
  const rest = bandSpread(r, kinds, FIELD, [Math.round(24 * shrink), Math.round(31 * shrink)],
                          [fall], keep, rects);
  if (rest.length < N - 1 || !covers([fall, ...rest])) return null;
  const fires = [fall, ...rest.filter(o => o.kind === 'f')];
  const breakables = rest.filter(o => o.kind === 'b');
  const obstacles = rest.filter(o => o.kind === 'o');

  /* WALLS enter in the middle phase, exactly where Verdholm put its own.
     SIDE_WALL is a backstop - it catches a long ball and feeds it back - so
     it belongs to the middle, where a little help is the point. A patrol is
     always OPEN: its walls would be dragged along with it (levels/patrol). */
  const targetType = mid && !mover ? pick(r, ['OPEN', 'OPEN', 'SIDE_WALL', 'POCKET']) : 'OPEN';
  const lv = {
    /* Indexed, not rolled: a twenty-city world rolling a nine-name pool
       produced "Hot Gate" three times. */
    name: FIRE_NAMES[i % FIRE_NAMES.length],
    /* every world's cities 10-20 get three ramps */
    maxBlocks: i >= 9 ? 3 : 2,
    targetType,
    wallSide: leftSpawn ? 'right' : 'left',
    spawn, obstacles, breakables, fires, target
  };
  if (targetMove) lv.targetMove = targetMove;
  return lv;
}

function emberExam(r, i, taken){
  return examBoard(r, taken, { N: emberCount(i), mover: EMBER_MOVERS.has(i),
                               leftSpawn: i % 2 === 0, name: FIRE_NAMES[i % FIRE_NAMES.length],
                               fire: true });
}

/* ---------------------------------------------------------------- */
/* SHARED                                                             */
/* ---------------------------------------------------------------- */

/** The room a target needs from `avoid`: its old 40px body clearance, and
    its halo kept off any glow (see need()). */
const targetRoom = (x, y, tr) => ({ x, y, r: 40, vr: Math.max(40, tr * TARGET_GLOW) });

/** A target LOW and across the board from the spawn, clear of `avoid`. */
function lowTarget(r, spawn, leftSpawn, taken, big, avoid = []){
  for (let a = 0; a < 260; a++){
    const tx = leftSpawn ? rint(r, 270, 424) : rint(r, 56, 210);
    const ty = rint(r, 545, 740);
    const tr = rint(r, big - 4, big);
    if (Math.abs(tx - spawn.x) < 150) continue;
    if (taken.some(q => Math.hypot(q.x - tx, q.y - ty) < 44)) continue;
    if (!avoid.every(q => apart(targetRoom(tx, ty, tr), q, 26))) continue;
    return { x: tx, y: ty, r: tr };
  }
  return null;
}

/** lowTarget's patrolling twin: the same low spot across the board, with the
    target sliding along the far side. It STARTS at a random end - the board
    the player plans against shows it there - and the whole lane has to clear
    `avoid`, because the target passes every point of it. */
function lowPatrol(r, spawn, leftSpawn, taken, big, avoid = []){
  for (let a = 0; a < 260; a++){
    const span = rint(r, 60, 110);
    const lo = leftSpawn ? rint(r, 250, 424 - span) : rint(r, 56, 230 - span);
    const hi = lo + span;
    const ty = rint(r, 560, 700);
    const tr = rint(r, big - 4, big);
    if (Math.min(Math.abs(lo - spawn.x), Math.abs(hi - spawn.x)) < 130) continue;
    const [x0, x1] = r() < 0.5 ? [lo, hi] : [hi, lo];
    if (taken.some(q => Math.hypot(q.x - x0, q.y - ty) < 44)) continue;
    let ok = true;
    for (let x = lo; x <= hi && ok; x += 12)
      ok = avoid.every(q => apart(targetRoom(x, ty, tr), q, 26));
    if (!ok) continue;
    return { target: { x: x0, y: ty, r: tr },
             targetMove: { x0, x1, period: rint(r, 80, 170) } };
  }
  return null;
}

/* ============================================================
   THE FINAL EXAM - one builder, both worlds

   The target in the UPPER MIDDLE of the board, the route out
   past it to the far side and back in, and the gate proving
   every winning route crosses the board (requireCross). See
   Emberkeep's note in SPECS for why "top-middle" is the upper
   third and not the top edge - the ball cannot climb back.

   THE CAGE. A hazard in the fall line (the do-nothing drop meets
   it); a GUARD column on the spawn side of the target; a LID
   over it; and for a static target a FLOOR. Its pieces are
   CAGE_GAP (= MIN_GAP, the ball's width) apart, so it GUARDS the
   short way in rather than walling it off: the ball can thread a
   gap in it, but only on an exact line.

   A PATROL gets no floor, and that is what makes it matter: a
   ball that arrives when the target is elsewhere drops through.
   Its lane sits a little lower and is short, because the ball
   has to be thrown over the whole lid and sideways speed is
   capped - measured, a long high lid is simply out of range.

   EVERYTHING ELSE is spread over the rest of the board, band by
   band across the full width - under the cage, beside it, down
   to the floor, on both sides - never piled in one place. The
   only open strip is the one the throw flies through, over the
   top, and the far side where the second ramp goes: that is the
   route, and a hazard there would simply close it.

   `fire` picks the world's vocabulary: Emberkeep's fall line
   burns and its free hazards mix fire, breakables and obstacles;
   Verdholm's is all obstacles. The cage itself is solid in both -
   its pieces sit closer than a fire's glow reaches (see need()).
   ============================================================ */
function examBoard(r, taken, { N, mover, leftSpawn, name, fire }){
  const toward = leftSpawn ? 1 : -1;
  const spawn = { x: leftSpawn ? rint(r, 40, 80) : rint(r, 400, 440), y: 40 };

  let target = null, targetMove = null;
  for (let a = 0; a < 200 && !target; a++){
    const tx = rint(r, 205, 275), ty = mover ? rint(r, 330, 400) : rint(r, 230, 310);
    if (taken.some(q => Math.hypot(q.x - tx, q.y - ty) < 44)) continue;
    const tr = rint(r, 24, 28);
    if (mover){
      const span = rint(r, 40, 60);
      const lo = Math.max(200, tx - Math.round(span / 2)), hi = lo + span;
      if (hi > 280) continue;
      /* start at the NEAR end, so the board the player first sees shows the
         target on the side the drop is guarded from */
      const [x0, x1] = leftSpawn ? [lo, hi] : [hi, lo];
      if (taken.some(q => Math.hypot(q.x - x0, q.y - ty) < 44)) continue;
      target = { x: x0, y: ty, r: tr };
      targetMove = { x0, x1, period: rint(r, 80, 170) };
    } else target = { x: tx, y: ty, r: tr };
  }
  if (!target) return null;
  const lo = targetMove ? Math.min(targetMove.x0, targetMove.x1) : target.x;
  const hi = targetMove ? Math.max(targetMove.x0, targetMove.x1) : target.x;
  const near = leftSpawn ? lo : hi, far = leftSpawn ? hi : lo;
  const ty = target.y, tr = target.r;

  /* What must stay EMPTY for the long way round to exist: the target and
     its lane, its far mouth, the throw over the top, and the far side down
     to just below the target. */
  const keep = [];
  for (let x = lo; x <= hi; x += 12) keep.push({ x, y: ty, r: tr + 24 });
  keep.push({ x: far + toward * (tr + 30), y: ty, r: 34 });
  const flightTop = 60, flightH = Math.max(20, ty - tr - 78 - flightTop);
  const farX = far + toward * (tr + 36);
  const rects = [
    leftSpawn ? { x: spawn.x - 40, y: flightTop, w: W - spawn.x + 40, h: flightH }
              : { x: 0, y: flightTop, w: spawn.x + 40, h: flightH },
    leftSpawn ? { x: farX, y: flightTop, w: W - farX, h: ty + tr + 70 - flightTop }
              : { x: 0, y: flightTop, w: farX, h: ty + tr + 70 - flightTop },
  ];

  /* THE CAGE. Only the fall-line hazard may burn: the guard, lid and floor
     are sealed CAGE_GAP apart, far closer than a fire's glow reaches, so a
     burning lid could only ever be drawn as one smear. */
  const fall = piece(fire ? 'f' : 'o', clampX(spawn.x + rint(r, -8, 8), 40), rint(r, 250, 310), rint(r, 22, 25));
  const pocket = !mover && pick(r, [true, false]);
  const guardX = near - toward * (tr + 40);
  if (Math.abs(guardX - spawn.x) < CAGE_R + 34) return null;
  const lidY = ty - tr - rint(r, 38, 44);
  const guardTop = pocket ? ty - 34 : lidY + CAGE_STEP;
  const guard = [0, 1, 2].map(k => ({ x: guardX, y: guardTop + k * CAGE_STEP, r: CAGE_R }));
  const lid = [], floor = [];
  if (!pocket){
    /* from over the guard column to past the target's far rim, one CAGE_STEP
       apart - so the corner is sealed and no lob falls in beyond it */
    const lidEnd = far + toward * Math.round(tr * 0.5);
    for (let x = guardX; toward * (x - lidEnd) <= CAGE_STEP / 2; x += toward * CAGE_STEP)
      lid.push({ x, y: lidY, r: CAGE_R });
  }
  if (!mover){
    const floorY = ty + tr + 36, floorEnd = far + toward * Math.round(tr * 0.5);
    for (let x = guardX + toward * CAGE_STEP; toward * (x - floorEnd) <= CAGE_STEP / 2; x += toward * CAGE_STEP)
      floor.push({ x, y: floorY, r: CAGE_R });
  }
  const cage = [fall, ...guard, ...lid, ...floor];
  if (!cage.every((a, k) => cage.every((b, m) => m === k || apart(a, b, CAGE_GAP)))) return null;

  /* THE REST, spread over the whole board around the cage. Kinds first, so
     each fire is placed with room for its glow. */
  const left = N - (mover ? 1 : 0) - cage.length;
  if (left < 0) return null;
  const B = fire ? Math.ceil(left * 0.4) : 0, F = fire ? Math.ceil((left - B) / 2) : 0;
  const kinds = [...Array(B).fill('b'), ...Array(F).fill('f'), ...Array(left - B - F).fill('o')]
    .sort(() => r() - 0.5);
  const rest = bandSpread(r, kinds, FIELD, [17, 23], cage, keep, rects);
  if (rest.length < left) return null;
  if (!covers([...cage, ...rest])) return null;

  /* the world's vocabulary: Emberkeep's fall line burns, the cage is solid,
     and the free hazards are whatever kind they were placed as */
  const all = [...cage, ...rest];
  const obstacles = all.filter(o => o.kind !== 'f' && o.kind !== 'b');
  const fires = all.filter(o => o.kind === 'f');
  const breakables = all.filter(o => o.kind === 'b');

  const lv = { name, maxBlocks: 3, targetType: pocket ? 'POCKET' : 'OPEN',
               /* the pocket's wall is on the NEAR side: open only toward the far side */
               wallSide: leftSpawn ? 'left' : 'right', spawn, obstacles, target };
  if (fires.length) lv.fires = fires;
  if (breakables.length) lv.breakables = breakables;
  if (targetMove) lv.targetMove = targetMove;
  return lv;
}

const WIND_NAMES = ['Crosswind','The Drift','Squall','Headwind','Bluster','Leeward','Updraught'];
const ICE_NAMES  = ['Glasswork','Skid','The Rink','Hoarfrost','Slick','Frostbite','Glide'];
const RUIN_NAMES = ['Threshold','The Narrows','Stonework','Wayhouse','Passage','Colonnade','Doorstep'];
const STAR_NAMES = ['Stargazer','The Trail','Night Watch','Scatter','Lantern','Wanderer'];
const COMBO_NAMES = ['Crossfire','Neon Run','Double Bill','Interchange','Static','Downtown'];
const DEEP_NAMES = ['Undertow','Reef Run','Abyssal','Riptide','The Shoal','Deepwater'];
const FALL_NAMES = ['Long Drop','The Chute','Cascade','Spillway','Plunge','Whitewater'];
const IRON_NAMES = ['Foundry','Pig Iron','The Press','Slagheap','Anvil','Bellows'];
const SKY_NAMES = ['Cloudbreak','High Altar','Thin Air','Skybridge','The Ascent','Windward'];
const ZENITH_NAMES = ['Apex','Culmination','The Last Mile','Starfall','Terminus','Crown'];
const BOOST_NAMES = ['Kickoff','Slingshot','Updraft','Ricochet','Launch Pad',
                     'The Sling','Green Light','Overshoot','Bank Shot'];
const FIRE_NAMES = ['Firebreak','Cinder Run','The Forge','Ashfall','Emberline',
                    'Hot Gate','Flashpoint','Smoulder','Kiln','Backdraft',
                    'Slow Burn','The Flue','Scorchline','Tinderbox','Bellows',
                    'Char','Updraft','The Gauntlet','Blast Furnace','Pyre',
                    'Wickline','Coalface','Firewall','Searing'];
const MOVE_NAMES = ['Metronome','Pendulum','Crosswalk','The Shuttle','Tempo',
                    'Sidestep','Drift','Interception','Windowpane'];
function clampX(v, m){ return Math.max(m, Math.min(W - m, v)); }
/** Hazard total as the density curves count it: fires, obstacles and
    breakables, and a moving target as one more. */
function hazards(lv){
  return (lv.fires || []).length + (lv.obstacles || []).length +
         (lv.breakables || []).length + (lv.targetMove ? 1 : 0);
}

/* ---------------------------------------------------------------- */
if (!SPECS[WORLD]){
  console.error(`No spec for world ${WORLD}. Available: ${Object.keys(SPECS).join(', ')}`);
  process.exit(1);
}
const spec = SPECS[WORLD];

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
/* The sweep needs the simulator, not the game: attachHarness bundles the
   physics half of the test hook into a blank page, so a regeneration never
   depends on a dev server or on React booting. */
await attachHarness(page);

/* The country's range comes from the COUNTRIES table, not from arithmetic on
   its id. Countries are built out of plan order, so a country's NUMBER long
   ago stopped predicting its levels - Emberkeep is country 6 and sits at
   31-40. The old `21 + (WORLD-2)*10` still computed 61 and would have spliced
   this country's levels on top of whatever now lives there. */
const COUNTRY = await page.evaluate(w =>
  window.__gtb.COUNTRIES.find(c => c.id === w), WORLD);
if (!COUNTRY){ console.error(`No country with id ${WORLD}`); await browser.close(); process.exit(1); }
const FROM = COUNTRY.from, TO = COUNTRY.to;

/** The acceptance sweep. Runs entirely inside the page against the real
    simulator, so it can never disagree with the shipped physics. */
async function verify(lv, i, n){
  const gate = typeof spec.gate === 'function' ? spec.gate(i, n) : spec.gate;
  return page.evaluate(([lv, gate]) => {
    const g = window.__gtb, { simulate, CONSTS } = g;
    const ix = g.scratch(lv, 0);
    const L = g.LEVELS[ix];
    const R = Math.PI / 180;
    const ramp = (cx, cy, deg, len = 120) => {
      const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
      return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
    };
    const seeds = [1,2,3,4,5,6,7];
    const wins = cfg => seeds.every(s => simulate(cfg, s, ix).result === 'win');
    const sx = L.spawn.x;

    /* Does ANY ramp anywhere solve this board? Used twice: once on the level
       itself, and once on a copy with the featured mechanic deleted. If the
       stripped copy is still solvable, the mechanic is decoration and the
       candidate is rejected - "a solution uses the item" is a much weaker
       claim than "the item is the only way through", and it was the weaker
       one this gate used to make. */
    const solvableAnywhere = (slot, lvl, coarse) => {
      const j = g.scratch(lvl, slot);
      const step = coarse ? 6 : 4.5;
      for (let rx = 50; rx <= 430; rx += coarse ? 38 : 26)
        for (let ry = 140; ry <= 660; ry += coarse ? 28 : 22)
          for (let th = 25; th <= 155; th += step)
            if (simulate([ramp(rx, ry, th)], 1, j).result === 'win' &&
                seeds.every(sd => simulate([ramp(rx, ry, th)], sd, j).result === 'win'))
              return true;
      return false;
    };

    /* widest single-ramp band directly under the spawn - the ball falls
       straight down, so this is where a first ramp can actually be hit */
    let tol1 = 0, best = null;
    for (let ry = L.spawn.y + 80; ry <= CONSTS.H - 130; ry += 15){
      let run = 0, st = null;
      for (let th = 25; th <= 155; th += 1.5){
        if (simulate([ramp(sx, ry, th)], 1, ix).result === 'win'){
          if (!run) st = th;
          run += 1.5;
          if (run > tol1){ const c = [ramp(sx, ry, st + run / 2)];
                           if (wins(c)){ tol1 = run; best = c; } }
        } else run = 0;
      }
    }
    /* Pass 2: anywhere on the board. Pass 1 only looks under the spawn,
       which is where the ball falls - but a wind zone (and a bounce off a
       first ramp) throws it out of that column, so the ramp that solves the
       level is frequently nowhere near it. Coarse to find, then refine. */
    if (!best){
      for (let rx = 60; rx <= 420 && tol1 < 12; rx += 40)
        for (let ry = 150; ry <= 650 && tol1 < 12; ry += 30)
          for (let th = 25; th <= 155; th += 4.5){
            if (simulate([ramp(rx, ry, th)], 1, ix).result !== 'win') continue;
            let lo = th, hi = th;
            while (lo > 25  && simulate([ramp(rx, ry, lo - 1.5)], 1, ix).result === 'win') lo -= 1.5;
            while (hi < 155 && simulate([ramp(rx, ry, hi + 1.5)], 1, ix).result === 'win') hi += 1.5;
            const cfg = [ramp(rx, ry, (lo + hi) / 2)];
            if (hi - lo > tol1 && wins(cfg)){ tol1 = hi - lo; best = cfg; }
            break;                       // one hit per column is enough to refine
          }
    }

    /* constructed two-ramp route, for levels one ramp cannot solve */
    let sols2 = 0, best2 = null;
    const winners2 = [];
    if (L.maxBlocks >= 2 && !best){
      const tc = L.target, AIMS = [-18,-9,0,9,18];
      /* A patrolling target is aimed at along its whole lane - where it
         starts, the middle and the far waypoint - because the ball meets it
         wherever it has got to, not where it was parked. A static target is
         the one point it always was. */
      const mv = L.targetMove;
      const goals = mv ? [mv.x0, (mv.x0 + mv.x1) / 2, mv.x1] : [tc.x];
      outer:
      for (let ry = L.spawn.y + 90; ry <= CONSTS.H - 170; ry += 30)
        for (let t1 = 28; t1 <= 152; t1 += 8){
          const phi1 = (2 * t1 - 90) * R;
          for (let len = 80; len <= 440; len += 36){
            const p2 = { x: sx + Math.cos(phi1) * len, y: ry + Math.sin(phi1) * len };
            if (p2.x < 25 || p2.x > CONSTS.W - 25 || p2.y < 25 || p2.y > CONSTS.H - 55) continue;
            for (const gx of goals){
              const phi2 = Math.atan2(tc.y - p2.y, gx - p2.x);
              const aim = ((phi2 + phi1) / 2) * (180 / Math.PI);
              for (const A of AIMS){
                const cfg = [ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + A, 100)];
                if (wins(cfg)){ sols2++; winners2.push(cfg); if (!best2) best2 = cfg;
                                if (sols2 > 40) break outer; }
              }
            }
          }
        }
    }
    /* THE LONG WAY ROUND, found along the ball's real path. The constructed
       search above puts the second ramp on the STRAIGHT line the first ramp
       reflects along - fine for a target below and across, blind to a board
       whose route is a long arc out past a top-middle target and back. So on
       a board that demands the crossing, each first ramp is traced for real,
       and the second ramp is tried on the points where that ball actually
       passes the far side at the target's height. It only FINDS candidates:
       every one still has to win on all seven seeds, and every gate below
       still applies to it. */
    if (gate.requireCross && L.maxBlocks >= 2 && !best && sols2 <= 40){
      const dir = L.spawn.x < CONSTS.W / 2 ? 1 : -1, tc = L.target;
      const mv = L.targetMove;
      const farEdge = mv ? (dir > 0 ? Math.max(mv.x0, mv.x1) : Math.min(mv.x0, mv.x1)) : tc.x;
      const line = farEdge + dir * (tc.r + 30);
      outer3:
      for (let ry = L.spawn.y + 70; ry <= L.spawn.y + 200; ry += 16)
        for (let t1 = 22; t1 <= 158; t1 += 6){
          const r1 = ramp(sx, ry, t1);
          const tr = g.trace([r1], 1, ix);
          const pts = tr.samples.filter(p => dir * (p.x - line) > 12 &&
                                             p.y > tc.y - 130 && p.y < tc.y + 50);
          /* ONE route per first ramp. The second ramp can slide a few pixels
             along the same arc and still win, and counting each of those
             would grade a single way through as dozens - maxSols2 asks how
             many DIFFERENT ways there are. */
          route:
          for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 5))){
            const p = pts[k];
            for (let t2 = 20; t2 <= 160; t2 += 7){
              /* centred a little PAST the sample, so the ball meets the ramp
                 rather than being spawned inside it */
              const cfg = [r1, ramp(p.x + dir * 6, p.y + 6, t2, 100)];
              if (wins(cfg)){ sols2++; winners2.push(cfg); if (!best2) best2 = cfg;
                              if (sols2 > 40) break outer3;
                              break route; }
            }
          }
        }
    }
    const solution = best || best2;
    if (!solution) return { ok:false, why:'no solution', tol1:0, sols2:0 };

    /* fairness: the winning route must not be a lottery off a random bounce -
       this is the level 20 lesson, encoded */
    let hits = 0, w = 0, boosts = 0, picked = 0;
    for (const s of seeds){
      const r = simulate(solution, s, ix);
      hits += r.hits; if (r.result === 'win') w++;
      boosts += r.boosts; picked += r.stars;
    }
    const obHits = hits / seeds.length, seedWin = w / seeds.length;

    /* triviality: can a blind guess win it? */
    let rnd = 20250903;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let blind = 0; const N = 260;
    for (let k = 0; k < N; k++){
      const cfg = [];
      for (let j = 0; j < L.maxBlocks; j++)
        cfg.push(ramp(40 + rand() * (CONSTS.W - 80), 110 + rand() * (CONSTS.H - 260),
                      -85 + rand() * 170, 70 + rand() * 80));
      /* a blind player also drops whenever they like - on a patrolling board
         that is a random phase of the patrol, not its start */
      const bt0 = L.targetMove ? Math.floor(rand() * L.targetMove.period) : 0;
      if (simulate(cfg, 1 + (k % 7), ix, null, bt0).result === 'win') blind++;
    }
    blind /= N;

    const why = [];
    if (tol1 && tol1 < gate.minTol) why.push(`band ${tol1.toFixed(1)} < ${gate.minTol}`);
    if (tol1 && tol1 > gate.maxTol) why.push(`too easy, band ${tol1.toFixed(1)} > ${gate.maxTol.toFixed(1)}`);
    /* THE TWO-RAMP HOLE. `tol1` is 0 on a board no single ramp solves, and
       both checks above are guarded on it being non-zero - so a level that
       needed two ramps used to pass with NO difficulty ceiling at all. That
       is how a closing stretch ended up measurably easier than the middle of
       its own world: the hardest boards were the only ones nothing graded.
       `sols2` counts the constructed two-ramp routes that win (capped at 40),
       so it is the same "how many ways through are there" question that
       maxTol asks of a one-ramp board. */
    if (!tol1 && gate.maxSols2 && sols2 > gate.maxSols2)
      why.push(`too easy for 2 ramps, ${sols2} routes > ${gate.maxSols2}`);
    /* THE CLOSING STRETCH IS HARDER IN KIND, NOT IN DEGREE. Tightening the
       one-ramp band only ever makes a board a finer version of the same
       task, and measured against random two-ramp play the back half kept
       coming out no harder than the middle of its own world. This asks for
       something a player can feel instead: by the end of a world, ONE ramp
       must not be enough - the board has to be built, not aimed. */
    if (gate.requireTwoRamp && tol1)
      why.push(`a single ramp solves it (band ${tol1.toFixed(1)})`);
    if (blind > gate.maxBlind) why.push(`trivial ${(blind*100).toFixed(0)}%`);
    if (seedWin < 1) why.push(`seed-flaky ${(seedWin*100).toFixed(0)}%`);
    if (obHits > gate.maxObHits) why.push(`lottery ${obHits.toFixed(1)} obstacle hits`);
    /* RETIRED: `requireBoost`. It proved that a country's authored booster pad
       was unavoidable on the natural drop line and that a winning solution
       routed through it. No board authors a pad any more, so nothing sets the
       flag and the check is gone with it.

       The reasoning it established is still live, though, because the fire
       gate below is built in its shape, so it is worth keeping written down.
       The strongest claim - no solution exists without the mechanic - needs an
       exhaustive multi-ramp search of a stripped board to prove a NEGATIVE,
       and at this budget it rejected every candidate. So a gate of this kind
       proves two cheaper things that together are honest:
         1. the mechanic is UNAVOIDABLE on the natural line: drop with no ramps
            at all and the ball meets it. It is the board, not scenery.
         2. a verified winning solution routes through it.
       What that does NOT prove is that a clever player cannot find a route
       around it. In a puzzle game that is an acceptable second solution, not
       a defect - but it is not the same claim, so it is not made.

       The one board that DOES carry the strong negative is level 30, which is
       hand-tuned rather than generated, and tests/items.test.mjs is where it
       is proved: no ramp layout anywhere wins it, and the same ramp with a
       spring on it does. */
    /* FIRE has to be a wall, not furniture. The claim made here is the same
       shape as the spring's and just as honest: the UNRAMPED drop must burn,
       so the hazard is squarely on the line the ball takes when the player
       does nothing, and routing around it is the level. What it does not
       claim is that no route ignores the fire entirely - that would need the
       same exhaustive negative the spring gate declined to prove.

       Note this gate can only ever be reached by a candidate that already
       HAS a verified winning solution, above. A fire that walls off every
       ramp path fails earlier, as 'no solution' - which is exactly the
       unwinnable case this mechanic had to be swept for. */
    if (gate.requireFire){
      const bare = simulate([], 1, ix);
      if (bare.result !== 'burned') why.push('fire is off the natural drop line');
    }
    /* A MOVING TARGET has to be the reason the ball lands. Freeze the patrol
       and re-run the winning route: if it still wins, the target might as
       well have been nailed down and the mechanic is decoration. Cheap, and
       it is the precise thing the mechanic promises. */
    /* A ZONE has to be on the line the ball takes when the player does
       nothing, exactly like the booster and the fire before it. Checked
       geometrically rather than by simulation because wind and ice leave no
       counter behind on the result the way a boost or a teleport does - but
       the claim is the same one, and just as cheap to state honestly: the
       band straddles the spawn's fall line, so the drop goes through it. */
    if (gate.requireZone){
      const zones = gate.requireZone === 'wind' ? L.wind : L.slippery;
      const onLine = zones.some(z => sx >= z.x && sx <= z.x + z.w);
      if (!onLine) why.push(`${gate.requireZone} zone is off the natural drop line`);
    }
    /* STARS never touch the trajectory - that is the mechanic - so the thing
       to prove is not that they matter but that they are REACHABLE. A star
       no route can collect is scenery that looks like content. */
    if (gate.requireStars && picked / seeds.length < gate.requireStars)
      why.push(`only ${(picked / seeds.length).toFixed(1)} stars are on the winning route`);
    /* The combo countries. Counted rather than trusted to the template: the
       whole promise of Neonaka and Coralis is that more than one thing is
       happening at once, and a generator that quietly dropped one would still
       produce a perfectly winnable - and completely off-brief - board. */
    if (gate.minMechanics){
      const n = [L.boosters, L.wind, L.slippery, L.breakables,
                 L.fires, L.stars].filter(a => a.length > 0).length
              + (L.targetMove ? 1 : 0);
      if (n < gate.minMechanics) why.push(`only ${n} mechanics, wanted ${gate.minMechanics}`);
    }
    /* `moveMustMatter` is the same check made conditional: a country where
       patrols are optional still may not ship one that is decoration. */
    if (gate.requireMove || (gate.moveMustMatter && lv.targetMove)){
      const frozen = { ...lv, targetMove: undefined,
                       target: { ...lv.target, x: lv.targetMove.x0 } };
      const fz = g.scratch(frozen, 3);
      if (simulate(solution, 1, fz).result === 'win')
        why.push('the target may as well be static - the route wins frozen');
    }
    /* THE DROP WINDOW. A moving target is already moving while the player
       plans, so WHEN they let go is part of the solution: the layout wins
       only if the drop starts at the right phase of the patrol (t0). A proof
       at one exact step would be a proof that needs a frame-perfect tap, so
       the claim made is the honest one: the winning layout wins, on every
       seed, across a contiguous window of drop phases at least
       `minWindow` steps wide. Measured outward from the phase it was found
       at, wrapping round the patrol. */
    let dropWin = 0;
    if (L.targetMove){
      const P = L.targetMove.period;
      const at = t => seeds.every(s => simulate(solution, s, ix, null, ((t % P) + P) % P).result === 'win');
      let lo = 0, hi = 0;
      if (at(0)){
        while (hi + 1 < P && at(hi + 1)) hi++;
        while (lo - 1 > hi - P && at(lo - 1)) lo--;
        dropWin = hi - lo + 1;
      }
      if (gate.minWindow && dropWin < gate.minWindow)
        why.push(`drop window ${dropWin} steps < ${gate.minWindow}`);
      /* ...and the other side of the same coin: a layout that wins whenever
         it is dropped never asks the player to read the target at all. The
         patrol runs while they plan so that WHEN is part of the puzzle. */
      if ((gate.moveMustMatter || gate.requireMove) && dropWin >= P)
        why.push('the drop wins at every phase - timing never matters');
    }
    /* THE ROUTE HAS TO GO ALL THE WAY ROUND. A final-exam board puts the
       target top-middle and packs the middle; the point is that the ball is
       carried out PAST the target's far side and brought back in. So every
       winning route the sweep found - not just the one it keeps - is traced,
       and one that reaches the target without ever getting past its far edge
       is a shortcut the layout failed to close, and the board is rejected.
       "Far" is measured from the far end of the lane on a patrolling board. */
    if (gate.requireCross){
      const dir = L.spawn.x < CONSTS.W / 2 ? 1 : -1;
      const mv = L.targetMove;
      const farEdge = mv ? (dir > 0 ? Math.max(mv.x0, mv.x1) : Math.min(mv.x0, mv.x1))
                         : L.target.x;
      const line = farEdge + dir * (L.target.r + 30);
      const crosses = cfg => g.trace(cfg, 1, ix).samples.some(p => dir * (p.x - line) > 0);
      const routes = best ? [best] : winners2.slice(0, 16);
      const short = routes.filter(c => !crosses(c)).length;
      if (short) why.push(`${short}/${routes.length} routes reach the target without crossing the board`);
    }
    return { ok: why.length === 0, why: why.join(', '), solution, window: dropWin,
             tol1, sols2, blind, obHits, seedWin,
             boosts: boosts / seeds.length,
             picked: picked / seeds.length };
  }, [lv, gate]);
}

/* `taken` is this COUNTRY's targets and deliberately not the whole game's.
   Spreading targets is a within-country property - ten boards in a row that
   all end in the same corner read as one board played ten times - and two
   levels forty apart, in different countries with different mechanics and a
   different palette, may sit in the same spot without anyone noticing. The
   level harness encodes exactly that rule, and seeding this with every target
   in the game over-constrained a 480px board into an unsolvable placement
   problem by the third country. */
console.log(`\n  Generating country ${WORLD} - ${spec.name}  (levels ${FROM}-${TO})\n`);
const accepted = [];
let totalTries = 0;
/* Which ids in this country are hand-tuned and must not be regenerated. Read
   from the data file rather than from a list here, so the file is the one
   place that says which boards are hand-written. */
const DATA_SRC = fs.readFileSync(path.join(root, 'src/levels/levels.data.ts'), 'utf8');
const PRESERVED = new Set(
  (DATA_SRC.match(/\{ id:(\d+),(?:(?!\{ id:)[\s\S])*?needsSpring\s*:\s*true/g) || [])
    .map(m => +m.match(/id:(\d+)/)[1]));

/* WHICH TARGETS ARE WRAPPED, read out of the data file the same way.

   `targetGift` is a designer's decoration on a milestone board - it changes no
   geometry, so unlike `needsSpring` it is no reason to skip regenerating the
   level. It IS a reason to write the flag back out afterwards: a regeneration
   that silently unwrapped level 100's target would take a milestone away and
   nothing would fail. See fmt() below. */
/* (?!\{ id:) is load-bearing. Without it the lazy [\s\S]*? happily runs from
   ONE level's opening brace all the way to some LATER level's targetGift, so
   the id captured is the id of a level that has no gift at all - it stamped
   the flag onto level 21 the first time a country was regenerated under it.
   The guard stops the span at the next level object, so a match can only ever
   be a gift found inside the block it started in. */
const GIFTED = new Set(
  (DATA_SRC.match(/\{ id:(\d+),(?:(?!\{ id:)[\s\S])*?targetGift\s*:\s*true/g) || [])
    .map(m => +m.match(/id:(\d+)/)[1]));

/* THE WORLD'S LENGTH IS THE COUNTRY'S OWN RANGE, not a hard-coded ten.
   Verdholm holds twenty cities and Emberkeep now does too, so a generator
   that assumed ten silently produced half a world and spliced it over the
   top of the other half. Every template is handed `n` and shapes its arc
   from i/(n-1), which is what makes the pacing pattern reusable at any
   world length rather than only at ten. */
const N = TO - FROM + 1;

for (let i = 0; i < N; i++){
  const id = FROM + i;
  if (ONLY[0] && (id < ONLY[0] || id > (ONLY[1] || ONLY[0]))) continue;
  if (PRESERVED.has(id)){
    console.log(`  ${String(id).padStart(3)} (hand-tuned, kept as written)`);
    continue;
  }
  let got = null, tries = 0, lastWhy = '';
  const r = mulberry32(0xBEEF * WORLD + id * 7919);
  while (!got && tries < 240){
    tries++; totalTries++;
    const cand = spec.make(r, i, N, accepted.map(l => l.target));
    if (!cand){ lastWhy = 'target too close to another in this world'; continue; }
    cand.id = id;
    const v = await verify(cand, i, N);
    if (v.ok) got = { lv: cand, v }; else lastWhy = v.why || 'no solution';
    if (VERBOSE && !v.ok) console.log(`      ${id} try ${tries}: ${lastWhy}`);
    if (DUMP && !v.ok && tries <= 3)
      fs.appendFileSync(DUMP, JSON.stringify({ id, tries, why: lastWhy, cand, solution: v.solution }) + '\n');
  }
  if (!got){
    console.log(`  ! LEVEL ${id}: no acceptable candidate in ${tries} tries - last reason: ${lastWhy}`);
    console.log('    The generation constraints need tuning; nothing was written.');
    await browser.close();
    process.exit(2);
  }
  const { lv, v } = got;
  accepted.push(lv);
  console.log(`  ${String(id).padStart(3)} ${lv.name.padEnd(12)} ${lv.targetType.padEnd(10)} ` +
    `blk ${lv.maxBlocks}  haz ${String(hazards(lv)).padStart(2)}${lv.targetMove ? '*' : ' '} ` +
    `(f${(lv.fires || []).length} o${lv.obstacles.length} b${(lv.breakables || []).length})  ` +
    `band ${(v.tol1 ? '±' + v.tol1.toFixed(1) + '°' : '2r:' + v.sols2).padStart(7)}  ` +
    `blind ${(v.blind*100).toFixed(1).padStart(4)}%  ` +
    `obHits ${v.obHits.toFixed(1)}  boosts ${v.boosts.toFixed(1)}` +
    (lv.targetMove ? `  window ${v.window}/${lv.targetMove.period}` : '') + `  (${tries} tries)`);
}
const COUNTRY_TABLE = await page.evaluate(() =>
  window.__gtb.COUNTRIES.map(c => ({ id: c.id, name: c.name, from: c.from, to: c.to })));
await browser.close();

console.log(`\n  All ${ONLY[0] ? accepted.length : N} verified. ${totalTries} candidates tried, ${accepted.length} accepted.`);

if (WRITE){
  const fmt = lv => {
    const parts = [`id:${lv.id}`, `name:${JSON.stringify(lv.name)}`,
                   `maxBlocks:${lv.maxBlocks}`, `targetType:'${lv.targetType}'`];
    if (lv.targetType === 'SIDE_WALL' || lv.targetType === 'POCKET')
      parts.push(`wallSide:'${lv.wallSide}'`);
    if (lv.gapW) parts.push(`gapW:${lv.gapW}`);
    const num = v => Number.isInteger(v) ? v : +v.toFixed(2);
    const circ = o => `{x:${num(o.x)},y:${num(o.y)},r:${num(o.r)}}`;
    let out = `  { ${parts.join(', ')},\n`;
    out += `    spawn:{x:${num(lv.spawn.x)},y:${num(lv.spawn.y)}},\n`;
    out += `    obstacles:[${lv.obstacles.map(circ).join(',')}],\n`;
    if (lv.boosters && lv.boosters.length)
      out += `    boosters:[${lv.boosters.map(b =>
        `{x:${num(b.x)},y:${num(b.y)},r:${num(b.r)},angle:${num(b.angle)},speed:${num(b.speed)}}`).join(',')}],\n`;
    if (lv.wind && lv.wind.length)
      out += `    wind:[${lv.wind.map(z =>
        `{x:${num(z.x)},y:${num(z.y)},w:${num(z.w)},h:${num(z.h)},ax:${num(z.ax||0)},ay:${num(z.ay||0)}}`).join(',')}],\n`;
    if (lv.slippery && lv.slippery.length)
      out += `    slippery:[${lv.slippery.map(z =>
        `{x:${num(z.x)},y:${num(z.y)},w:${num(z.w)},h:${num(z.h)}}`).join(',')}],\n`;
    if (lv.breakables && lv.breakables.length)
      out += `    breakables:[${lv.breakables.map(circ).join(',')}],\n`;
    if (lv.stars && lv.stars.length)
      out += `    stars:[${lv.stars.map(s => `{x:${num(s.x)},y:${num(s.y)}}`).join(',')}],\n`;
    if (lv.fires && lv.fires.length)
      out += `    fires:[${lv.fires.map(circ).join(',')}],\n`;
    /* Written back out so a regeneration cannot silently strip the mystery
       boxes off this country. A NEW level has none until tools/genboxes.mjs
       is re-run, which is the step that places and verifies them. */
    if (lv.boxes && lv.boxes.length)
      out += `    boxes:[${lv.boxes.map(s => `{x:${num(s.x)},y:${num(s.y)}}`).join(',')}],\n`;
    out += `    target:{x:${num(lv.target.x)},y:${num(lv.target.y)},r:${num(lv.target.r)}}`;
    if (lv.targetMove)
      out += `,\n    targetMove:{x0:${num(lv.targetMove.x0)},x1:${num(lv.targetMove.x1)},` +
             `period:${num(lv.targetMove.period)}}`;
    // the wrapped-target flag survives a regeneration - see GIFTED above
    if (GIFTED.has(lv.id) || lv.targetGift) out += `, targetGift:true`;
    out += ` }`;
    return out;
  };
  const file = path.join(root, 'src/levels/levels.data.ts');
  let src = fs.readFileSync(file, 'utf8');
  const S = '/* GEN:START */', E = '/* GEN:END */';
  const a = src.indexOf(S), b = src.indexOf(E);
  if (a < 0 || b < 0) throw new Error('generation markers missing from src/levels/levels.data.ts');
  const existing = src.slice(a + S.length, b);
  /* Keep every world already written and replace only this one's range.
     Chunks are split on the start of a level object; anything that is not a
     level object (the world header comments this writes) is dropped and
     regenerated below, so headers can never accumulate or drift out of order. */
  const keep = existing
    .split(/\n(?=  \{ id:)/)
    .map(blk => blk.trim())
    .filter(blk => /^\{ id:\d+/.test(blk.replace(/^\s*/, '')))
    /* Shed any country header that trails this block. The split is on the
       START of a level object, so the header comment introducing the NEXT
       country rides along on the back of the last level of the previous one.
       Left on, the regrouping below appends a comma after it and emits a
       fresh header, which lands as a stray comma after a closed comment in
       the middle of the array - a hole, and a level that reads as
       `undefined`. Only shows up when a second
       country is written after a first already exists, which is why it sat
       here unnoticed while there was just the one. */
    .map(blk => blk.replace(/(?:,?\s*\/\*[\s\S]*?\*\/)+\s*$/, ''))
    .map(blk => blk.replace(/,\s*$/, ''))
    /* HAND-TUNED BOSSES SURVIVE A REGENERATION. A level carrying
       `needsSpring` was authored by hand against a claim the generator
       cannot make - that no ramp layout solves it - and re-rolling it would
       quietly replace a proved board with an ordinary one. Kept, and its slot
       skipped above. */
    .filter(blk => { const id = +blk.match(/id:(\d+)/)[1];
                     if (/needsSpring\s*:\s*true/.test(blk)) return true;
                     return id < FROM || id > TO; })
    .map(blk => '  ' + blk.replace(/^\s+/, ''));
  const blocks = keep.concat(accepted.map(fmt))
    .sort((x, y) => (+x.match(/id:(\d+)/)[1]) - (+y.match(/id:(\d+)/)[1]));
  // regroup under fresh per-world headers
  let body = '\n';
  let lastWorld = null;
  for (const blk of blocks){
    const id = +blk.match(/id:(\d+)/)[1];
    /* Looked up, for the same reason FROM is: the id no longer tells you
       which country a level belongs to by arithmetic. */
    const c = COUNTRY_TABLE.find(x => id >= x.from && id <= x.to);
    const w = c ? c.id : 0;
    if (w !== lastWorld){
      const nm = c ? c.name : ('Country ' + w);
      body += (lastWorld === null ? '' : ',\n') + '\n  /* ---- Country ' + w + ': ' + nm +
              ' (levels ' + c.from + '-' + c.to + ') ---- */\n';
      lastWorld = w;
      body += blk;
    } else {
      body += ',\n' + blk;
    }
  }
  body += '\n';
  src = src.slice(0, a + S.length) + body + src.slice(b);
  fs.writeFileSync(file, src);
  console.log(`  Written into src/levels/levels.data.ts (levels ${FROM}-${TO}).`);
} else {
  console.log('  (dry run - pass --write to splice these into src/levels/levels.data.ts)');
}
