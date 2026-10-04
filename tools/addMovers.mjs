/**
 * ADD MOVERS - turn a few of a world-one level's red obstacles into MOVING
 * bumpers (slide / rise / orbit), keeping every gap rule.
 *
 *   node tools/addMovers.mjs [from-to] [--apply]     (default levels 6-16)
 *
 * PATTERN OBSTACLES (the geometry checks below are shared with that tool) - re-lay every level's red obstacles as a clean pattern
 * (staggered pegs, chevrons, diagonals, rings) instead of a random scatter.
 *
 *   node tools/patternObstacles.mjs            # dry run: prints what it would do
 *   node tools/patternObstacles.mjs --apply    # writes src/levels/levels.data.ts
 *   node tools/patternObstacles.mjs 21-40      # a range
 *
 * Only the red obstacles move. Spawn, target, walls, pillars, fires, breakables,
 * crabs, stars, boxes, hazards zones are left alone and every new obstacle keeps
 * a >= GAP edge-to-edge gap from all of them and from each other (the same
 * passable-gap rule tools/checkSpacing.mjs enforces). Spring-exam levels
 * (needsSpring) are NEVER touched: their obstacles are part of a proved route.
 *
 * NOTE: this does not prove solvability. Re-run the solver tools afterwards.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaw, writeLevels } from './levelData.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [A, B] = (args.find(a => /^\d+-\d+$/.test(a)) || '6-16').split('-').map(Number);
const W = 480, H = 800, GAP = 24;

const out = await esbuild.build({
  stdin: { contents: `export { LEVELS } from './src/levels/index';
                      export { WALL_HT } from './src/physics/constants';
                      export { crabPathAt } from './src/levels/crab';
                      export { moverPathAt } from './src/levels/mover';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{"DEV":true}' },
});
const { LEVELS, WALL_HT, crabPathAt, moverPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const raws = await loadRaw();

const segDist = (px, py, s) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
};

function cupSpots(L) {
  const tm = L.targetMove, T = L.target;
  if (!tm) return [T];
  const y0 = tm.y0 ?? T.y, y1 = tm.y1 ?? y0;
  return [0, .25, .5, .75, 1].map(k => ({ x: tm.x0 + (tm.x1 - tm.x0) * k, y: y0 + (y1 - y0) * k, r: T.r }));
}

/** is a circle of radius r at (x,y) allowed on this level (ignoring other new obstacles)? */
function legal(L, x, y, r) {
  if (x < r + 18 || x > W - r - 18 || y < r + 18 || y > H - r - 18) return false;
  const sp = L.spawn;
  if (Math.hypot(x - sp.x, y - sp.y) < 115) return false;
  if (Math.abs(x - sp.x) < r + 24 && y > sp.y && y < sp.y + 150) return false;
  for (const c of cupSpots(L)) {
    if (Math.hypot(x - c.x, y - c.y) < c.r + r + GAP + 10) return false;
    if (Math.abs(x - c.x) < 0.92 * c.r + r + GAP && y > c.y - 0.42 * c.r - 100 && y < c.y + c.r + r + GAP) return false;
  }
  for (const s of L.walls) if (segDist(x, y, s) < r + WALL_HT + GAP) return false;
  for (const p of L.pillars ?? []) {
    const hw = p.w / 2, cy = p.bottom - hw;
    if (Math.hypot(x - p.x, y < cy ? 0 : y - cy) < hw + r + GAP) return false;
  }
  for (const h of [...(L.fires ?? []), ...(L.breakables ?? [])]) if (Math.hypot(x - h.x, y - h.y) < h.r + r + GAP + 2) return false;
  for (const h of L.stars ?? []) if (Math.hypot(x - h.x, y - h.y) < r + 30) return false;
  for (const h of L.boxes ?? []) if (Math.hypot(x - h.x, y - h.y) < r + 34) return false;
  for (const h of L.boosters ?? []) if (Math.hypot(x - h.x, y - h.y) < (h.r ?? 20) + r + 24) return false;
  for (const h of L.blackholes ?? []) if (Math.hypot(x - h.x, y - h.y) < Math.max(h.r + 30, h.reach * 0.6) + r) return false;
  for (const h of L.quicksand ?? []) if (Math.hypot(x - h.x, y - h.y) < h.r + r + 14) return false;
  for (const h of L.storm?.points ?? []) if (Math.hypot(x - h.x, y - h.y) < r + 32) return false;
  for (const f of L.crabs ?? []) {
    for (let i = 0; i < 48; i++) { const p = crabPathAt(f, i / 48); if (Math.hypot(x - p.x, y - p.y) < f.r + r + GAP + 2) return false; }
  }
  return true;
}


const KINDS = ['slide', 'rise', 'orbit'];
const sample = m => Array.from({ length: 48 }, (_, i) => moverPathAt(m, i / 48));
let changed = 0;
const writes = [];
for (const raw of raws) {
  if (raw.id < A || raw.id > B || raw.needsSpring) continue;
  const L = LEVELS.find(l => l.id === raw.id);
  const pos = ((raw.id - 1) % 20) + 1;
  const statics = [...(raw.obstacles ?? [])];
  if (statics.length < 3) { console.log(`level ${raw.id}: too few obstacles - skipped`); continue; }
  const want = pos <= 9 ? 1 : pos <= 13 ? 2 : 3;
  const movers = [];
  // try the lower-middle obstacles first: they are the ones a ball reaches after its first ramp
  const order = statics.map((o, i) => ({ o, i })).sort((a, b) => Math.abs(a.o.y - 460) - Math.abs(b.o.y - 460));
  const used = new Set();
  for (const { o, i } of order) {
    if (movers.length >= want) break;
    for (let t = 0; t < 3 && !used.has(i); t++) {
      const pattern = KINDS[(raw.id + movers.length + t) % 3];
      for (const range of pattern === 'orbit' ? [40, 34, 28] : [64, 54, 44, 34]) {
        const m = { cx: o.x, cy: o.y, r: o.r, pattern, range, period: 330 + ((raw.id * 37 + movers.length * 53) % 90), phase: Math.round(((movers.length * 0.37 + raw.id * 0.11) % 1) * 100) / 100 };
        const pts = sample(m);
        const others = statics.filter((_, j) => j !== i && !used.has(j));
        let ok = pts.every(p => legal(L, Math.round(p.x), Math.round(p.y), o.r));
        ok = ok && pts.every(p => others.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= o.r + q.r + GAP));
        ok = ok && movers.every(mm => sample(mm).every(q => pts.every(p => Math.hypot(p.x - q.x, p.y - q.y) >= o.r + mm.r + GAP)));
        if (ok) { movers.push({ ...m, cx: Math.round(m.cx), cy: Math.round(m.cy) }); used.add(i); break; }
      }
    }
  }
  if (!movers.length) { console.log(`level ${raw.id}: no obstacle has room to move - skipped`); continue; }
  raw.obstacles = statics.filter((_, i) => !used.has(i));
  raw.movers = movers;
  console.log(`level ${raw.id}: ${movers.map(m => `${m.pattern}@${m.cx},${m.cy} +-${m.range}`).join('  ')}  (${raw.obstacles.length} still)`);
  writes.push(raw); changed++;
}
console.log(`\n${changed} levels given moving bumpers.`);
if (APPLY) { writeLevels(writes); console.log('written to src/levels/levels.data.ts'); } else console.log('dry run - add --apply to write.');
