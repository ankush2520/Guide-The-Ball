/**
 * SKETCH LEVELS - rebuild world one's levels 6-16 to the hand-drawn template:
 *
 *        ball
 *    o              o        <- normal obstacles, high and wide
 *         o | o              <- a static bar with an obstacle each side
 *         o | o              <- a second bar (from level 8)
 *     O ->      <- O         <- two moving obstacles sliding toward each other
 *            [cup]           <- the cup, LOWEST thing on the board
 *
 *   node tools/sketchLevels.mjs [from-to] [--apply]      (default 6-16)
 *
 * Totals (static + moving) climb gently: 6 on level 6 up to 10 on level 16.
 * Every piece keeps the passable gap (GAP) from every other piece. Nothing is
 * placed below the cup. Does NOT prove solvability - playtest.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaw, writeLevels } from './levelData.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [A, B] = (args.find(a => /^\d+-\d+$/.test(a)) || '6-16').split('-').map(Number);
const W = 480, H = 800, GAP = 24, R = 19, CUP_Y = 728, BAR_LEN = 100, WALL_HT = 5;

const out = await esbuild.build({
  stdin: { contents: `export { initLevel } from './src/levels/index'; export { moverPathAt } from './src/levels/mover';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{"DEV":true}' },
});
const { initLevel, moverPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const segDist = (px, py, s) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
};
const TOTAL = { 6: 6, 7: 6, 8: 7, 9: 7, 10: 8, 11: 8, 12: 8, 13: 9, 14: 9, 15: 9, 16: 10 };
const jit = (id, k, amp) => Math.round(((Math.sin(id * 12.9898 + k * 78.233) * 43758.5453) % 1) * amp);

function build(raw) {
  const id = raw.id, sx = raw.spawn.x, right = sx > W / 2;
  const cr = Math.max(30, raw.target.r);
  // the cup: lowest thing on the board, on the side away from the drop
  const cx = right ? 120 + Math.abs(jit(id, 1, 70)) : W - 120 - Math.abs(jit(id, 1, 70));
  const lv = { id, name: raw.name, maxBlocks: raw.maxBlocks, targetType: 'OPEN', spawn: raw.spawn,
               target: { x: cx, y: CUP_Y, r: cr } };

  // two movers above the cup, sliding toward each other
  const range = 40, my = CUP_Y - 125, half = 88;
  let lx = cx - half, rx = cx + half;
  const lo = R + 20 + range, hi = W - R - 20 - range;
  if (lx < lo) { rx += lo - lx; lx = lo; }
  if (rx > hi) { lx -= rx - hi; rx = hi; }
  const period = 280 + (id % 5) * 24;
  lv.movers = [
    { cx: lx, cy: my, r: R, pattern: 'slide', range, period, phase: 0 },
    { cx: rx, cy: my, r: R, pattern: 'slide', range, period, phase: 0.5 },
  ];

  // static bars, standing in the middle band, kept off the drop line
  const nb = id <= 7 ? 1 : 2, bars = [];
  const barY = nb === 1 ? [400 + jit(id, 2, 15)] : [295 + jit(id, 2, 15), 465 + jit(id, 3, 15)];
  for (let i = 0; i < nb; i++) {
    let bx = W / 2 + (i % 2 ? -1 : 1) * (right ? -1 : 1) * (50 + Math.abs(jit(id, 4 + i, 20)));
    if (Math.abs(bx - sx) < 70) bx += bx < sx ? -70 : 70;
    bars.push({ x1: Math.round(bx), y1: barY[i] - BAR_LEN / 2, x2: Math.round(bx), y2: barY[i] + BAR_LEN / 2 });
  }
  lv.bars = bars;

  // static obstacles from the template's slots, in order, until the total is reached
  const want = TOTAL[id] - lv.movers.length, slots = [];
  slots.push([75 + jit(id, 6, 12), 195 + jit(id, 7, 12)], [W - 75 + jit(id, 8, 12), 195 + jit(id, 9, 12)]);
  for (const b of bars) { const y = (b.y1 + b.y2) / 2; slots.push([b.x1 - 52, y - 22], [b.x1 + 52, y + 22]); }
  slots.push([62, 385 + jit(id, 10, 20)], [W - 62, 385 + jit(id, 11, 20)], [70, 515], [W - 70, 515], [W / 2, 520], [W / 2, 200]);

  const norm = () => initLevel(structuredClone({ ...lv, obstacles: lv.obstacles ?? [] }));
  const moverPts = lv.movers.flatMap(m => Array.from({ length: 24 }, (_, i) => ({ ...moverPathAt(m, i / 24), r: m.r })));
  const clear = (x, y, r, L) => {
    if (x < r + 18 || x > W - r - 18 || y < r + 18) return false;
    if (Math.hypot(x - sx, y - raw.spawn.y) < 120) return false;
    if (Math.abs(x - sx) < r + 26 && y < raw.spawn.y + 160) return false;
    if (y > my - 2 * R - GAP) return false;                       // nothing at or below the movers' lane
    for (const s of L.walls) if (segDist(x, y, s) < r + WALL_HT + GAP) return false;
    for (const o of L.obstacles) if (Math.hypot(x - o.x, y - o.y) < r + o.r + GAP) return false;
    for (const p of moverPts) if (Math.hypot(x - p.x, y - p.y) < r + p.r + GAP) return false;
    return true;
  };
  lv.obstacles = [];
  for (const [x0, y0] of slots) {
    if (lv.obstacles.length >= want) break;
    const L = norm(), x = Math.round(x0), y = Math.round(y0);
    if (clear(x, y, R, L)) lv.obstacles.push({ x, y, r: R });
  }
  // the bonus box: keep it if it is clear, otherwise find it a clear spot
  const L = norm();
  const boxOk = b => clear(b.x, b.y, 18, L) && lv.obstacles.every(o => Math.hypot(b.x - o.x, b.y - o.y) > 60);
  let box = raw.boxes?.[0];
  if (box && !boxOk(box)) box = [[W / 2, 360], [100, 300], [W - 100, 300], [W / 2, 520]].map(([x, y]) => ({ x, y })).find(boxOk);
  if (box) lv.boxes = [box];
  return lv;
}

const raws = await loadRaw(), writes = [];
for (const raw of raws.filter(l => l.id >= A && l.id <= B && TOTAL[l.id])) {
  const lv = build(raw);
  console.log(`level ${lv.id}: cup ${lv.target.x},${lv.target.y}  bars ${lv.bars.length}  static ${lv.obstacles.length} + moving ${lv.movers.length} = ${lv.obstacles.length + lv.movers.length}` +
              (lv.obstacles.length + lv.movers.length < TOTAL[lv.id] ? `  (wanted ${TOTAL[lv.id]})` : ''));
  writes.push(lv);
}
if (APPLY) { writeLevels(writes); console.log('written to src/levels/levels.data.ts'); } else console.log('dry run - add --apply to write.');
