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
import { attachHarness } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORLD = Number(process.argv[2]);
const WRITE = process.argv.includes('--write');
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
const rng  = (r, lo, hi) => lo + r() * (hi - lo);
const rint = (r, lo, hi) => Math.round(rng(r, lo, hi));

/* ---------------------------------------------------------------- */
/* Country specs. `make` builds a candidate; `gate` is what it must clear.
   Keyed by country id - country 2 is Solmesa, levels 21-30. */
/* ---------------------------------------------------------------- */

/** Distance from a point to every existing circle, for overlap rejection. */
function clear(pt, rad, list, pad = 12){
  return list.every(o => Math.hypot(o.x - pt.x, o.y - pt.y) > o.r + rad + pad);
}

const SPECS = {
  2: {
    name: 'Solmesa',
    /* Boost Ridge teaches one idea: a booster is a promise. The ball goes in,
       and it leaves on exactly the heading the chevron draws, every time.
       So the boards are deliberately uncluttered - the booster must be the
       thing that solves the level, not a hazard among hazards. */
    /* The gate tightens across the world, so 21 is a lesson and 30 is a test.
       maxTol is the ceiling on the winning angle window: without it the
       generator happily produced a level 27 at +/-57 degrees, which is more
       forgiving than level 1 and would have flattened the whole curve. */
    gate: i => ({ minTol: 3, maxTol: 24 - i * 1.2, maxBlind: 0.06,
                  requireBoost: true, maxObHits: 1.2 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 70, 150) : rint(r, 330, 410), y: 40 };
      // the booster sits under the spawn's fall line, so an ordinary first
      // ramp can feed it - that is the shape the solver sweeps for
      // directly in the ball's fall line: the booster is not an optional
      // detour in this world, it is the road. A player's ramp shapes the
      // approach or catches the exit, but the boost always happens.
      const bx = spawn.x + rint(r, -12, 12);
      const by = rint(r, 250, 350);
      // fire it across the board, downward, toward the far side
      const toward = leftSpawn ? 1 : -1;
      const angle = toward > 0 ? rint(r, -34, 22) : rint(r, 158, 214);
      const boosters = [{ x: clampX(bx, 46), y: by, r: rint(r, 28, 34),
                          angle, speed: rng(r, 9.5, 12.4) }];
      /* Far corner from the spawn, and LOW. Horizontal reach is the thing a
         booster buys that a ramp cannot: put the target far enough across and
         deep enough down and an unboosted ball simply runs out of board
         before it gets there. That is what makes the mechanic load-bearing
         rather than decorative.
         No two levels in a world may share a target spot - ten boards that
         all end in the same corner read as one board played ten times.
         Placement retries here rather than failing the candidate, so a
         crowded world spends its solver budget on physics and not on dice. */
      let target = null;
      for (let a = 0; a < 80 && !target; a++){
        const tx = leftSpawn ? rint(r, 330, 424) : rint(r, 56, 150);
        const ty = rint(r, 585, 730);
        if (Math.abs(tx - spawn.x) < 215) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 40) };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 250, 600), r: rint(r, 28, 36) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (!clear(o, o.r, boosters, 22)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 220) continue;
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return {
        name: pick(r, last ? ['Ridgeline'] : BOOST_NAMES),
        // two ramps throughout: a third just gives the solver enough rope to
        // route around the booster, which is the one thing this world teaches
        maxBlocks: 2,
        targetType: last ? 'POCKET' : (i >= 6 ? 'SIDE_WALL' : 'OPEN'),
        wallSide: leftSpawn ? 'right' : 'left',
        spawn, obstacles, boosters, target
      };
    }
  },

  6: {
    name: 'Emberkeep',
    /* Emberkeep layers FIRE onto the breakable blocks it already had, and the
       two are deliberately opposites in the same country: a breakable is a
       hazard you are allowed to spend a drop on, a fire is one you are not.
       Learning which is which IS the country, so every board carries both. */
    /* Bands stay wide compared to Solmesa. The difficulty here is a routing
       decision, not a precision one - asking for both at once produces boards
       that fail for the wrong reason and teach nothing. */
    gate: i => ({ minTol: 3, maxTol: 26 - i * 1.1, maxBlind: 0.05,
                  requireFire: true, maxObHits: 1.4 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 80, 170) : rint(r, 310, 400), y: 40 };
      /* THE FIRE SITS IN THE FALL LINE. That is the whole board: do nothing
         and you burn, so the first ramp is not an optimisation, it is the
         only way the drop survives. Placed high enough that the player has
         room to turn the ball before reaching it. */
      const fires = [{ x: clampX(spawn.x + rint(r, -10, 10), 40),
                       y: rint(r, 215, 300), r: rint(r, 24, 30) }];
      if (last) {
        // the closing board gets a second one, guarding the far approach
        const f2 = { x: clampX(spawn.x + (leftSpawn ? 190 : -190), 60),
                     y: rint(r, 380, 460), r: rint(r, 22, 27) };
        if (clear(f2, f2.r, fires, 30)) fires.push(f2);
      }
      /* Target across and low, so the route has to travel rather than just
         sidestep the flame and drop. */
      /* A WIDE band, and many attempts. Emberkeep is the third country to be
         written into a board 480 wide, so most of the low corners are already
         somebody else's target - a narrow window here does not produce a
         harder level, it produces a generator that runs out of dice. */
      let target = null;
      for (let a = 0; a < 220 && !target; a++){
        const tx = leftSpawn ? rint(r, 270, 424) : rint(r, 56, 210);
        const ty = rint(r, 545, 745);
        if (Math.abs(tx - spawn.x) < 150) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        if (!clear({ x: tx, y: ty }, 40, fires, 26)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 38) };
      }
      if (!target) return null;
      /* Breakables sit between the fire and the target: something the route
         is allowed to go THROUGH, next to something it is not. */
      const breakables = [];
      const wantB = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (breakables.length < wantB && guard++ < 200){
        const o = { x: rint(r, 70, 410), y: rint(r, 330, 600), r: rint(r, 26, 34) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (!clear(o, o.r, fires, 26)) continue;
        if (!clear(o, o.r, breakables, 16)) continue;
        breakables.push(o);
      }
      const obstacles = [];
      if (i >= 4){
        let g2 = 0;
        while (obstacles.length < 1 && g2++ < 120){
          const o = { x: rint(r, 70, 410), y: rint(r, 340, 580), r: rint(r, 26, 32) };
          if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
          if (!clear(o, o.r, fires, 24) || !clear(o, o.r, breakables, 18)) continue;
          obstacles.push(o);
        }
      }
      return {
        name: pick(r, last ? ['Crucible'] : FIRE_NAMES),
        maxBlocks: 2,
        // OPEN throughout bar the closer: the fire is the obstruction this
        // country is about, and walls would add a second unrelated one
        targetType: last ? 'SIDE_WALL' : 'OPEN',
        wallSide: leftSpawn ? 'right' : 'left',
        spawn, obstacles, breakables, fires, target
      };
    }
  },

  10: {
    name: 'Needlecrest',
    /* Needlecrest is the precision country, and a MOVING target is precision
       in the one axis the game had never asked for: when. The bands are the
       tightest in the game, and the target is small - but the real difficulty
       is that arriving in the right place at the wrong moment is a miss. */
    gate: i => ({ minTol: 2, maxTol: 16 - i * 0.8, maxBlind: 0.035,
                  requireMove: true, maxObHits: 1.0 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 90, 170) : rint(r, 310, 390), y: 40 };
      /* The patrol runs ACROSS the board, and the ball has to meet it partway.
         x0 is where it sits while the player plans, so the board they look at
         is honest about where the run begins. */
      let target = null, move = null;
      for (let a = 0; a < 90 && !target; a++){
        const span = rint(r, 90, 180);
        const x0 = rint(r, 60, 420 - span);
        const x1 = x0 + span;
        const ty = rint(r, 600, 720);
        /* Compared on x0, which is what gets STORED as target.x and what the
           board shows while the player plans. Comparing the patrol's midpoint
           instead let two levels with different spans share an identical
           starting spot and still pass - the spread check downstream reads
           target.x, so the dedupe key has to be the same field. */
        if (taken.some(t => Math.hypot(t.x - x0, t.y - ty) < 46)) continue;
        /* The period is the mechanic's only tuning knob, in STEPS. A ball
           takes roughly 80-110 steps to reach this depth, so a period in this
           band means the target has crossed at least once - and at the short
           end, several times - by the time it arrives. */
        const period = rint(r, 70, 210);
        target = { x: x0, y: ty, r: last ? rint(r, 20, 24) : rint(r, 22, 28) };
        move = { x0, x1, period };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 240, 560), r: rint(r, 24, 32) };
        if (o.y > target.y - 110) continue;          // keep the approach clean
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return {
        name: pick(r, last ? ['The Needle'] : MOVE_NAMES),
        maxBlocks: 2,
        // OPEN is not a style choice here: walls are built from the target
        // centre and would be dragged along by the patrol. See levels/index.
        targetType: 'OPEN',
        spawn, obstacles, target, targetMove: move
      };
    }
  }
