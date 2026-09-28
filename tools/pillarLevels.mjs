/**
 * The exam boards' PILLAR - replaces the giant oval on every level that had
 * one (positions 17-20 of each world).
 *
 *   node tools/pillarLevels.mjs              # every oval level
 *   node tools/pillarLevels.mjs 17 38 99     # just these
 *
 * The idea the oval was standing in for is a LOOP: the ball drops down one
 * side of the board, goes round underneath, and comes back UP the other side
 * into the target. A pillar says that directly - a column hanging from above
 * the board, stopping short of the floor - so the board becomes two lanes
 * joined only under the pillar's foot.
 *
 * Each level keeps everything it had - spawn, target and its up/down patrol,
 * name, gift, box, wind, storm, crabs, every hazard - and only:
 *   - loses its oval and gains a pillar between the spawn's lane and the
 *     target's lane, its foot BELOW the target's lowest point, so the target
 *     can only be reached from underneath, on the way back up;
 *   - moves any hazard, box, crab loop or strike point the pillar now covers
 *     (hazards keep the 2 * BALL_R spacing law, to each other AND the pillar).
 *
 * Then each candidate is PROVED in the real simulator on the level's seed:
 *   - a spring solution exists (rounded to whole pixels, and still winning
 *     with the layout nudged a few pixels - it becomes the level's hint);
 *   - and no plain-ramp layout wins, so the board still needs its spring.
 * A level tries a few pillar placements, closest to the old layout first,
 * and keeps the first that passes both. One that passes none is reported and
 * left exactly as it was.
 */
import { chromium } from 'playwright';
import { attachHarness } from './harness.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HINTS = path.join(root, 'src/levels/hints.data.ts');
const W = 480, H = 800, GAP = 18, WALL_HT = 5;

/* ---------------- geometry ---------------- */
function rng(seed){ return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const gapOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
/** Clear air between a point and the pillar's surface (negative = inside). */
function pillarDist(p, q){
  const hw = p.w / 2, cy = p.bottom - hw;
  const dy = q.y < cy ? 0 : q.y - cy;
  return Math.hypot(q.x - p.x, dy) - hw;
}
const clearOfPillar = (p, c) => pillarDist(p, c) - c.r >= GAP;

/* ---------------- one candidate ---------------- */
function build(raw, cfg, seed){
  const r = rng(seed);
  const L = structuredClone(raw);
  delete L.ovals;
  const t = L.target, tm = L.targetMove;
  const right = (tm ? tm.x0 : t.x) > W / 2;
  const tx = tm ? tm.x0 : t.x;
  const yLow = (tm && tm.y1 !== undefined ? Math.max(tm.y0, tm.y1) : t.y) + t.r;
  const edge = right ? tx - t.r - cfg.lane : tx + t.r + cfg.lane;           // pillar edge nearest the target
  const px = Math.round(right ? edge - cfg.w / 2 : edge + cfg.w / 2);
  const pillar = { x: px, bottom: Math.round(yLow + cfg.drop), w: cfg.w };
  if (H - pillar.bottom < 150) return null;                                  // room to go under it
  if (Math.abs(L.spawn.x - px) < cfg.w / 2 + 60) return null;               // the drop is not on it
  L.pillars = [pillar];

  /* the target's lane, kept clear like the oval levels kept it */
  const y0 = tm ? tm.y0 : t.y, y1 = tm && tm.y1 !== undefined ? tm.y1 : t.y;
  const laneGap = c => {
    const k = y1 === y0 ? 0 : Math.max(0, Math.min(1, (c.y - y0) / (y1 - y0)));
    return Math.hypot(c.x - tx, c.y - (y0 + k * (y1 - y0))) - c.r - t.r;
  };
  const kinds = [['obstacles', 'o'], ['fires', 'f'], ['breakables', 'b']];
  const all = [];
  for (const [key] of kinds) for (const c of L[key] || []) all.push(c);
  const ok = (c, self) => clearOfPillar(pillar, c) && laneGap(c) >= 55
    && Math.hypot(c.x - L.spawn.x, c.y - L.spawn.y) >= c.r + 90
    && c.x - c.r >= 6 && c.x + c.r <= W - 6 && c.y - c.r >= 110 && c.y + c.r <= H - 16
    && all.every(q => q === self || gapOf(c, q) >= GAP);
  for (const c of all){
    if (clearOfPillar(pillar, c) && laneGap(c) >= 55) continue;             // unaffected: stays put
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 400; k++){
      const cand = { x: rint(r, c.r + 8, W - c.r - 8), y: rint(r, 130, H - c.r - 24), r: c.r };
      if (!ok(cand, c)) continue;
      // stay near where it was, spread from the others
      let score = -Math.hypot(cand.x - c.x, cand.y - c.y) * 0.3;
      for (const q of all) if (q !== c) score += Math.min(0, gapOf(cand, q) - 60) * 0.5;
      if (score > bestScore){ bestScore = score; best = cand; }
    }
    if (!best) return null;
    c.x = best.x; c.y = best.y;
  }

  /* the box: out of the pillar */
  for (const b of L.boxes || []){
    const bc = { ...b, r: 20 };
    if (pillarDist(pillar, bc) >= 20 + 10) continue;
    let moved = false;
    for (let k = 0; k < 400 && !moved; k++){
      const c = { x: rint(r, 40, W - 40), y: rint(r, 150, H - 40), r: 20 };
      if (pillarDist(pillar, c) >= 30 && laneGap(c) >= 30 && all.every(q => gapOf(c, q) >= GAP)){ b.x = c.x; b.y = c.y; moved = true; }
    }
    if (!moved) return null;
  }

  /* strike points: never inside the pillar */
  if (L.storm) for (const p of L.storm.points){
    if (pillarDist(pillar, { x: p.x, y: p.y }) >= 20) continue;
    const side = p.x < px ? -1 : 1;
    p.x = Math.round(px + side * (cfg.w / 2 + 30));
    if (p.x < 20 || p.x > W - 20) return null;
  }
  return L;
}

