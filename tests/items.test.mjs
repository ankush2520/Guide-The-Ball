/* ============================================================
   THE TWO THINGS THE PLAYER BRINGS - the solver gate.

   Boosters and mystery boxes are the only content in the game
   that is not authored into a level, so each one makes a claim
   the level data cannot check for itself. This proves both, in
   the real simulator, headlessly.

   1. A LEVEL FLAGGED `needsBooster` MUST BE BOTH:
        - unsolvable with ramps alone, and
        - solvable with one booster out of the bag.
      Either half failing is a shipped defect, in opposite
      directions: a board that turns out to be rampable makes the
      item pointless, and one that is unsolvable even WITH the
      booster is simply broken.

      What "unsolvable" is allowed to mean here is stated
      exactly, because it is a negative: no win was found by an
      exhaustive single-ramp sweep of the whole board at 1.5
      degrees, nor by tens of thousands of random two- and
      three-ramp layouts. It is a search, not a proof - but it is
      a far wider search than a player can run by hand, and the
      board it is run against is built so the answer is obvious
      by construction (see level 30: the target sits at the very
      height the ball is dropped from, right across the board,
      and a lossy bounce can never climb back to it).

   2. A MYSTERY BOX MUST CHANGE NOTHING.
      Every level's trajectory is simulated with its box and
      again with the box removed, and the two must agree to the
      last decimal. That is what makes it safe to have added one
      to all 150 levels - Verdholm's frozen twenty included -
      without re-verifying a single solution.

      Plus the placement rules: on the board, off the target, off
      the furniture, and off the do-nothing drop line, so
      collecting one is always a decision.
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

const n = await page.evaluate(() => window.__gtb.LEVELS.length);
console.log(`\nBOOSTERS AND MYSTERY BOXES — ${n} levels\n`);

/* ---------------------------------------------------------------- */
console.log('1. Boards that require a booster');

const needs = await page.evaluate(() =>
  window.__gtb.LEVELS.map((l, i) => ({ i, id: l.id, need: !!l.needsBooster }))
    .filter(l => l.need));

chk(needs.length > 0, 'at least one board in the game requires a booster',
    needs.map(l => `level ${l.id}`).join(', ') || 'none');

