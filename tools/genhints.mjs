/**
 * Find ONE proven winning plan per level, for the in-game Hint.
 *
 *   node tools/genhints.mjs              # levels 1-100
 *   node tools/genhints.mjs 15-20        # just those; merged into the file
 *   node tools/genhints.mjs 1-100 --budget=90   # seconds per level (default 60)
 *
 * Runs in the headless harness against the REAL simulator, on the seed the
 * game drops that level with (levelSeed), so every hint it writes is known to
 * win. It searches, cheapest first, until one wins or the level's time budget
 * runs out:
 *
 *   1. one ramp under the spawn, swept over height and angle;
 *   2. two ramps, the second aimed back at the target along the first
 *      ramp's reflected line (with a band of aim offsets);
 *   3. two ramps, the second placed on points the ball ACTUALLY passes.
 *
 * On a need-spring board every candidate is tried with a spring on each of
 * its ramps. On a timed board (moving target, eater fish, thunder) every
 * candidate is tried at a spread of drop moments, and the moment that wins
 * is written with it (t0).
 *
 * Writes src/levels/hints.data.ts and NOTHING else - levels.data.ts is never
 * touched. A level with no plan found gets no entry (the game hides the
 * button there). Progress is written after every level, so a long run can be
 * stopped and resumed on the remaining range.
 */
import { chromium } from 'playwright';
import { attachHarness } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(root, 'src/levels/hints.data.ts');
const [A, B] = (process.argv.find(a => /^\d+(-\d+)?$/.test(a)) || '1-100').split('-').map(Number);
const BUDGET = Number((process.argv.find(a => a.startsWith('--budget=')) || '--budget=60').slice(9));

/* the existing file's entries, so a partial run merges rather than wipes */
function readHints(){
  if (!fs.existsSync(FILE)) return {};
  const m = fs.readFileSync(FILE, 'utf8').match(/HINTS: Record<number, Hint> = (\{[\s\S]*\});/);
  if (!m) return {};
  try { return Function(`return (${m[1]})`)(); } catch { return {}; }
}
function writeHints(h){
  const src = fs.readFileSync(FILE, 'utf8');
  const r = n => Math.round(n);
  const body = Object.keys(h).map(Number).sort((a, b) => a - b).map(id => {
    const e = h[id];
    const ramps = e.ramps.map(s => `{ x1: ${r(s.x1)}, y1: ${r(s.y1)}, x2: ${r(s.x2)}, y2: ${r(s.y2)}${s.spring ? ', spring: true' : ''} }`).join(', ');
    return `  ${id}: { ramps: [${ramps}]${e.t0 !== undefined ? `, t0: ${e.t0}` : ''} },`;
  }).join('\n');
  fs.writeFileSync(FILE, src.replace(/HINTS: Record<number, Hint> = \{[\s\S]*\};/,
    `HINTS: Record<number, Hint> = {\n${body}${body ? '\n' : ''}};`));
}

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await attachHarness(page);

const hints = readHints();
let found = 0, missed = [];
for (let id = A; id <= B; id++){
  const t = Date.now();
  const plan = await page.evaluate(([id, budgetMs]) => {
    const { LEVELS, simulate, trace, levelSeed, CONSTS } = window.__gtb;
    const li = LEVELS.findIndex(l => l.id === id);
    if (li < 0) return null;
    const lv = LEVELS[li], seed = levelSeed(id), W = CONSTS.W, H = CONSTS.H;
    const deadline = performance.now() + budgetMs;
    const R = Math.PI / 180;
    const ramp = (cx, cy, deg, len = 120) => {
      const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
      return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
    };
    /* the drop moments to try: 0 on a board with no clock, else a spread
       across the longest cycle on it */
    const cycles = [];
    if (lv.targetMove) cycles.push(lv.targetMove.period);
    if (lv.fish) for (const f of lv.fish) cycles.push(f.period);
    if (lv.storm) cycles.push(lv.storm.gaps.reduce((a, b) => a + b, 0));
    const T = cycles.length ? Math.min(360, Math.max(...cycles)) : 0;
    const t0s = T ? Array.from({ length: Math.ceil(T / 10) }, (_, k) => k * 10) : [0];
    const springs = lv.needsSpring;
    /* one layout: every spring placement (if needed) at every drop moment */
    const tryCfg = cfg => {
      const variants = springs ? cfg.map((_, k) => cfg.map((s, j) => ({ ...s, spring: j === k }))) : [cfg];
      for (const v of variants)
        for (const t0 of t0s)
          if (simulate(v, seed, li, null, t0).result === 'win') return { ramps: v, t0: T ? t0 : undefined };
      return null;
    };
    const out = () => performance.now() > deadline;
    const sx = lv.spawn.x;

    // 1. one ramp
    for (let ry = lv.spawn.y + 80; ry <= H - 130; ry += 20)
      for (let th = 25; th <= 155; th += 3){
        if (out()) return null;
        const p = tryCfg([ramp(sx, ry, th)]);
        if (p) return p;
      }
    if (lv.maxBlocks < 2) return null;
    // 2. two ramps, the second on the first's reflected line
    const tc = lv.target;
    for (let ry = lv.spawn.y + 90; ry <= H - 170; ry += 30)
      for (let t1 = 28; t1 <= 152; t1 += 8){
        const phi1 = (2 * t1 - 90) * R;
        for (let L = 80; L <= 440; L += 40){
          if (out()) return null;
          const p2 = { x: sx + Math.cos(phi1) * L, y: ry + Math.sin(phi1) * L };
          if (p2.x < 25 || p2.x > W - 25 || p2.y < 25 || p2.y > H - 55) continue;
          const aim = ((Math.atan2(tc.y - p2.y, tc.x - p2.x) + phi1) / 2) / R;
          for (const off of [0, -10, 10, -20, 20]){
            const p = tryCfg([ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + off, 100)]);
            if (p) return p;
          }
        }
      }
    // 3. two ramps, the second where the ball actually goes
    for (let ry = lv.spawn.y + 70; ry <= lv.spawn.y + 260; ry += 16)
      for (let t1 = 22; t1 <= 158; t1 += 6){
        if (out()) return null;
        const r1 = ramp(sx, ry, t1);
        const pts = trace([r1], seed, li).samples.filter(q => q.y > ry + 20);
        for (let k = 0; k < pts.length; k += 8)
          for (let t2 = 20; t2 <= 160; t2 += 10){
            if (out()) return null;
            const p = tryCfg([r1, ramp(pts[k].x + Math.sign(pts[k].vx) * 6, pts[k].y + 6, t2, 100)]);
            if (p) return p;
          }
      }
    return null;
  }, [id, BUDGET * 1000]);
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (plan){ hints[id] = plan; found++; console.log(`${id}: hint (${plan.ramps.length} ramp${plan.ramps.length > 1 ? 's' : ''}${plan.t0 !== undefined ? `, drop at step ${plan.t0}` : ''}${plan.ramps.some(r => r.spring) ? ', spring' : ''}) in ${secs}s`); }
  else { delete hints[id]; missed.push(id); console.log(`${id}: no plan found in ${secs}s`); }
  writeHints(hints);
}
await browser.close();
console.log(`\n${found} hints found; none for: ${missed.join(', ') || '-'}`);