/* A crab's whole loop has to stay clear of the pillar, or it would walk
   through it. Sampled from the game's own path function. */
async function crabPath(){
  const esbuild = (await import('esbuild')).default;
  const out = await esbuild.build({ stdin: { contents: `export { crabPathAt } from './src/levels/crab';`, resolveDir: root, loader: 'ts' },
                                    bundle: true, write: false, format: 'esm', platform: 'node' });
  return (await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))).crabPathAt;
}
function fixCrabs(L, crabPathAt){
  if (!L || !L.crabs) return L;
  const p = L.pillars[0];
  const clear = c => { for (let i = 0; i < 64; i++){ const q = crabPathAt(c, i / 64); if (pillarDist(p, q) < c.r + 12) return false; } return true; };
  for (const c of L.crabs){
    if (clear(c)) continue;
    const away = c.cx < p.x ? -1 : 1;
    let fixed = false;
    for (let d = 10; d <= 160 && !fixed; d += 10){
      const t = { ...c, cx: c.cx + away * d };
      if (t.cx - c.rx < 10 || t.cx + c.rx > W - 10) continue;
      if (clear(t)){ c.cx = t.cx; fixed = true; }
    }
    for (let s = 0.9; s >= 0.5 && !fixed; s -= 0.1){
      const t = { ...c, rx: Math.round(c.rx * s), ry: Math.round(c.ry * s) };
      if (clear(t)){ c.rx = t.rx; c.ry = t.ry; fixed = true; }
    }
    if (!fixed) return null;
  }
  return L;
}