for (const lvl of needs) {
  const r = await page.evaluate(([li]) => {
    const g = window.__gtb, { simulate, CONSTS, BOOSTER } = g;
    const R = Math.PI / 180;
    const ramp = (cx, cy, deg, len = 120) => {
      const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
      return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
    };
    const lv = g.LEVELS[li];
    const seeds = [1, 2, 3, 4, 5, 6, 7];

    /* ---- half one: NO RAMP LAYOUT WINS ----
       Seed 1 only for the search itself: a win on any seed is enough to sink
       the claim, and one that only wins on some seeds is a lottery, not a
       solution. */
    let oneRamp = null;
    for (let rx = 40; rx <= 440 && !oneRamp; rx += 12)
      for (let ry = 80; ry <= 700 && !oneRamp; ry += 12)
        for (let th = 0; th < 180; th += 1.5)
          if (simulate([ramp(rx, ry, th)], 1, li).result === 'win') {
            oneRamp = { rx, ry, th }; break;
          }

    /* Random multi-ramp layouts. THREE as well as two, deliberately: the
       level's own budget is two, but a player can add spare ramps to any
       board, so "ramps alone" has to mean more ramps than the level hands
       out. */
    let rnd = 20250903;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const anyRamp = (len) => ramp(40 + rand() * 400, 90 + rand() * 620,
                                  rand() * 180, len);
    let multi = null;
    for (let k = 0; k < 60000 && !multi; k++) {
      const cfg = [anyRamp(120), anyRamp(120)];
      if (k % 2) cfg.push(anyRamp(100));
      if (simulate(cfg, 1, li).result === 'win') multi = cfg;
    }

    /* ---- half two: ONE BOOSTER OUT OF THE BAG DOES WIN ----
       Exactly the item the player owns - the shipped radius and speed, which
       come from the game rather than from a number copied in here - placed
       and aimed by the same freedoms the board gives them. */
    const B = (x, y, angle) => ({ x, y, r: BOOSTER.r, angle, speed: BOOSTER.speed });
    let solved = null, spots = 0;
    /* Stopped at ten solving spots rather than swept exhaustively. The claim
       being proved is "a booster solves this, and finding the spot is not a
       pixel hunt" - ten is already that, and the exhaustive version of this
       loop is minutes of simulator time for a number nobody reads. */
    for (let bx = 70; bx <= 430 && spots < 10; bx += 30)
      for (let by = 150; by <= 630 && spots < 10; by += 30) {
        let spotSolves = false;
        for (let ang = -170; ang < 180 && !spotSolves; ang += 10) {
          const j = g.scratch({ ...lv, boosters: [...lv.boosters, B(bx, by, ang)] }, 0);
          for (let ry = 130; ry <= 620 && !spotSolves; ry += 60)
            for (let th = 20; th <= 160; th += 12) {
              const cfg = [ramp(lv.spawn.x, ry, th)];
              if (simulate(cfg, 1, j).result !== 'win') continue;
              // and it must win on every obstacle seed, like any other solution
              if (!seeds.every(s => simulate(cfg, s, j).result === 'win')) continue;
              spotSolves = true;
              if (!solved) solved = { bx, by, ang, ry, th };
              break;
            }
        }
        if (spotSolves) spots++;
      }

    /* WHY it is unsolvable, as a property of the board rather than as a
       comment: the target's upper rim is at or above the height the ball is
       DROPPED from, and it is most of a board away sideways. A bounce is
       lossy and the fall is speed-clamped, so the ball can never regain its
       drop height - and it has to, to be over there at that height. */
    return { id: lv.id, oneRamp, multi: !!multi, solved, spots,
             bare: simulate([], 1, li).result,
             atDropHeight: lv.target.y - lv.target.r <= lv.spawn.y,
             across: Math.abs(lv.target.x - lv.spawn.x) };
  }, [lvl.i]);

  chk(!r.oneRamp, `level ${r.id}: no single ramp anywhere on the board solves it`,
      r.oneRamp ? `but one does: ${JSON.stringify(r.oneRamp)}` : 'swept the whole board at 1.5°');
  chk(!r.multi, `level ${r.id}: nor do 60,000 random two- and three-ramp layouts`,
      r.multi ? 'but one does' : 'none of them win');
  chk(!!r.solved, `level ${r.id}: one booster from the bag DOES solve it`,
      r.solved ? `e.g. booster (${r.solved.bx},${r.solved.by}) at ${r.solved.ang}°, ` +
                 `ramp y=${r.solved.ry} th=${r.solved.th}° - wins on all 7 seeds`
               : 'no booster placement wins');
  chk(r.spots >= 5, `level ${r.id}: and it is not a pixel hunt`,
      `${r.spots}+ booster positions solve it`);
  chk(r.atDropHeight && r.across > 250,
      `level ${r.id}: and the reason is VISIBLE - the target is at the ball's own ` +
      'drop height, right across the board',
      r.atDropHeight && r.across > 250
        ? `${Math.round(r.across)}px across, and a lossy bounce can never climb back up`
        : `at drop height: ${r.atDropHeight}, ${Math.round(r.across)}px across`);
}

/* ---------------------------------------------------------------- */
console.log('\n2. Mystery boxes change nothing');

/* `n`, not LEVELS.length: scratch() appends its slots to the end of LEVELS,
   and section 1 has already made one. Sweeping those would be sweeping the
   test's own scratch paper. */
