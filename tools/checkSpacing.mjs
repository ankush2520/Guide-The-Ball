/**
 * The passable-gap check.
 *
 *   node tools/checkSpacing.mjs          # levels 1-80
 *   node tools/checkSpacing.mjs 15-15
 *
 * Between any two hazards - obstacles, fires and breakables, same kind or
 * not - the edge-to-edge gap must be at least 2 * BALL_R, the ball's width:
 *
 *     distance(c1, c2) >= r1 + r2 + 2 * BALL_R
 *
 * so every gap on the board is one the ball can be routed through. The same
 * gap is held between every hazard and the rim of a solid OVAL - measured to
 * its collidable surface, the rim grown by the wall half-thickness. Every
 * pair on every level is measured; a level FAILS if any one pair is short,
 * and the script exits non-zero if any level fails.
 *
 * Reads the shipped data through esbuild, so it checks exactly the LEVELS
 * the game loads, and BALL_R from the physics constants, never a copy.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [A, B] = (process.argv[2] || '1-80').split('-').map(Number);
const out = await esbuild.build({
  stdin: { contents: `export { LEVELS } from './src/levels/index';
                      export { BALL_R, WALL_HT } from './src/physics/constants';
                      export { ovalPoint } from './src/levels/ovals';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { LEVELS, BALL_R, WALL_HT, ovalPoint } = await import('data:text/javascript;base64,' +
  Buffer.from(out.outputFiles[0].text).toString('base64'));
const MIN_GAP = 2 * BALL_R;

console.log(`\nPassable-gap check: every pair of hazards at least ${MIN_GAP}px apart, edge to edge ` +
            `(2 x BALL_R ${BALL_R})\n`);
console.log('  level  hazards  pairs  smallest gap  result');
let failed = 0;
for (const L of LEVELS.filter(l => l.id >= A && l.id <= B)){
  const hz = [...L.obstacles.map(o => ({ ...o, k: 'obstacle' })),
              ...L.fires.map(o => ({ ...o, k: 'fire' })),
              ...L.breakables.map(o => ({ ...o, k: 'breakable' }))];
  let pairs = 0, min = Infinity;
  const bad = [];
  for (let i = 0; i < hz.length; i++)
    for (let j = i + 1; j < hz.length; j++){
      pairs++;
      const a = hz[i], b = hz[j];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      min = Math.min(min, gap);
      if (gap < MIN_GAP)
        bad.push(`${a.k}(${a.x},${a.y},r${a.r}) - ${b.k}(${b.x},${b.y},r${b.r}) gap ${gap.toFixed(1)}px`);
    }
  /* hazard to oval rim: outside it, and MIN_GAP clear of its surface */
  for (const [k, ov] of (L.ovals || []).entries()){
    const rim = Array.from({ length: 720 }, (_, i) => ovalPoint(ov, i / 720 * Math.PI * 2));
    const a = -(ov.angle ?? 0) * Math.PI / 180;
    for (const h of hz){
      const dx = h.x - ov.x, dy = h.y - ov.y;
      const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
      const inside = (u / ov.rx) ** 2 + (v / ov.ry) ** 2 <= 1;
      const gap = inside ? -Infinity
        : Math.min(...rim.map(p => Math.hypot(p.x - h.x, p.y - h.y))) - h.r - WALL_HT;
      min = Math.min(min, gap);
      if (gap < MIN_GAP)
        bad.push(`${h.k}(${h.x},${h.y},r${h.r}) - oval ${k} ${inside ? 'INSIDE the oval' : `gap ${gap.toFixed(1)}px`}`);
    }
  }
  if (bad.length) failed++;
  console.log(`  ${String(L.id).padStart(5)}  ${String(hz.length).padStart(7)}  ${String(pairs).padStart(5)}  ` +
              `${(isFinite(min) ? min.toFixed(1) + 'px' : '-').padStart(12)}  ${bad.length ? 'FAIL' : 'PASS'}`);
  for (const b of bad) console.log(`         ! ${b}`);
}
const n = LEVELS.filter(l => l.id >= A && l.id <= B).length;
console.log(failed ? `\n  ${failed} of ${n} levels FAIL.\n` : `\n  All ${n} levels PASS.\n`);
process.exitCode = failed ? 1 : 0;
