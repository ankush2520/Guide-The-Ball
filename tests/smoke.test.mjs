/* End-to-end smoke: does the rebuilt app actually boot, render, and play? */
import { chromium } from 'playwright';

const URL = process.env.GTB_URL || 'http://localhost:4173/';
let fails = 0;
const ok  = (n, x = '') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad = (n, x = '') => { fails++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };
const chk = (c, n, x = '') => (c ? ok(n, x) : bad(n, x));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 480, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

console.log('\nSMOKE — the rebuilt React/TS app');

/* The daily wheel opens itself once a spin is due, and on a fresh profile one
   always is - which would land a modal on top of the very first boot this
   test is here to check. Suppressed before the app runs; section 14b of
   play.test.mjs is where that behaviour is actually tested. */
await page.addInitScript(() => { window.__gtbNoAutoSpin = true; });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas#board', { timeout: 10000 });
chk(true, 'the app boots and mounts the board');

// the HUD reads from the managers
const title = await page.textContent('#level-title');
chk(/Level \d+/.test(title), 'the HUD shows a level', title.trim());
const ballsBefore = Number(await page.textContent('.counter.balls b'));
chk(Number.isFinite(ballsBefore) && ballsBefore > 0, 'the ball tank loaded', String(ballsBefore));

// the canvas is actually painting - sample a pixel that should not be blank
const painted = await page.evaluate(() => {
  const c = document.querySelector('canvas#board');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let nonBlack = 0;
  for (let i = 0; i < d.length; i += 4 * 997) if (d[i] + d[i+1] + d[i+2] > 30) nonBlack++;
  return nonBlack;
});
chk(painted > 0, 'the board is rendering', `${painted} sampled non-black pixels`);

/* Add a ramp with the big +, then drop the ball. */
const box = await page.locator('canvas#board').boundingBox();
const at = (bx, by) => ({ x: box.x + (bx / 480) * box.width, y: box.y + (by / 800) * box.height });
const rampsBefore = Number(await page.textContent('#ramps-left'));
/* Drawn, not spawned: one drag across empty board is the whole gesture. */
await page.evaluate(() => window.__gtb.drawRamp(120, 320, 240, 370));
const rampsLeft = Number(await page.textContent('#ramps-left'));
chk(rampsLeft === rampsBefore - 1, 'drawing a ramp spends one from the budget',
    `ramps left: ${rampsBefore} -> ${rampsLeft}`);

/* The box on this board pays into the ball tank if the ball happens to pass
   through it, which would make "the drop cost one ball" false for a reason
   that has nothing to do with dropping. Claimed first, so this measures the
   drop and only the drop. */
await page.evaluate(() => window.__gtb.claimBox());

/* The drop is a tap on empty board. A drawn ramp is not left selected, so the
   first tap is already the drop; the second is harmless once it is falling. */
const tapAt = at(60, 120);
await page.mouse.click(tapAt.x, tapAt.y);
await page.waitForTimeout(150);
await page.mouse.click(tapAt.x, tapAt.y);
await page.waitForTimeout(400);
const hint = await page.textContent('.hint');
chk(/Watching|readjust|Replay/.test(hint), 'the drop is running', hint.trim());

// one ball was spent, win or lose
await page.waitForTimeout(2500);
const ballsAfter = Number(await page.textContent('.counter.balls b'));
chk(ballsAfter === ballsBefore - 1, 'the drop cost exactly one ball',
    `${ballsBefore} -> ${ballsAfter}`);

// the run must actually have ENDED - a ball still falling means the loop stalled
const settled = await page.evaluate(() => document.querySelector('.hint').textContent);
chk(!/Watching/.test(settled), 'the run reached an outcome', settled.trim());

/* the panels open */
await page.click('.iconbtn[aria-label="Settings"]');
await page.waitForSelector('.setcard');
chk(await page.isVisible('.setcard'), 'the settings panel opens');
await page.click('#btn-info');
await page.waitForSelector('.infocard');
chk(await page.isVisible('.infocard'), 'and the info panel opens from it');
await page.click('#btn-info-close');
await page.click('#btn-settings-close');

await page.click('#level-title');
await page.waitForSelector('.selcard');
const gridCount = await page.locator('.selcard .grid button').count();
/* Read from the game rather than hard-coded: this number moves every time a
   country is authored, and a smoke test that has to be edited for each one
   stops being a smoke test and starts being a chore. */
const levelCount = await page.evaluate(() => window.__gtb.LEVELS.length);
chk(gridCount === levelCount, 'the level picker lists every level',
  `${gridCount} of ${levelCount}`);
await page.click('.selcard .row button');

await page.screenshot({ path: 'tests/screenshots/react-port.png' });
chk(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED\n` : '\nsmoke passed\n');
process.exit(fails ? 1 : 0);