,

  /* ---------------------------------------------------------------- */
  /* The remaining ten countries. Every mechanic they use was already
     built and shipped - what was missing was only the level data, which
     is why these are specs and not engine work. */
  /* ---------------------------------------------------------------- */

  3: {
    name: 'Windemere',
    /* Wind is the first mechanic that acts on the ball CONTINUOUSLY rather
       than at a moment, so the boards give it room: a wide band the ball
       falls through, and a target placed where only the drift can reach. */
    gate: i => ({ minTol: 3, maxTol: 25 - i * 1.1, maxBlind: 0.06,
                  requireZone: 'wind', maxObHits: 1.2 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 80, 150) : rint(r, 330, 400), y: 40 };
      const toward = leftSpawn ? 1 : -1;
      /* Spanning the spawn column, so the drop cannot miss it. The push is
         well under WIND_CAP - the cap is a safety rail, not a target. */
      const zy = rint(r, 200, 300), zh = rint(r, 170, 260);
      const wind = [{ x: 0, y: zy, w: W, h: zh,
                      ax: toward * rng(r, 0.35, 0.95), ay: 0 }];
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = leftSpawn ? rint(r, 290, 430) : rint(r, 50, 190);
        const ty = rint(r, 580, 740);
        if (Math.abs(tx - spawn.x) < 165) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 38) };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 300, 600), r: rint(r, 26, 34) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['The Gale'] : WIND_NAMES), maxBlocks: 2,
               targetType: last ? 'SIDE_WALL' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, wind, target };
    }
  },

  4: {
    name: 'Frostvale',
    /* Ice makes the ball keep what a bounce would normally cost it, so the
       difficulty is SETTLING, not reaching. The sheet therefore sits low, in
       the approach to the target, where overshooting is the failure. */
    gate: i => ({ minTol: 3, maxTol: 24 - i * 1.1, maxBlind: 0.055,
                  requireZone: 'slippery', maxObHits: 1.2 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 80, 160) : rint(r, 320, 400), y: 40 };
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = leftSpawn ? rint(r, 280, 425) : rint(r, 55, 200);
        const ty = rint(r, 600, 740);
        if (Math.abs(tx - spawn.x) < 150) continue;
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 38) };
      }
      if (!target) return null;
      // full width so it always straddles the fall line, and deep enough to
      // cover the run-in to the target
      const zy = rint(r, 360, 470);
      const slippery = [{ x: 0, y: zy, w: W, h: rint(r, 180, 280) }];
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 260, 560), r: rint(r, 26, 34) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['Black Ice'] : ICE_NAMES), maxBlocks: 2,
               targetType: last ? 'POCKET' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, slippery, target };
    }
  },

  5: {
    name: 'Zunmara Ruins',
    /* A portal pair is a shortcut across the board, so the target goes where
       falling alone cannot reach it - the far side, high enough that the ball
       would run out of board before drifting there. */
    gate: i => ({ minTol: 3, maxTol: 24 - i * 1.1, maxBlind: 0.055,
                  requirePortal: true, maxObHits: 1.2 }),
    make(r, i, n, taken){
      const last = i === n - 1;
      const leftSpawn = i % 2 === 0;
      const spawn = { x: leftSpawn ? rint(r, 80, 160) : rint(r, 320, 400), y: 40 };
      // mouth on the fall line, exit across the board and lower
      const ax = clampX(spawn.x + rint(r, -14, 14), 46);
      const ay = rint(r, 230, 330);
      const bx = leftSpawn ? rint(r, 290, 420) : rint(r, 60, 190);
      const by = rint(r, 420, 560);
      const portals = [{ id: 'p1', a: { x: ax, y: ay, r: rint(r, 26, 32) },
                         b: { x: bx, y: by, r: rint(r, 26, 32) } }];
      let target = null;
      for (let a = 0; a < 200 && !target; a++){
        const tx = clampX(bx + rint(r, -90, 90), 56);
        const ty = rint(r, 640, 745);
        if (taken.some(t => Math.hypot(t.x - tx, t.y - ty) < 44)) continue;
        target = { x: tx, y: ty, r: last ? rint(r, 26, 30) : rint(r, 30, 38) };
      }
      if (!target) return null;
      const obstacles = [];
      const want = last ? 3 : (i < 3 ? 1 : 2);
      let guard = 0;
      while (obstacles.length < want && guard++ < 200){
        const o = { x: rint(r, 60, 420), y: rint(r, 300, 620), r: rint(r, 26, 34) };
        if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
        if (!clear(o, o.r, [portals[0].a, portals[0].b], 24)) continue;
        if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['The Gateway'] : PORTAL_NAMES), maxBlocks: 2,
               targetType: last ? 'SIDE_WALL' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, portals, target };
    }
  },

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
        if (!clear(o, o.r, obstacles, 16)) continue;
        obstacles.push(o);
      }
      return { name: pick(r, last ? ['Constellation'] : STAR_NAMES), maxBlocks: 2,
               targetType: last ? 'SIDE_WALL' : 'OPEN',
               wallSide: leftSpawn ? 'right' : 'left',
               spawn, obstacles, stars, target };
    }
  },

  8: {
    name: 'Neonaka',
    /* Two mechanics at once, and the pair rotates through the country so it
       never becomes one gimmick repeated ten times. */
    gate: i => ({ minTol: 2.5, maxTol: 22 - i * 1.0, maxBlind: 0.05,
                  minMechanics: 2, maxObHits: 1.2 }),
    make(r, i, n, taken){ return combo(r, i, n, taken, 2, COMBO_NAMES, 'Overload'); }
  },

  9: {
    name: 'Coralis Deep',
    gate: i => ({ minTol: 2.5, maxTol: 20 - i * 0.9, maxBlind: 0.045,
                  minMechanics: 3, maxObHits: 1.2 }),
    make(r, i, n, taken){ return combo(r, i, n, taken, 3, DEEP_NAMES, 'The Trench'); }
  },

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
        if (!clear(o, o.r, obstacles, 16)) continue;
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
        if (!clear(o, o.r, obstacles, 14)) continue;
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
     its whole pool instead of landing on the same pair six times. */
  const POOL = ['booster', 'wind', 'slippery', 'portal', 'breakable', 'star'];
  const chosen = [];
  for (let k = 0; k < POOL.length && chosen.length < want; k++)
    chosen.push(POOL[(i + k) % POOL.length]);

  for (const m of chosen){
    if (m === 'booster'){
      const angle = toward > 0 ? rint(r, -30, 20) : rint(r, 160, 210);
      lv.boosters = [{ x: clampX(spawn.x + rint(r, -12, 12), 46), y: rint(r, 230, 320),
                       r: rint(r, 28, 34), angle, speed: rng(r, 9.5, 12.4) }];
    } else if (m === 'wind'){
      lv.wind = [{ x: 0, y: rint(r, 300, 380), w: W, h: rint(r, 150, 220),
                   ax: toward * rng(r, 0.3, 0.8), ay: 0 }];
    } else if (m === 'slippery'){
      lv.slippery = [{ x: 0, y: rint(r, 430, 500), w: W, h: rint(r, 150, 220) }];
    } else if (m === 'portal'){
      const bx = leftSpawn ? rint(r, 280, 410) : rint(r, 70, 200);
      lv.portals = [{ id: 'p1',
                      a: { x: clampX(spawn.x + rint(r, -12, 12), 46), y: rint(r, 210, 280), r: rint(r, 26, 31) },
                      b: { x: bx, y: rint(r, 430, 540), r: rint(r, 26, 31) } }];
    } else if (m === 'breakable'){
      lv.breakables = [{ x: rint(r, 90, 390), y: rint(r, 340, 560), r: rint(r, 26, 33) }];
    } else if (m === 'star'){
      lv.stars = [0, 1].map(k => ({
        x: clampX(Math.round(spawn.x + (target.x - spawn.x) * ((k + 1) / 3) + rint(r, -35, 35)), 30),
        y: Math.round(spawn.y + (target.y - spawn.y) * ((k + 1) / 3) + rint(r, -25, 25)) }));
    }
  }

  const solids = [lv.boosters, lv.breakables].filter(Boolean).flat()
    .concat(lv.portals ? [lv.portals[0].a, lv.portals[0].b] : []);
  const wantOb = last ? 3 : (i < 3 ? 1 : 2);
  let guard = 0;
  while (lv.obstacles.length < wantOb && guard++ < 240){
    const o = { x: rint(r, 60, 420), y: rint(r, 260, 600), r: rint(r, 24, 32) };
    if (!clear(o, o.r, [{ x: target.x, y: target.y, r: target.r + 26 }], 14)) continue;
    if (!clear(o, o.r, solids, 22)) continue;
    if (Math.abs(o.x - spawn.x) < o.r + 20 && o.y < 200) continue;
    if (!clear(o, o.r, lv.obstacles, 16)) continue;
    lv.obstacles.push(o);
  }
  lv.name = last ? bossName : pick(r, names);
  if (last) lv.targetType = 'SIDE_WALL';
  return lv;
}

