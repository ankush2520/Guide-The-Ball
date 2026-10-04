/**
 * PATTERN OBSTACLES - re-lay every level's red obstacles as a clean pattern
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
const [A, B] = (args.find(a => /^\d+-\d+$/.test(a)) || '1-140').split('-').map(Number);
const W = 480, H = 800, GAP = 24;

const out = await esbuild.build({
  stdin: { contents: `export { LEVELS } from './src/levels/index';
                      export { WALL_HT } from './src/physics/constants';
                      export { crabPathAt } from './src/levels/crab';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{"DEV":true}' },
});
const { LEVELS, WALL_HT, crabPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
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

/* ---------------- the pattern generators: each returns ordered points ---------------- */
const margin = r => r + 20;
const TOP = 100;   // obstacles may sit this high, away from the spawn (legal() keeps the drop clear)
const PATTERNS = {
  /* staggered pegs: rows alternate between n and n-1 pegs, like a pachinko board */
  pegs(L, r, { cols, rowGap, y0 }) {
    const mx = margin(r), cs = (W - 2 * mx) / (cols - 1), pts = [];
    if (cs < 2 * r + GAP + 4 || Math.hypot(cs / 2, rowGap) < 2 * r + GAP + 4) return null;
    for (let i = 0, y = y0; y < H - mx; i++, y += rowGap)
      if (i % 2 === 0) for (let k = 0; k < cols; k++) pts.push({ x: mx + k * cs, y });
      else for (let k = 0; k < cols - 1; k++) pts.push({ x: mx + cs / 2 + k * cs, y });
    return pts;
  },
  /* chevrons: nested V / inverted-V lines */
  chevrons(L, r, { rowGap, step, y0, up }) {
    const pts = [], cx = W / 2, dx = step, dy = step * 0.62;
    if (Math.hypot(dx, dy) < 2 * r + GAP + 4) return null;
    for (let y = y0; y < H - margin(r); y += rowGap)
      for (let k = 0; k * dx <= W / 2 - margin(r) + 1; k++) {
        const yy = up ? y - k * dy : y + k * dy;
        pts.push({ x: cx - k * dx, y: yy }); if (k) pts.push({ x: cx + k * dx, y: yy });
      }
    return pts;
  },
  /* diagonal rails that zig-zag: bands of slashes, alternating slope */
  zigzag(L, r, { band, lineGap, step, y0 }) {
    const pts = [], dy = step * 0.7;
    if (Math.hypot(step, dy) < 2 * r + GAP + 4) return null;
    for (let b = 0, yb = y0; yb < H - margin(r); b++, yb += band) {
      const dir = b % 2 ? -1 : 1;
      for (let x0 = margin(r) - (dir > 0 ? 0 : 0); x0 < W - margin(r) + lineGap; x0 += lineGap)
        for (let k = 0; k < 3; k++) pts.push({ x: x0 + dir * k * step, y: yb + k * dy });
    }
    return pts;
  },
  /* concentric rings round the board's middle band */
  rings(L, r, { n1, R, cy }) {
    const pts = [], cx = W / 2;
    for (const [n, rad] of [[n1, R], [Math.max(3, Math.round(n1 * 0.55)), R * 0.5]]) {
      if (2 * rad * Math.sin(Math.PI / n) < 2 * r + GAP + 4) return null;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (rad === R ? 0 : Math.PI / n); pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }); }
    }
    return pts;
  },
};

function* params(name, L, r) {
  const yMin = TOP;
  if (name === 'pegs') for (const cols of [3, 4, 5]) for (let rowGap = 60; rowGap <= 160; rowGap += 6) for (let y0 = yMin; y0 <= yMin + 90; y0 += 15) yield { cols, rowGap, y0 };
  if (name === 'chevrons') for (let step = 60; step <= 110; step += 8) for (let rowGap = 120; rowGap <= 300; rowGap += 20) for (let y0 = yMin; y0 <= yMin + 80; y0 += 16) for (const up of [false, true]) yield { rowGap, step, y0, up };
  if (name === 'zigzag') for (let step = 56; step <= 90; step += 8) for (let lineGap = 110; lineGap <= 200; lineGap += 10) for (let band = 110; band <= 240; band += 14) for (let y0 = yMin; y0 <= yMin + 60; y0 += 20) yield { band, lineGap, step, y0 };
  if (name === 'rings') for (let n1 = 6; n1 <= 12; n1++) for (let R = 100; R <= 190; R += 10) for (let cy = 300; cy <= 560; cy += 20) yield { n1, R, cy };
}

