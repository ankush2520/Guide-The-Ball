/**
 * Obstacle-distribution audit: is any board clustered in one region with a
 * large empty area elsewhere?
 *
 *   node tools/audit-spread.mjs            # levels 1-40
 *   node tools/audit-spread.mjs 1-20
 *
 * Read-only. Loads the real level data (through esbuild, so it is the same
 * LEVELS the game ships) and, per level, reports the hazard count, how many
 * of the 3x3 cells of the play field hold a hazard, the tightest rim-to-rim
 * gap between two free-standing hazards, and the largest empty square left
 * in the field. The same thirds as genlevels' covers(): rows run from under
 * the spawn to the floor.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [A, B] = (process.argv[2] || '1-40').split('-').map(Number);
const out = await esbuild.build({
  stdin: { contents: `export { LEVELS } from './src/levels/index';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { LEVELS } = await import('data:text/javascript;base64,' +
  Buffer.from(out.outputFiles[0].text).toString('base64'));

const W = 480, H = 800, Y0 = 90, Y1 = H - 50;
const FIELD = { x0: 0, x1: W, y0: 110, y1: 745 };
const col = o => Math.min(2, Math.floor(o.x / (W / 3)));
const row = o => Math.min(2, Math.max(0, Math.floor((o.y - Y0) / ((Y1 - Y0) / 3))));

/** Side of the largest axis-aligned square in FIELD touching no hazard. */
function emptiestSquare(objs){
  let best = 0;
  for (let x = FIELD.x0; x < FIELD.x1; x += 8)
    for (let y = FIELD.y0; y < FIELD.y1; y += 8){
      let lo = best, hi = Math.min(FIELD.x1 - x, FIELD.y1 - y);
      if (hi <= lo) continue;
      const free = s => objs.every(o => {
        const nx = Math.max(x, Math.min(o.x, x + s)), ny = Math.max(y, Math.min(o.y, y + s));
        return Math.hypot(o.x - nx, o.y - ny) > o.r;
      });
      if (!free(lo + 1)) continue;
      while (hi - lo > 1){ const m = (lo + hi) >> 1; if (free(m)) lo = m; else hi = m; }
      best = lo;
    }
  return best;
}

console.log(' id  haz  cells  cols rows  minGap  emptiest  flag');
for (const L of LEVELS.filter(l => l.id >= A && l.id <= B)){
  const objs = [...L.obstacles, ...L.fires, ...L.breakables];
  const n = objs.length + (L.targetMove ? 1 : 0);
  const cells = new Set(objs.map(o => col(o) + 3 * row(o))).size;
  const cols = new Set(objs.map(col)).size, rows = new Set(objs.map(row)).size;
  let gap = Infinity;
  for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++)
    gap = Math.min(gap, Math.hypot(objs[i].x - objs[j].x, objs[i].y - objs[j].y) - objs[i].r - objs[j].r);
  const sq = emptiestSquare(objs);
  /* The flag is the failure the brief names: a board with enough pieces to
     fill the field that still leaves a whole third, or a big block, empty. */
  const flag = objs.length >= 6 && (cols < 3 || rows < 3 || sq > 260) ? 'CLUSTERED' : '';
  console.log(`${String(L.id).padStart(3)}  ${String(n).padStart(3)}  ${String(cells).padStart(3)}/9  ` +
    `${cols}    ${rows}    ${(isFinite(gap) ? gap.toFixed(0) : '-').padStart(5)}   ` +
    `${String(sq).padStart(5)}px   ${flag}`);
}