/* ---------------- proof, in the real simulator ---------------- */
async function prove(ids, budgetMs){
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await attachHarness(page, {});        // {}: a fresh bundle - the level data just changed
  const res = {};
  for (const id of ids){
    res[id] = await page.evaluate(([id, budgetMs]) => {
      const { LEVELS, simulate, trace, levelSeed } = window.__gtb;
      const li = LEVELS.findIndex(l => l.id === id);
      const lv = LEVELS[li], seed = levelSeed(id);
      const R = Math.PI / 180;
      const ramp = (cx, cy, deg, len = 120) => {
        const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
        return { x1: Math.round(cx - hx), y1: Math.round(cy - hy), x2: Math.round(cx + hx), y2: Math.round(cy + hy) };
      };
      const cycles = [];
      if (lv.targetMove) cycles.push(lv.targetMove.period);
      if (lv.crabs) for (const c of lv.crabs) cycles.push(c.period);
      if (lv.storm) cycles.push(lv.storm.gaps.reduce((a, b) => a + b, 0));
      const T = cycles.length ? Math.min(360, Math.max(...cycles)) : 0;
      const t0s = T ? Array.from({ length: Math.ceil(T / 10) }, (_, k) => k * 10) : [0];
      const wins = (v, t0) => simulate(v, seed, li, null, Math.max(0, t0)).result === 'win';
      const shift = (v, dx, dy) => v.map(s => ({ ...s, x1: s.x1 + dx, x2: s.x2 + dx, y1: s.y1 + dy, y2: s.y2 + dy }));
      const robust = (v, t0) => [[3, 0], [-3, 0], [0, 3], [0, -3]].filter(([dx, dy]) => wins(shift(v, dx, dy), t0)).length >= 3
        && (!T || (wins(v, t0 - 2) && wins(v, t0 + 2)));
      const P = lv.pillars[0], sx = lv.spawn.x;
      const dir = lv.target.x > P.x ? 1 : -1;                 // which way the loop goes

      /* THE LOOP: a plain ramp in the drop's lane throws the ball under the
         foot; a second ramp in the target's lane throws it back up. Found by
         tracing where the first ramp actually sends it. With `spring` the
         second ramp carries one; without, this is the search for a way
         round that needs no spring at all - which must come up empty. */
      let tries = 0;
      const loop = (spring, budget, wantRobust) => {
        const deadline = performance.now() + budget;
        let fallback = null;
        for (let ry = lv.spawn.y + 90; ry <= P.bottom + 60; ry += 24)
          for (let t1 = 10; t1 <= 80; t1 += 6){
            if (performance.now() > deadline) return fallback;
            const th = dir > 0 ? t1 : 180 - t1;               // slope down toward the pillar
            const r1 = ramp(sx, ry, th);
            const pts = trace([r1], seed, li).samples;
            for (let k = 0; k < pts.length; k += 5){
              const q = pts[k];
              // under the foot and into the target's lane, below the target
              if (dir * (q.x - P.x) < P.w / 2 + 14 || q.y < lv.target.y + 40 || q.y > 780) continue;
              for (let t2 = 0; t2 < 180; t2 += 12){
                if (performance.now() > deadline) return fallback;
                const r2 = { ...ramp(q.x + Math.sign(q.vx || dir) * 4, q.y + 8, t2, 110), ...(spring ? { spring: true } : {}) };
                for (const t0 of t0s){
                  tries++;
                  if (!wins([r1, r2], t0)) continue;
                  const plan = { ramps: [r1, r2], t0: T ? t0 : undefined, robust: false };
                  if (!wantRobust) return plan;
                  if (robust([r1, r2], t0)) return { ...plan, robust: true };
                  fallback ??= plan;
                }
              }
            }
          }
        return fallback;
      };
      /* NO PLAIN WIN: one ramp anywhere, then the loop without a spring */
      let plain = null;
      const coarse = t0s.length > 4 ? t0s.filter((_, i) => i % Math.ceil(t0s.length / 4) === 0) : t0s;
      one:
      for (let ry = 80; ry <= 760; ry += 24)
        for (let rx = 20; rx <= 460; rx += 30)
          for (let th = 0; th < 180; th += 9)
            for (const t0 of coarse)
              if (wins([ramp(rx, ry, th)], t0)){ plain = { one: [rx, ry, th], t0 }; break one; }
      if (!plain){ const p = loop(false, 15000, false); if (p) plain = { loop: p.ramps, t0: p.t0 }; }
      const plan = plain ? null : loop(true, budgetMs, true);
      return { plain, plan, tries };
    }, [id, budgetMs]);
  }
  await browser.close();
  return res;
}

