/**
 * How a board is laid out, as the eye sees it - shared by
 * tools/audit-spread.mjs (the report) and tests/spread.test.mjs (the gate).
 *
 * Loads the real level data through esbuild, so it measures the same LEVELS
 * the game ships, and the glow multiples from src/render/glow.ts, the file
 * the entities draw with.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await esbuild.build({
  stdin: { contents: `export { LEVELS } from './src/levels/index';
                      export * from './src/render/glow';
                      export { BOX_R } from './src/physics/constants';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(out.outputFiles[0].text).toString('base64'));
const { FIRE_GLOW, TARGET_GLOW, BOX_GLOW, BOX_R } = mod;
export const LEVELS = mod.LEVELS;

/* The same thresholds as genlevels' covers(): a board of six or more pieces
   must reach every third, and leave no square hole wider than MAX_EMPTY. */
export const MAX_EMPTY = 260;
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

/** Everything on the board as the eye sees it: `vr` is where it visibly
    ends. A patrolling target is laid down at every point of its lane. */
function seen(L){
  const out = [
    ...L.obstacles.map(o => ({ ...o, vr: o.r, what: 'obstacle' })),
    ...L.breakables.map(o => ({ ...o, vr: o.r, what: 'breakable' })),
    ...L.fires.map(o => ({ ...o, vr: o.r * FIRE_GLOW, what: 'fire' })),
    ...L.boxes.map(b => ({ ...b, r: BOX_R, vr: BOX_R * BOX_GLOW, what: 'box' })),
  ];
  const t = L.target, mv = L.targetMove;
  const xs = mv ? [] : [t.x];
  if (mv) for (let x = Math.min(mv.x0, mv.x1); x <= Math.max(mv.x0, mv.x1); x += 6) xs.push(x);
  for (const x of xs) out.push({ x, y: t.y, r: t.r, vr: t.r * TARGET_GLOW, what: 'target' });
  return out;
}

/** Tightest visible edge-to-edge gap over every pair where one glows.
    Negative means a glow visibly crosses another glow or a body. */
function glowGap(L){
  const s = seen(L);
  let gap = Infinity, pair = '';
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++){
    const a = s[i], b = s[j];
    if (a.what === 'target' && b.what === 'target') continue;
    if (a.vr === a.r && b.vr === b.r) continue;           // neither glows
    const g = Math.hypot(a.x - b.x, a.y - b.y) - a.vr - b.vr;
    if (g < gap){ gap = g; pair = `${a.what}/${b.what}`; }
  }
  return { gap, pair };
}

/** Every number the audit prints for one level, and what is wrong with it. */
export function measure(L){
  const objs = [...L.obstacles, ...L.fires, ...L.breakables];
  const cols = new Set(objs.map(col)).size, rows = new Set(objs.map(row)).size;
  let gap = Infinity;
  for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++)
    gap = Math.min(gap, Math.hypot(objs[i].x - objs[j].x, objs[i].y - objs[j].y) - objs[i].r - objs[j].r);
  const empty = emptiestSquare(objs);
  const glow = glowGap(L);
  const flags = [];
  if (objs.length >= 6 && (cols < 3 || rows < 3 || empty > MAX_EMPTY)) flags.push('CLUSTERED');
  if (glow.gap < 0) flags.push('GLOW OVERLAP');
  return { id: L.id, pieces: objs.length, hazards: objs.length + (L.targetMove ? 1 : 0),
           cells: new Set(objs.map(o => col(o) + 3 * row(o))).size, cols, rows,
           gap, empty, glow, flags };
}
