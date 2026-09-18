/* ============================================================
   Layout — is the chrome column actually centred?

   .hud, .stage and .hint are all sized to the board
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
  /* A phone with Chrome's URL bar showing: tall enough to trip the
     min-height:720px bracket, short enough that the board is still
     limited by HEIGHT - which is the only combination where a hint
     row that changes height drags the board with it. This is the
     case the bug was actually reported on. */
  ['390 + URL bar',     390, 740],
  ['412 + URL bar',     412, 740],
  /* the hint row is hidden below 520px wide, so these two are the sizes
     that actually exercise it - without them the "board holds still"
     check below would pass trivially on every size */
  ['tablet',            768, 1024],
  ['desktop',           900, 800],
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
    /* NOT .levelpill: it is a chip in the bar now, off to the right of the +,
       so it is centred on nothing. The bar it rides in is measured instead. */
    return ['.hud', '.stage', '.hint', '.status', '#btn-add-ramp'].flatMap(sel => {
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
/* ------------------------------------------------------------
   The board must not resize as the hint text changes.

   The board is height-driven - it is whatever 3:5 fits in the
   space the chrome leaves - so any chrome row that changes
   height while you play drags the board with it. That is what
   a one-line reservation under two-line text used to do: the
   board jumped mid-tap, right as the ball was dropped.
   ------------------------------------------------------------ */
const HINTS = [
  'Drag on the board to draw a ramp. Tap a ramp to edit it.',
  'No ramps left — tap Ramps to spend a spare, or drop the ball.',
  'No ramps left — tap one to edit or delete it, or drop the ball.',
  'Watching the drop…',
];

console.log('\nLAYOUT — the board holds still while the hint text changes');

const browser2 = await chromium.launch();
for (const [name, width, height] of SIZES) {
  const ctx = await browser2.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__gtbNoAutoSpin = true; });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas#board', { timeout: 10000 });
  await page.waitForTimeout(350);

  const widths = [];
  for (const text of HINTS) {
    widths.push(await page.evaluate(async (t) => {
      const el = document.querySelector('.hint');
      if (el) {
        el.textContent = t;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));
      }
      return +document.querySelector('.stage').getBoundingClientRect().width.toFixed(1);
    }, text));
  }
  const jump = +(Math.max(...widths) - Math.min(...widths)).toFixed(1);
  if (jump > TOL) bad(`${name} ${width}x${height}`, `board moves ${jump}px across hint states`);
  else            ok(`${name} ${width}x${height}`, `board steady at ${widths[0]}px`);
  await ctx.close();
}
await browser2.close();

console.log(fails ? `\nLAYOUT FAILED (${fails})\n` : '\nlayout ok\n');
process.exit(fails ? 1 : 0);