/* ---------------- driver ---------------- */
const raws = await loadRaw();
const want = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const ids = (want.length ? want : raws.filter(l => l.ovals && l.ovals.length).map(l => l.id));
const orig = Object.fromEntries(ids.map(id => [id, structuredClone(raws.find(l => l.id === id))]));
const crabPathAt = await crabPath();

/* nearest the old layout first: a comfortable lane, a foot a little below the target */
const CFGS = [];
for (const drop of [40, 70, 25, 100])
  for (const lane of [70, 90, 55])
    CFGS.push({ w: 56, lane, drop });

const done = {}, hints = {};
let pending = [...ids];
/* --no-proof: place every pillar at the first placement that fits, prove
   nothing, and drop those levels' hints (the old ones were for the oval). */
if (process.argv.includes('--no-proof')){
  for (const id of ids)
    for (let ci = 0; ci < CFGS.length && !done[id]; ci++){
      const L = fixCrabs(build(structuredClone(orig[id]), CFGS[ci], id * 7919 + ci), crabPathAt);
      if (L) done[id] = L;
    }
  writeLevels(Object.values(done));
  const src = fs.readFileSync(HINTS, 'utf8');
  fs.writeFileSync(HINTS, src.split('\n').filter(l => !ids.some(id => l.startsWith(`  ${id}: `))).join('\n'));
  console.log(`pillars placed (unproved): ${Object.keys(done).join(', ')}; not placed: ${ids.filter(i => !done[i]).join(', ') || '-'}`);
  process.exit(0);
}
for (let ci = 0; ci < CFGS.length && pending.length; ci++){
  const cfg = CFGS[ci];
  const cand = {};
  for (const id of pending){
    const base = structuredClone(orig[id]);
    const L = fixCrabs(build(base, cfg, id * 7919 + ci), crabPathAt);
    if (L) cand[id] = L;
  }
  const tryIds = Object.keys(cand).map(Number);
  if (!tryIds.length) continue;
  writeLevels(tryIds.map(id => cand[id]));
  const res = await prove(tryIds, 60000);
  for (const id of tryIds){
    const r = res[id];
    const tag = `${id}: cfg ${JSON.stringify(cfg)}`;
    if (r.plain){ console.log(`${tag} - REJECT, a plain ramp wins ${JSON.stringify(r.plain)}`); continue; }
    if (!r.plan){ console.log(`${tag} - REJECT, no spring loop found (${r.tries} tries)`); continue; }
    console.log(`${tag} - OK${r.plan.robust ? '' : ' (hint exact only)'}`);
    done[id] = cand[id]; hints[id] = r.plan;
  }
  pending = pending.filter(id => !done[id]);
  /* what did not pass goes back exactly as it was before the next round */
  if (pending.length) writeLevels(pending.map(id => orig[id]));
}
writeLevels(Object.values(done));
if (pending.length) writeLevels(pending.map(id => orig[id]));

/* the hints: the proof's own plan, merged into the hint file */
const src = fs.readFileSync(HINTS, 'utf8');
const m = src.match(/HINTS: Record<number, Hint> = (\{[\s\S]*\});/);
const all = Function(`return (${m[1]})`)();
for (const [id, p] of Object.entries(hints)) all[id] = { ramps: p.ramps, t0: p.t0 };
const body = Object.keys(all).map(Number).sort((a, b) => a - b).map(id => {
  const e = all[id];
  const ramps = e.ramps.map(s => `{ x1: ${s.x1}, y1: ${s.y1}, x2: ${s.x2}, y2: ${s.y2}${s.spring ? ', spring: true' : ''} }`).join(', ');
  return `  ${id}: { ramps: [${ramps}]${e.t0 !== undefined ? `, t0: ${e.t0}` : ''} },`;
}).join('\n');
fs.writeFileSync(HINTS, src.replace(/HINTS: Record<number, Hint> = \{[\s\S]*\};/, `HINTS: Record<number, Hint> = {\n${body}\n};`));

console.log(`\npillars: ${Object.keys(done).length} of ${ids.length}` +
            (pending.length ? `; still an oval (no placement passed): ${pending.join(', ')}` : ''));
void spawnSync;
