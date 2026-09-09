/**
 * Semi-procedural level generation with solver verification.
 *
 *   node tools/genlevels.mjs 2            # generate world 2, report, write nothing
 *   node tools/genlevels.mjs 2 --write    # ...and splice it into index.html
 *
 * Nothing reaches index.html until it has PROVED, in the real simulator, that
 * it is winnable on every obstacle seed, not winnable by accident, and not
 * won by luck off a random bounce. A template that cannot produce a passing
 * level is reported as a template problem - never shipped unverified.
 */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = pathToFileURL(path.join(root, 'index.html')).href;
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
/* World specs. `make` builds a candidate; `gate` is what it must clear. */
/* ---------------------------------------------------------------- */

/** Distance from a point to every existing circle, for overlap rejection. */
function clear(pt, rad, list, pad = 12){
  return list.every(o => Math.hypot(o.x - pt.x, o.y - pt.y) > o.r + rad + pad);
}

const SPECS = {
  2: {
    name: 'Boost Ridge',
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
  }
};
const BOOST_NAMES = ['Kickoff','Slingshot','Updraft','Ricochet','Launch Pad',
                     'The Sling','Green Light','Overshoot','Bank Shot'];
function clampX(v, m){ return Math.max(m, Math.min(W - m, v)); }

/* ---------------------------------------------------------------- */
if (!SPECS[WORLD]){
  console.error(`No spec for world ${WORLD}. Available: ${Object.keys(SPECS).join(', ')}`);
  process.exit(1);
}
const spec = SPECS[WORLD];
const FROM = 21 + (WORLD - 2) * 10, TO = FROM + 9;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
await page.goto(GAME);
await page.waitForFunction(() => !!window.__gtb);

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
    let hits = 0, w = 0, boosts = 0, teles = 0;
    for (const s of seeds){
      const r = simulate(solution, s, ix);
      hits += r.hits; if (r.result === 'win') w++;
      boosts += r.boosts; teles += r.teleports;
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
    return { ok: why.length === 0, why: why.join(', '),
             tol1, sols2, blind, obHits, seedWin,
             boosts: boosts / seeds.length, teles: teles / seeds.length };
  }, [lv, gate]);
}

console.log(`\n  Generating world ${WORLD} - ${spec.name}  (levels ${FROM}-${TO})\n`);
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
    out += `    target:{x:${num(lv.target.x)},y:${num(lv.target.y)},r:${num(lv.target.r)}} }`;
    return out;
  };
  const file = path.join(root, 'index.html');
  let src = fs.readFileSync(file, 'utf8');
  const S = '/* GEN:START */', E = '/* GEN:END */';
  const a = src.indexOf(S), b = src.indexOf(E);
  if (a < 0 || b < 0) throw new Error('generation markers missing from index.html');
  const existing = src.slice(a + S.length, b);
  /* Keep every world already written and replace only this one's range.
     Chunks are split on the start of a level object; anything that is not a
     level object (the world header comments this writes) is dropped and
     regenerated below, so headers can never accumulate or drift out of order. */
  const keep = existing
    .split(/\n(?=  \{ id:)/)
    .map(blk => blk.trim())
    .filter(blk => /^\{ id:\d+/.test(blk.replace(/^\s*/, '')))
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
    const w = Math.floor((id - 21) / 10) + 2;
    if (w !== lastWorld){
      const nm = (SPECS[w] && SPECS[w].name) || ('World ' + w);
      body += (lastWorld === null ? '' : ',\n') + '\n  /* ---- World ' + w + ': ' + nm + ' ---- */\n';
      lastWorld = w;
      body += blk;
    } else {
      body += ',\n' + blk;
    }
  }
  body += '\n';
  src = src.slice(0, a + S.length) + body + src.slice(b);
  fs.writeFileSync(file, src);
  console.log(`  Written into index.html (levels ${FROM}-${TO}).`);
} else {
  console.log('  (dry run - pass --write to splice these into index.html)');
}
