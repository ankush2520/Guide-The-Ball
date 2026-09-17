/* ============================================================
   Layout — is the chrome column actually centred?

   .hud, .stage, .controls and .hint are all sized to the board
   via --board-w and centred with `margin-inline:auto` in one
   shared rule. That centring is easy to lose silently: any
   later rule on one of those selectors that sets the `margin`
   SHORTHAND resets the auto too, and the row slides to the left
   edge of .app while its neighbours stay put. It looks like a
   design choice rather than a bug, and nothing else catches it.

   So: measure the left and right gap of every column-spanning
   row against the viewport, and require them to match.
   ============================================================ */
import { chromium } from 'playwright';

const URL = process.env.GTB_URL || 'http://localhost:4173/';
/* sub-pixel: a 355px column around a 299px board leaves .5px gaps */
const TOL = 0.51;
const SIZES = [
  ['iPhone SE',         375, 667],
  ['iPhone 12/13',      390, 844],
  ['iPhone 14 Pro Max', 430, 932],
  ['Galaxy S8',         360, 740],
  ['small / short',     320, 600],
];

let fails = 0;
const ok  = (n, x = '') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad = (n, x = '') => { fails++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };

console.log('\nLAYOUT — the chrome column is centred on every phone');

const browser = await chromium.launch();
for (const [name, width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  /* the wheel would sit a modal over the column we are measuring */
  await page.addInitScript(() => { window.__gtbNoAutoSpin = true; });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas#board', { timeout: 10000 });
  /* --board-w is published from a ResizeObserver, so the rows settle a frame late */
  await page.waitForTimeout(350);

  const rows = await page.evaluate(() => {
    const vw = window.innerWidth;
    return ['.hud', '.stage', '.controls', '.hint'].flatMap(sel => {
      const el = document.querySelector(sel);
      /* .hint is dropped by a max-height rule on short windows */
      if (!el || !el.getClientRects().length) return [];
      const r = el.getBoundingClientRect();
      return [{ sel, gap: +(r.left - (vw - r.right)).toFixed(2) }];
    });
  });

  const off = rows.filter(r => Math.abs(r.gap) > TOL);
  const detail = rows.map(r => `${r.sel} ${r.gap >= 0 ? '+' : ''}${r.gap}`).join('  ');
  if (off.length) bad(`${name} ${width}x${height}`, detail);
  else            ok(`${name} ${width}x${height}`, detail);

  await ctx.close();
}
await browser.close();

console.log(fails ? `\nLAYOUT FAILED (${fails})\n` : '\nlayout ok\n');
process.exit(fails ? 1 : 0);