const boxes = await page.evaluate((N) => {
  const g = window.__gtb, { simulate, CONSTS, MECH } = g;
  const R = Math.PI / 180;
  const BOX_R = MECH.BOX_R;     // from the game, so a resize cannot slip past
  const ramp = (cx, cy, deg, len = 120) => {
    const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
  };
  const distToSeg = (px, py, s) => {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2)) : 0;
    return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
  };

  let withBox = 0, drift = 0, missing = 0, offBoard = 0, onFurniture = 0, onBareLine = 0;
  const examples = [];
  for (let li = 0; li < N; li++) {
    const lv = g.LEVELS[li];
    if (!lv.boxes.length) { missing++; continue; }
    withBox++;

    /* SAME LEVEL, BOX REMOVED. Both go through scratch so the two runs differ
       in exactly one thing: whether the board carries a chest. */
    const a = g.scratch({ ...lv, boxes: lv.boxes }, 0);
    const b = g.scratch({ ...lv, boxes: [] }, 1);
    const sx = lv.spawn.x;
    for (const cfg of [[], [ramp(sx, 300, 60)], [ramp(sx, 420, 120)],
                       [ramp(sx, 240, 35), ramp(300, 520, 140)]])
      for (const seed of [1, 4, 9]) {
        const ra = simulate(cfg, seed, a), rb = simulate(cfg, seed, b);
        const same = ra.result === rb.result && ra.steps === rb.steps &&
                     ra.hits === rb.hits &&
                     ra.x.toFixed(9) === rb.x.toFixed(9) &&
                     ra.y.toFixed(9) === rb.y.toFixed(9);
        if (!same) {
          drift++;
          if (examples.length < 3) examples.push(`level ${lv.id}: ${ra.result}/${rb.result}`);
        }
      }

    for (const bx of lv.boxes) {
      if (bx.x - BOX_R < 0 || bx.x + BOX_R > CONSTS.W ||
          bx.y - BOX_R < 0 || bx.y + BOX_R > CONSTS.H) offBoard++;
      const solids = [...lv.obstacles, ...lv.fires, ...lv.breakables, ...lv.boosters,
                      ...lv.portals.flatMap(p => [p.a, p.b]),
                      { ...lv.target, r: lv.target.r + 20 }];
      for (const o of solids)
        if (Math.hypot(o.x - bx.x, o.y - bx.y) < o.r + BOX_R) {
          onFurniture++;
          if (examples.length < 6) examples.push(`level ${lv.id}: box on furniture`);
        }
      for (const w of lv.walls)
        if (distToSeg(bx.x, bx.y, w) < BOX_R + CONSTS.WALL_HT) onFurniture++;
      // and it must not be free: the do-nothing drop must miss it
      if (simulate([], 1, li).boxes > 0) onBareLine++;
    }
  }
  return { withBox, drift, missing, offBoard, onFurniture, onBareLine, examples,
           total: N };
}, n);

chk(boxes.missing === 0, 'every level in the game carries a mystery box',
    boxes.missing ? `${boxes.missing} have none` : `${boxes.withBox}/${boxes.total}`);
chk(boxes.drift === 0,
    'and the ball flies the IDENTICAL trajectory with the box and without it',
    boxes.drift ? boxes.examples.join(' | ')
                : `${boxes.withBox * 12} paired runs, not one pixel of difference`);
chk(boxes.offBoard === 0, 'every box is fully on the board',
    boxes.offBoard ? `${boxes.offBoard} are not` : 'all of them');
chk(boxes.onFurniture === 0, 'and none sits on the target, a wall or an obstacle',
    boxes.onFurniture ? boxes.examples.join(' | ') : 'all clear');
chk(boxes.onBareLine === 0,
    'nor on the do-nothing drop line - collecting one is always a decision',
    boxes.onBareLine ? `${boxes.onBareLine} are free` : 'every one needs a ramp');

/* ---------------------------------------------------------------- */
console.log('\n3. Boxes are reachable, not decoration');

const reach = await page.evaluate((N) => {
  const g = window.__gtb, { simulate, CONSTS } = g;
  const R = Math.PI / 180;
  const ramp = (cx, cy, deg, len = 120) => {
    const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
  };
  let unreachable = [];
  for (let li = 0; li < N; li++) {
    const lv = g.LEVELS[li];
    if (!lv.boxes.length) continue;
    const sx = lv.spawn.x;
    let got = false;
    /* The same fan of single ramps under the spawn that placed it. One layout
       that collects it is the whole claim: a player can get this. */
    for (let ry = lv.spawn.y + 90; ry <= 620 && !got; ry += 35)
      for (let th = 20; th <= 160; th += 5)
        if (simulate([ramp(sx, ry, th)], 1, li).boxes > 0) { got = true; break; }
    if (!got) unreachable.push(lv.id);
  }
  return unreachable;
}, n);

chk(reach.length === 0,
    'every box is collected by some single-ramp layout the solver can find',
    reach.length ? `unreachable on levels ${reach.join(', ')}` : `all ${n}`);

await browser.close();
console.log(fails ? `\n${fails} check(s) FAILED.\n`
                  : '\nBoosters and boxes hold their claims.\n');
process.exitCode = fails ? 1 : 0;