/* Pick N of the pattern's points so they cover the board evenly: farthest-point
   sampling, seeded with the point nearest the middle. */
function spreadPick(pts, N) {
  if (pts.length <= N) return pts.slice();
  const cx = W / 2, cy = (TOP + H) / 2;
  let first = pts.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
  const out = [first], d = pts.map(q => Math.hypot(q.x - first.x, q.y - first.y));
  while (out.length < N) {
    let k = 0; for (let i = 1; i < pts.length; i++) if (d[i] > d[k]) k = i;
    out.push(pts[k]);
    for (let i = 0; i < pts.length; i++) d[i] = Math.min(d[i], Math.hypot(pts[i].x - pts[k].x, pts[i].y - pts[k].y));
  }
  return out;
}

/* How well a set fills the WHOLE board: bounding-box coverage, how even the
   spacing is, and how little of the pattern had to be thinned out. */
function scoreOf(pts, N, over, r) {
  const ux = W - 2 * (r + 18), uy = (H - r - 18) - TOP;
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  const cover = N < 2 ? 1 : Math.min(1, (Math.max(...xs) - Math.min(...xs) + 2 * r) / ux) * Math.min(1, (Math.max(...ys) - Math.min(...ys) + 2 * r) / uy);
  let md = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) md = Math.min(md, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  const even = N < 2 ? 1 : Math.min(1, md / Math.sqrt((ux * uy) / N));
  return cover * 2 + even * 1.5 - (over / N);
}

function layOut(L, N, r, name) {
  let best = null;
  for (const p of params(name, L, r)) {
    const raw = PATTERNS[name](L, r, p);
    if (!raw) continue;
    const pts = [];
    for (const q of raw) {
      const x = Math.round(q.x), y = Math.round(q.y);
      if (!legal(L, x, y, r)) continue;
      if (pts.some(o => Math.hypot(o.x - x, o.y - y) < 2 * r + GAP)) continue;
      pts.push({ x, y });
    }
    if (pts.length < N) continue;
    const kept = spreadPick(pts, N), score = scoreOf(kept, N, pts.length - N, r);
    if (!best || score > best.score) best = { score, pts: kept.sort((a, b) => a.y - b.y || a.x - b.x), p, name };
  }
  return best;
}

/* ---------------- main ---------------- */
const ORDER = ['pegs', 'chevrons', 'zigzag', 'rings'];
let changed = 0, kept = 0;
const writes = [];
for (const raw of raws) {
  if (raw.id < A || raw.id > B) continue;
  const L = LEVELS.find(l => l.id === raw.id);
  if (raw.movers?.length) {
    raw.obstacles = [...(raw.obstacles ?? []), ...raw.movers.map(m => ({ x: m.cx, y: m.cy, r: m.r }))];
    delete raw.movers;
  }
  const N = (raw.obstacles ?? []).length;
  if (raw.needsSpring) { console.log(`level ${raw.id}: spring exam - untouched`); kept++; continue; }
  if (!N) { kept++; continue; }
  const r = Math.max(16, Math.min(21, Math.round(raw.obstacles.reduce((a, o) => a + o.r, 0) / N)));
  const pick = n => {
    let b = null;
    ORDER.forEach((name, i) => {
      const c = layOut(L, n, r, name);
      if (c && (c.score += (i === raw.id % ORDER.length ? 0.4 : 0)) && (!b || c.score > b.score)) b = c;
    });
    return b;
  };
  let chosen = pick(N) ?? pick(N - 1);
  if (!chosen) { console.log(`level ${raw.id}: no clean pattern fits ${N} obstacles - left as authored`); kept++; continue; }
  console.log(`level ${raw.id}: ${chosen.name} ${chosen.pts.length}/${N} obstacles, r ${r}, score ${chosen.score.toFixed(2)}`);
  raw.obstacles = chosen.pts.map(q => ({ x: q.x, y: q.y, r }));
  writes.push(raw); changed++;
}
console.log(`\n${changed} levels re-laid, ${kept} left alone.`);
if (APPLY) { writeLevels(writes); console.log('written to src/levels/levels.data.ts'); }
else console.log('dry run - add --apply to write.');
