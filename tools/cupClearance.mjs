/**
 * CUP CLEARANCE - after the cup's shape changes, is anything now touching it?
 *   node tools/cupClearance.mjs
 * Reports any hazard (obstacle, fire, breakable, moving obstacle's path, crab's
 * loop, post) within GAP of the cup's body or of the column the ball falls in
 * through, and any cup that runs off the board.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await esbuild.build({ stdin: { contents: `export { LEVELS } from './src/levels/index'; export { CUP } from './src/levels/cup'; export { moverPathAt } from './src/levels/mover'; export { crabPathAt } from './src/levels/crab';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{"DEV":true}' } });
const { LEVELS, CUP, moverPathAt, crabPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const GAP = 22, APPROACH = 70;
const segDist = (px, py, s) => { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2)); return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)); };
let bad = 0;
for (const L of LEVELS) {
  const T = L.target, tm = L.targetMove;
  const spots = tm ? [0, .25, .5, .75, 1].map(k => ({ x: tm.x0 + (tm.x1 - tm.x0) * k, y: (tm.y0 ?? T.y) + ((tm.y1 ?? T.y) - (tm.y0 ?? T.y)) * k })) : [T];
  const probs = new Set();
  const pts = [
    ...L.obstacles.map(o => ['obstacle', o.x, o.y, o.r]), ...L.fires.map(o => ['fire', o.x, o.y, o.r * 1.4]), ...L.breakables.map(o => ['breakable', o.x, o.y, o.r]),
    ...L.movers.flatMap(m => Array.from({ length: 24 }, (_, i) => { const p = moverPathAt(m, i / 24); return ['moving obstacle', p.x, p.y, m.r]; })),
    ...(L.crabs ?? []).flatMap(c => Array.from({ length: 32 }, (_, i) => { const p = crabPathAt(c, i / 32); return ['crab', p.x, p.y, c.r]; })),
  ];
  for (const c of spots) {
    const hx = CUP.mouthHX * T.r, top = c.y + CUP.mouthY * T.r, bot = c.y + CUP.baseY * T.r;
    if (bot + 4 > 800) probs.add('cup runs off the bottom');
    for (const [k, x, y, r] of pts) {
      const dx = Math.max(0, Math.abs(x - c.x) - hx), dy = Math.max(0, top - y, y - bot);
      if (Math.hypot(dx, dy) < r + GAP) probs.add(`${k} touching the cup`);
      else if (Math.abs(x - c.x) < hx + r + 8 && y < top && y > top - APPROACH) probs.add(`${k} right above the mouth`);
    }
    for (const s of L.bars ?? []) for (const [x, y] of [[c.x - hx, top], [c.x + hx, top], [c.x, top - 30]]) if (segDist(x, y, s) < 30) probs.add('post at the mouth');
  }
  if (probs.size) { bad++; console.log(`level ${L.id}${L.needsSpring ? ' (exam)' : ''}: ${[...probs].join('; ')}`); }
}
console.log(bad ? `${bad} levels need a look` : 'all cups clear');
