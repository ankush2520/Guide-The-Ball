/* ============================================================
   BOARD PROFILES - the gate on widening the board.

   A tablet gets a 3:4 board and a phone keeps the 3:5 one the
   levels are designed in. The whole design rests on one claim:
   that the wider board cannot unmake a solved level.

   The argument is that there are no side walls, so the board's
   width reaches the simulation in exactly one place - leaving
   sideways is a LOSS (isOutOfBounds) - and a wider board can
   only postpone that. This asserts it instead of trusting it,
   over every level and a sweep of ramp layouts:

     every layout that WINS on the phone board must still win
     on the tablet board, with the same trajectory.

   If this fails, the tablet board is a different game.
   ============================================================ */
import { chromium } from 'playwright';
import { attachHarness } from '../tools/harness.mjs';

let fails = 0;
const ok  = (n, x = '') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad = (n, x = '') => { fails++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };
const chk = (c, n, x = '') => (c ? ok(n, x) : bad(n, x));

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => bad('page error', e.message));
await attachHarness(page);

const PAD = await page.evaluate(() => window.__gtb.CONSTS ? 60 : 60);
const n = await page.evaluate(() => window.__gtb.LEVELS.length);
console.log(`\nBOARD PROFILES — phone (pad 0) vs tablet (pad ${PAD}), ${n} levels`);

/* The same shape of sweep the level generator uses: a grid of single ramps
   across the board, at a spread of angles, on a few seeds. */
const report = await page.evaluate(pad => {
  const g = window.__gtb;
  const { W, H, MIN_RAMP } = g.CONSTS;
  const seeds = [1, 7, 91];

  const layouts = [];
  for (let x = 60; x <= W - 60; x += 60)
    for (let y = 180; y <= H - 180; y += 70)
      for (const th of [-40, -18, 0, 18, 40]) {
        const r = (MIN_RAMP + 46) / 2, a = th * Math.PI / 180;
        layouts.push([{ x1: x - Math.cos(a) * r, y1: y - Math.sin(a) * r,
                        x2: x + Math.cos(a) * r, y2: y + Math.sin(a) * r }]);
      }

  /* Run the whole sweep under one profile and key every outcome. */
  const sweep = p => {
    g.setBoardPad(p);
    const out = [];
    for (let ix = 0; ix < g.LEVELS.length; ix++)
      for (const cfg of layouts)
        for (const s of seeds) {
          const r = g.simulate(cfg.map(c => ({ ...c })), s, ix);
          out.push({ result: r.result, x: +r.x.toFixed(4), y: +r.y.toFixed(4) });
        }
    return out;
  };

  const phone = sweep(0);
  const tablet = sweep(pad);
  g.setBoardPad(0);

  let wins = 0, lostWins = 0, gained = 0, drift = 0, sameTrail = 0;
  const examples = [];
  for (let i = 0; i < phone.length; i++) {
    const a = phone[i], b = tablet[i];
    if (a.result === 'win') {
      wins++;
      if (b.result !== 'win') {
        lostWins++;
        if (examples.length < 3) examples.push(`#${i} win -> ${b.result}`);
      } else if (a.x !== b.x || a.y !== b.y) {
        drift++;
        if (examples.length < 3) examples.push(`#${i} win drifted ${a.x},${a.y} -> ${b.x},${b.y}`);
      } else sameTrail++;
    } else if (b.result === 'win') gained++;
  }
  return { runs: phone.length, layouts: layouts.length,
           wins, lostWins, gained, drift, sameTrail, examples };
}, PAD);

console.log(`  ${report.runs} runs — ${report.layouts} layouts x ${n} levels x 3 seeds`);
console.log(`  winning runs on the phone board: ${report.wins}`);

chk(report.wins > 200, 'the sweep actually finds wins to compare',
  `${report.wins} winning runs`);
chk(report.lostWins === 0,
  'NO layout that wins on the phone board loses on the tablet board',
  report.lostWins ? report.examples.join(' | ') : `${report.wins} wins all survive`);
chk(report.drift === 0,
  'and every one of them lands on the exact same pixel - the wider board ' +
  'changes where the ball may DIE, never where it flies',
  report.drift ? report.examples.join(' | ') : `${report.sameTrail} identical landings`);
console.log(`  layouts that win only on the tablet board: ${report.gained}` +
            ` (shots that ran off the side of a phone board)`);

await browser.close();
console.log(fails ? `\n${fails} check(s) FAILED.\n` : '\nBoard profiles agree on every solution.\n');
process.exitCode = fails ? 1 : 0;