const WIND_NAMES = ['Crosswind','The Drift','Squall','Headwind','Bluster','Leeward','Updraught'];
const ICE_NAMES  = ['Glasswork','Skid','The Rink','Hoarfrost','Slick','Frostbite','Glide'];
const PORTAL_NAMES = ['Threshold','The Loop','Shortcut','Wayhouse','Passage','Relay','Doorstep'];
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
                    'Hot Gate','Flashpoint','Smoulder','Kiln'];
const MOVE_NAMES = ['Metronome','Pendulum','Crosswalk','The Shuttle','Tempo',
                    'Sidestep','Drift','Interception','Windowpane'];
function clampX(v, m){ return Math.max(m, Math.min(W - m, v)); }

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
async function verify(lv, i){
  const gate = typeof spec.gate === 'function' ? spec.gate(i) : spec.gate;
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
       candidate is rejected - "a solution uses the booster" is a much weaker
       claim than "the booster is the only way through", and it was the weaker
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
       which is where the ball falls - but a booster (and later a portal or a
       wind zone) throws it out of that column, so the ramp that solves the
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
    if (L.maxBlocks >= 2 && !best){
      const tc = L.target, AIMS = [-18,-9,0,9,18];
      outer:
      for (let ry = L.spawn.y + 90; ry <= CONSTS.H - 170; ry += 30)
        for (let t1 = 28; t1 <= 152; t1 += 8){
          const phi1 = (2 * t1 - 90) * R;
          for (let len = 80; len <= 440; len += 36){
            const p2 = { x: sx + Math.cos(phi1) * len, y: ry + Math.sin(phi1) * len };
            if (p2.x < 25 || p2.x > CONSTS.W - 25 || p2.y < 25 || p2.y > CONSTS.H - 55) continue;
            const phi2 = Math.atan2(tc.y - p2.y, tc.x - p2.x);
            const aim = ((phi2 + phi1) / 2) * (180 / Math.PI);
            for (const A of AIMS){
              const cfg = [ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + A, 100)];
              if (wins(cfg)){ sols2++; if (!best2) best2 = cfg; if (sols2 > 40) break outer; }
            }
          }
        }
    }
    const solution = best || best2;
    if (!solution) return { ok:false, why:'no solution', tol1:0, sols2:0 };

    /* fairness: the winning route must not be a lottery off a random bounce -
       this is the level 20 lesson, encoded */
    let hits = 0, w = 0, boosts = 0, teles = 0, picked = 0;
    for (const s of seeds){
      const r = simulate(solution, s, ix);
      hits += r.hits; if (r.result === 'win') w++;
      boosts += r.boosts; teles += r.teleports; picked += r.stars;
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
      if (simulate(cfg, 1 + (k % 7), ix).result === 'win') blind++;
    }
    blind /= N;

    const why = [];
    if (tol1 && tol1 < gate.minTol) why.push(`band ${tol1.toFixed(1)} < ${gate.minTol}`);
    if (tol1 && tol1 > gate.maxTol) why.push(`too easy, band ${tol1.toFixed(1)} > ${gate.maxTol.toFixed(1)}`);
    if (blind > gate.maxBlind) why.push(`trivial ${(blind*100).toFixed(0)}%`);
    if (seedWin < 1) why.push(`seed-flaky ${(seedWin*100).toFixed(0)}%`);
    if (obHits > gate.maxObHits) why.push(`lottery ${obHits.toFixed(1)} obstacle hits`);
    /* What "the mechanic matters" is allowed to mean here.
       The strongest claim - no solution exists without the booster - needs an
       exhaustive multi-ramp search of a stripped board to prove a NEGATIVE,
       and at this budget it rejected every candidate. So the gate proves two
       cheaper things that together are honest:
         1. the booster is UNAVOIDABLE on the natural line: drop with no ramps
            at all and the ball goes through it. It is the board, not scenery.
         2. a verified winning solution routes through it.
       What this does NOT prove is that a clever player cannot find a route
       around it. In a puzzle game that is an acceptable second solution, not
       a defect - but it is not the same claim, so it is not made. */
    if (gate.requireBoost){
      const bare = simulate([], 1, ix);
      if (bare.boosts < 1) why.push('booster is off the natural drop line');
      else if (boosts / seeds.length < 0.99) why.push('no solution routes through it');
    }
    /* FIRE has to be a wall, not furniture. The claim made here is the same
       shape as the booster's and just as honest: the UNRAMPED drop must burn,
       so the hazard is squarely on the line the ball takes when the player
       does nothing, and routing around it is the level. What it does not
       claim is that no route ignores the fire entirely - that would need the
       same exhaustive negative the booster gate declined to prove.

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
    /* A PORTAL is load-bearing when the winning route actually goes through
       it. Unlike a zone this one leaves a counter, so it is measured rather
       than inferred. */
    if (gate.requirePortal && teles / seeds.length < 0.99)
      why.push('no solution routes through the portal');
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
      const n = [L.boosters, L.wind, L.slippery, L.portals, L.breakables,
                 L.fires, L.stars].filter(a => a.length > 0).length
              + (L.targetMove ? 1 : 0);
      if (n < gate.minMechanics) why.push(`only ${n} mechanics, wanted ${gate.minMechanics}`);
    }
    if (gate.requireMove){
      const frozen = { ...lv, targetMove: undefined,
                       target: { ...lv.target, x: lv.targetMove.x0 } };
      const fz = g.scratch(frozen, 3);
      if (simulate(solution, 1, fz).result === 'win')
        why.push('the target may as well be static - the route wins frozen');
    }
    return { ok: why.length === 0, why: why.join(', '),
             tol1, sols2, blind, obHits, seedWin,
             boosts: boosts / seeds.length, teles: teles / seeds.length,
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
for (let i = 0; i < 10; i++){
  const id = FROM + i;
  let got = null, tries = 0, lastWhy = '';
  const r = mulberry32(0xBEEF * WORLD + id * 7919);
  while (!got && tries < 240){
    tries++; totalTries++;
    const cand = spec.make(r, i, 10, accepted.map(l => l.target));
    if (!cand){ lastWhy = 'target too close to another in this world'; continue; }
    cand.id = id;
    const v = await verify(cand, i);
    if (v.ok) got = { lv: cand, v }; else lastWhy = v.why || 'no solution';
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
    `blk ${lv.maxBlocks}  ob ${lv.obstacles.length}  ` +
    `band ${(v.tol1 ? '±' + v.tol1.toFixed(1) + '°' : '2-ramp').padStart(7)}  ` +
    `blind ${(v.blind*100).toFixed(1).padStart(4)}%  ` +
    `obHits ${v.obHits.toFixed(1)}  boosts ${v.boosts.toFixed(1)}  (${tries} tries)`);
}
const COUNTRY_TABLE = await page.evaluate(() =>
  window.__gtb.COUNTRIES.map(c => ({ id: c.id, name: c.name, from: c.from, to: c.to })));
await browser.close();

console.log(`\n  All 10 verified. ${totalTries} candidates tried, ${accepted.length} accepted.`);

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
    if (lv.portals && lv.portals.length)
      out += `    portals:[${lv.portals.map(p =>
        `{id:'${p.id}',a:{x:${num(p.a.x)},y:${num(p.a.y)},r:${num(p.a.r)}},` +
        `b:{x:${num(p.b.x)},y:${num(p.b.y)},r:${num(p.b.r)}${p.b.facing!=null?`,facing:${num(p.b.facing)}`:''}}}`).join(',')}],\n`;
    if (lv.breakables && lv.breakables.length)
      out += `    breakables:[${lv.breakables.map(circ).join(',')}],\n`;
    if (lv.stars && lv.stars.length)
      out += `    stars:[${lv.stars.map(s => `{x:${num(s.x)},y:${num(s.y)}}`).join(',')}],\n`;
    if (lv.fires && lv.fires.length)
      out += `    fires:[${lv.fires.map(circ).join(',')}],\n`;
    out += `    target:{x:${num(lv.target.x)},y:${num(lv.target.y)},r:${num(lv.target.r)}}`;
    if (lv.targetMove)
      out += `,\n    targetMove:{x0:${num(lv.targetMove.x0)},x1:${num(lv.targetMove.x1)},` +
             `period:${num(lv.targetMove.period)}}`;
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
    .filter(blk => { const id = +blk.match(/id:(\d+)/)[1]; return id < FROM || id > TO; })
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
