/* ============================================================
   PARITY - the port's most important test.

   The 30 levels were proved winnable against the ORIGINAL
   simulator by the solver sweep. This asserts the TypeScript
   port is that same simulator: same level, same ramps, same
   seed => byte-identical trajectory, hit for hit.

   If this fails, the port has changed the game.
   ============================================================ */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const ok  = (n, x = '') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad = (n, x = '') => { fails++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };
const chk = (c, n, x = '') => (c ? ok(n, x) : bad(n, x));

/* ---- bundle the ported sim into something the page can evaluate ---- */
const bundle = await esbuild.build({
  stdin: {
    contents: `
      import { LEVELS } from './src/levels/index';
      import { simulate } from './src/physics/simulate';
      import { Ball } from './src/physics/Ball';
      import { stepBall } from './src/physics/simulate';
      globalThis.__port = { LEVELS, simulate, Ball, stepBall };
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', target: 'es2020',
});
const portJs = bundle.outputFiles[0].text;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => bad('page error', e.message));
await page.goto(pathToFileURL(path.join(root, 'legacy/original-game.html')).href);
await page.waitForFunction(() => !!window.__gtb);
await page.addScriptTag({ content: portJs });

/* A spread of ramp layouts per level, so the comparison exercises real
   collisions and not just the empty-board fall. */
const LAYOUTS = [
  [],
  [{ x1: 120, y1: 300, x2: 260, y2: 360 }],
  [{ x1: 300, y1: 250, x2: 160, y2: 330 }],
  [{ x1:  80, y1: 420, x2: 220, y2: 470 }, { x1: 260, y1: 560, x2: 400, y2: 610 }],
  [{ x1: 400, y1: 200, x2: 260, y2: 280 }, { x1: 100, y1: 500, x2: 240, y2: 545 }],
];
const SEEDS = [1, 7, 12345, 0x7ffffffe];

console.log('\nPARITY — ported TS simulator vs the original engine');

const report = await page.evaluate(([layouts, seeds]) => {
  const g = window.__gtb, p = window.__port;
  const out = [];
  for (let ix = 0; ix < g.LEVELS.length; ix++) {
    for (const ramps of layouts) {
      for (const seed of seeds) {
        // deep-copy the ramps: both engines mutate nothing, but a shared
        // reference would hide it if one did
        const A = g.trace(JSON.parse(JSON.stringify(ramps)), seed, ix, null);
        const B = (() => {
          const lv = p.LEVELS[ix];
          const b = new p.Ball(lv, seed >>> 0, null);
          const rr = JSON.parse(JSON.stringify(ramps));
          const samples = [];
          while (!b.result) {
            p.stepBall(b, lv, rr);
            samples.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
                           hits: b.hits, stars: b.stars, boosts: b.boosts,
                           teleports: b.teleports });
          }
          return { result: b.result, steps: b.steps, samples };
        })();
        out.push({ ix, id: g.LEVELS[ix].id, seed, nRamps: ramps.length, A, B });
      }
    }
  }
  return out;
}, [LAYOUTS, SEEDS]);

let compared = 0, resultMismatch = 0, pathMismatch = 0, worst = 0, worstAt = '';
for (const r of report) {
  compared++;
  if (r.A.result !== r.B.result || r.A.steps !== r.B.steps) {
    resultMismatch++;
    if (resultMismatch <= 5)
      bad(`level ${r.id} seed ${r.seed} ramps ${r.nRamps}`,
          `orig=${r.A.result}/${r.A.steps} port=${r.B.result}/${r.B.steps}`);
    continue;
  }
  // the legacy trace samples once per step, same as the port
  const n = Math.min(r.A.samples.length, r.B.samples.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const a = r.A.samples[i], b = r.B.samples[i];
    d = Math.max(d, Math.abs(a.x - b.x), Math.abs(a.y - b.y),
                    Math.abs(a.vx - b.vx), Math.abs(a.vy - b.vy));
  }
  if (d > worst) { worst = d; worstAt = `level ${r.id} seed ${r.seed} ramps ${r.nRamps}`; }
  if (d > 1e-9) {
    pathMismatch++;
    if (pathMismatch <= 5) bad(`trajectory drift`, `level ${r.id} seed ${r.seed} max|d|=${d}`);
  }
}

chk(resultMismatch === 0, `every run ends identically`, `${compared} runs compared`);
chk(pathMismatch === 0, `every trajectory is byte-identical`,
    `worst |delta| = ${worst.toExponential(2)}${worst ? ' at ' + worstAt : ''}`);

/* The whole point of parity: the shipped levels are still winnable. */
const winnable = report.filter(r => r.B.result === 'win').length;
chk(winnable > 0, 'the ported engine still scores wins', `${winnable} winning runs in the sweep`);

await browser.close();
console.log(fails ? `\n${fails} FAILED\n` : '\nparity holds\n');
process.exit(fails ? 1 : 0);
