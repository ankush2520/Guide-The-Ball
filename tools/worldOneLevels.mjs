/**
 * WORLD ONE, LEVELS 6-16 - one hand-designed layout per level.
 *
 *   node tools/worldOneLevels.mjs [--apply]
 *
 * Every layout is authored for a drop on the RIGHT and mirrored when the
 * level's spawn is on the left. Each one is a different idea (a gap row, a
 * staircase, a corridor, a shelf, a ring, a comb, a diamond...), kept SPACIOUS:
 * at least SPACE px edge to edge between any two pieces, and the cup is the
 * LOWEST thing on the board - nothing below it. A piece that breaks a rule is
 * nudged to the nearest legal spot (and reported). Does NOT prove solvability.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaw, writeLevels } from './levelData.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const W = 480, H = 800, R = 19, SPACE = 34, WALL_HT = 8, CUP_Y = 726, BALL_LANE = 24;
const out = await esbuild.build({
  stdin: { contents: `export { moverPathAt } from './src/levels/mover';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node' });
const { moverPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

/* o: static obstacles [x,y]; b: bars [x1,y1,x2,y2]; m: movers [pattern,cx,cy,range,phase]; cup: x */
import { T } from './layoutTemplates.mjs';

const segDist = (px, py, s) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
};

function build(raw) {
  const t = T[raw.id], sx = raw.spawn.x, flip = sx < W / 2, fx = x => (flip ? W - x : x);
  const cr = Math.max(30, raw.target.r), cup = { x: fx(t.cup), y: CUP_Y, r: cr };
  const mouthY = cup.y - 1.0 * cr, log = [];
  const bars = t.b.map(([x1, y1, x2, y2]) => ({ x1: fx(x1), y1, x2: fx(x2), y2 }));
  const placed = [];          // circles already down: {x,y,r} (movers as their swept points)
  const legal = (x, y, r) => {
    if (x < r + 16 || x > W - r - 16 || y < r + 16) return false;
    if (y + r > mouthY - 14) return false;                                   // nothing level with or below the cup
    if (Math.hypot(x - sx, y - raw.spawn.y) < 120) return false;
    if (Math.abs(x - sx) < r + BALL_LANE) return false;      // the bare drop falls straight through, untouched
    if (Math.abs(x - cup.x) < 0.736 * cr + r + 24 && y > mouthY - 110) return false;   // the cup's approach
    for (const s of bars) if (segDist(x, y, s) < r + WALL_HT + SPACE) return false;
    for (const p of placed) if (Math.hypot(x - p.x, y - p.y) < r + p.r + SPACE) return false;
    return true;
  };
  const nudge = (x, y, ok) => {
    if (ok(x, y)) return [x, y];
    for (let d = 10; d <= 90; d += 10) for (let a = 0; a < 16; a++) {
      const nx = Math.round(x + d * Math.cos(a * Math.PI / 8)), ny = Math.round(y + d * Math.sin(a * Math.PI / 8));
      if (ok(nx, ny)) return [nx, ny];
    }
    return null;
  };
  // movers first: they need the most room
  const movers = [];
  for (const [pattern, cx0, cy0, range, phase] of t.m) {
    const mk = (cx, cy) => ({ cx, cy, r: R, pattern, range, period: 300 + (raw.id % 4) * 30, phase });
    const sweep = m => Array.from({ length: 24 }, (_, i) => moverPathAt(m, i / 24));
    const ok = (cx, cy) => sweep(mk(cx, cy)).every(p => legal(p.x, p.y, R));
    const at = nudge(fx(cx0), cy0, ok);
    if (!at) { log.push(`dropped mover ${pattern}`); continue; }
    if (at[0] !== fx(cx0) || at[1] !== cy0) log.push(`nudged mover ${pattern}`);
    const m = mk(...at); movers.push(m);
    for (const p of sweep(m)) placed.push({ ...p, r: R });
  }
  const obstacles = [];
  for (const [x0, y0] of t.o) {
    const at = nudge(fx(x0), y0, (x, y) => legal(x, y, R));
    if (!at) { log.push(`dropped obstacle ${x0},${y0}`); continue; }
    if (at[0] !== fx(x0) || at[1] !== y0) log.push(`nudged ${fx(x0)},${y0} -> ${at}`);
    obstacles.push({ x: at[0], y: at[1], r: R }); placed.push({ x: at[0], y: at[1], r: R });
  }
  const lv = { id: raw.id, name: raw.name, maxBlocks: raw.maxBlocks, targetType: 'OPEN', spawn: raw.spawn, obstacles, target: cup };
  if (bars.length) lv.bars = bars;
  if (movers.length) lv.movers = movers;
  // keep the bonus box where it is if clear, else find it a clear spot
  const boxAt = nudge(raw.boxes?.[0]?.x ?? W / 2, raw.boxes?.[0]?.y ?? 400, (x, y) => legal(x, y, 16));
  if (boxAt) lv.boxes = [{ x: boxAt[0], y: boxAt[1] }];
  return { lv, log, idea: t.idea };
}

const raws = await loadRaw(), writes = [];
for (const raw of raws.filter(l => l.id >= 6 && l.id <= 16 && !l.needsSpring && T[l.id])) {
  const { lv, log, idea } = build(raw);
  console.log(`level ${lv.id} (${idea}): ${lv.obstacles.length} static + ${(lv.movers ?? []).length} moving, ${(lv.bars ?? []).length} bars, cup x ${lv.target.x}${log.length ? '  [' + log.join('; ') + ']' : ''}`);
  writes.push(lv);
}
if (APPLY) { writeLevels(writes); console.log('written to src/levels/levels.data.ts'); } else console.log('dry run - add --apply to write.');
