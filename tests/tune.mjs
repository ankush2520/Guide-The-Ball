/**
 * Physics tuning rig.  node tests/tune.mjs [terminal velocity ...]
 *
 * Builds a variant of index.html per TERMINAL_VY value, runs the headless
 * solver sweep against each, and prints the level-health numbers side by side
 * so a constant can be chosen from data instead of vibes. GRAVITY is derived
 * from TERMINAL_VY, so the time-to-terminal stays fixed as the cap moves.
 */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SPEEDS = process.argv.slice(2).map(Number).filter(n => n > 0);
const LIST = SPEEDS.length ? SPEEDS : [6.0, 7.5, 9.0, 10.5, 12.0];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gtb-tune-'));

const SWEEP = () => {
  const { simulate } = window.__gtb;
  const seeds = [1,2,3,4,5,6,7,8];
  const ramp = (cx, cy, deg, len = 110) => {
    const a = deg * Math.PI/180, hx = Math.cos(a)*len/2, hy = Math.sin(a)*len/2;
    return { x1: cx-hx, y1: cy-hy, x2: cx+hx, y2: cy+hy };
  };
  const rate = (r) => seeds.reduce((n,s)=> n + (simulate(r,s).result==='win'?1:0), 0)/seeds.length;

  let best = { rate:-1 }, good = 0, total = 0;
  for (let cx = 55; cx <= 190; cx += 15)
    for (let cy = 130; cy <= 470; cy += 20)
      for (const deg of [-70,-60,-50,-40,-30,-20,20,30,40,50,60,70]) {
        const cfg = [ramp(cx,cy,deg)];
        const r = rate(cfg);
        total++; if (r >= 0.5) good++;
        if (r > best.rate) best = { rate:r, cx, cy, deg };
      }

  let rnd = 12345;
  const rand = () => (rnd = (rnd*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let loose = 0, N = 400, steps = 0, hits = 0, wins = 0;
  for (let i = 0; i < N; i++) {
    const cfg = [ ramp(40+rand()*300, 120+rand()*200, -80+rand()*160, 70+rand()*70),
                  ramp(40+rand()*300, 340+rand()*200, -80+rand()*160, 70+rand()*70) ];
    const out = simulate(cfg, 1 + ((i*7)%8));
    steps += out.steps; hits += out.hits;
    if (out.result === 'win') { loose++; wins++; }
  }
  const bestCfg = [ramp(best.cx, best.cy, best.deg)];
  const dropSteps = seeds.map(s => simulate(bestCfg, s).steps);
  return {
    noRamp: rate([]), best, goodFrac: good/total, looseRate: loose/N,
    avgSteps: steps/N, avgHits: hits/N,
    bestDropSec: (dropSteps.reduce((a,b)=>a+b,0)/dropSteps.length)/60
  };
};

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const rows = [];
for (const sp of LIST) {
  const html = SRC.replace(/const TERMINAL_VY = [\d.]+;/, `const TERMINAL_VY = ${sp};`);
  if (!html.includes(`const TERMINAL_VY = ${sp};`)) throw new Error('TERMINAL_VY substitution failed');
  const f = path.join(tmp, `v${String(sp).replace('.','_')}.html`);
  fs.writeFileSync(f, html);
  await page.goto(pathToFileURL(f).href);
  await page.waitForFunction(() => !!window.__gtb);
  const grav = await page.evaluate(() => window.__gtb.CONSTS.GRAVITY);
  rows.push({ sp, grav, ...await page.evaluate(SWEEP) });
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n termVy  px/s   grav   noRamp  bestRamp  good%   careless%  avgBounces  winDrop');
console.log(' ' + '-'.repeat(78));
for (const r of rows)
  console.log(` ${r.sp.toFixed(1).padStart(4)}  ${String(Math.round(r.sp*60)).padStart(4)}  ` +
    `${r.grav.toFixed(3)}   ${(r.noRamp*100).toFixed(0).padStart(4)}%  ` +
    `${(r.best.rate*100).toFixed(0).padStart(6)}%  ${(r.goodFrac*100).toFixed(1).padStart(5)}%  ` +
    `${(r.looseRate*100).toFixed(1).padStart(8)}%  ${r.avgHits.toFixed(2).padStart(9)}  ` +
    `${r.bestDropSec.toFixed(2).padStart(5)}s`);
console.log('\n good%     = single ramp placements that win >=50% of the time (findable, not accidental)');
console.log(' careless% = random 2-ramp layouts that win (should stay low)');
console.log(' winDrop   = how long you watch the ball on the best layout\n');
