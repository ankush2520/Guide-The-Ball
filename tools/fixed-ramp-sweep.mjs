/**
 * Fixed-length ramp sweep.   node tools/fixed-ramp-sweep.mjs [length=120]
 *
 * Ramps are inventory items of ONE size now, not drawn at any length. This
 * proves every shipped level is still winnable when every ramp is exactly
 * `length` long: single ramp under the spawn, then anywhere, then the
 * constructed two-ramp route - all on the real simulator, all seven seeds.
 * Re-run it before changing RAMP_LEN or adding a differently sized item.
 */
import { chromium } from 'playwright';
import { attachHarness } from './harness.mjs';
const LEN = Number(process.argv[2] ?? 120);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await attachHarness(page);
const n = await page.evaluate(() => window.__gtb.LEVELS.length);
const bad = [];
for (let li = 0; li < n; li++) {
  const r = await page.evaluate(([li, LEN]) => {
    const { LEVELS, simulate, CONSTS } = window.__gtb, R = Math.PI / 180, L = LEVELS[li];
    const ramp = (cx, cy, deg) => { const a = deg*R, hx = Math.cos(a)*LEN/2, hy = Math.sin(a)*LEN/2;
      return { x1: cx-hx, y1: cy-hy, x2: cx+hx, y2: cy+hy }; };
    const seeds = [1,2,3,4,5,6,7];
    const wins = cfg => simulate(cfg, 1, li).result === 'win' && seeds.every(s => simulate(cfg, s, li).result === 'win');
    const sx = L.spawn.x;
    for (let ry = L.spawn.y + 80; ry <= CONSTS.H - 130; ry += 15)
      for (let th = 25; th <= 155; th += 1.5) if (wins([ramp(sx, ry, th)])) return 'one-under';
    for (let rx = 50; rx <= 430; rx += 26)
      for (let ry = 140; ry <= 660; ry += 22)
        for (let th = 25; th <= 155; th += 4.5) if (wins([ramp(rx, ry, th)])) return 'one-anywhere';
    if (L.maxBlocks >= 2) {
      const tc = L.target, AIMS = [-24,-18,-12,-6,0,6,12,18,24];
      for (let ry = L.spawn.y + 90; ry <= CONSTS.H - 170; ry += 24)
        for (let t1 = 28; t1 <= 152; t1 += 6) {
          const phi1 = (2*t1 - 90) * R;
          for (let len = 80; len <= 440; len += 24) {
            const p2 = { x: sx + Math.cos(phi1)*len, y: ry + Math.sin(phi1)*len };
            if (p2.x < 25 || p2.x > CONSTS.W-25 || p2.y < 25 || p2.y > CONSTS.H-55) continue;
            const aim = ((Math.atan2(tc.y-p2.y, tc.x-p2.x) + phi1) / 2) / R;
            for (const A of AIMS) if (wins([ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + A)])) return 'two';
          }
        }
    }
    return null;
  }, [li, LEN]);
  if (!r) bad.push(li + 1);
  process.stdout.write(`${li + 1}:${r ?? 'NONE'} `);
}
console.log(`\nLEN ${LEN}: unsolved with fixed-length ramps -> ${bad.length ? bad.join(',') : 'none'}`);
await browser.close();
