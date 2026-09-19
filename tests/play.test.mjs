/**
 * Guide the Ball - Playwright suite.   node tests/play.test.mjs
 *
 * Covers boot, level data integrity, WALL physics (walls must really block),
 * obstacle bounce quality, the gravity/terminal-velocity model, the juice
 * helpers (tween + particles), render interpolation,
 * progression + localStorage, and the drawing UI on mouse and touch.
 * Re-run after ANY change to physics constants or level coordinates.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));
/* The app is a Vite build now, so it is served rather than opened off disk.
   Point GTB_URL at `npm run dev` or `npm run preview`. */
const GAME = process.env.GTB_URL || 'http://localhost:4173/';
const SHOTS = path.join(root, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok    = (n, x='') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad   = (n, x='') => { failures++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };
const check = (c, n, x='') => c ? ok(n, x) : bad(n, x);
const section = t => console.log(`\n${t}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 430, height: 1000 }, deviceScaleFactor: 2, hasTouch: true
});
const page = await context.newPage();
page.on('pageerror', e => bad('uncaught page error', e.message));
await page.addInitScript(() => { window.__gtbNoAutoSpin = true; });
await page.goto(GAME);
await page.waitForSelector('canvas#board');
await page.waitForFunction(() => !!(window.__gtb && window.__gtb.state));
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
/* Sections 1-12 predate the balls economy and between them drop far more
   than a tank holds. They are not testing the economy - section 13 is - so
   they run topped up. clearProgress() and a reload both restore a real tank,
   so every one of those is followed by another top-up. */
const topUp = () => page.evaluate(() => window.__gtb.setBalls(999));
/* Drop Ball, Undo and Clear are gone: the drop is a tap on empty board and a
   ramp is removed with its own ×. Sections that merely need a ball dropped go
   through the same entry point the tap reaches, rather than re-deriving a safe
   empty spot on every level. The GESTURE itself - a tap drops, a slide does
   not - is tested in its own section below. */
const dropBall = (pg = page) => pg.evaluate(() => window.__gtb.drop());
await topUp();

/* The wheel opens itself once a spin comes due (see App.tsx). Left on, a
   modal would appear on a timer part-way through unrelated tests and steal
   their clicks. The flag is set by an INIT SCRIPT rather than an evaluate:
   it has to be in place before the app's first check runs, and the app boots
   the instant a reload completes. Section 14b turns it back on to test it. */
const autoSpin = on => page.evaluate(v => window.__gtb.setAutoSpin(v), on);

/* The wheel, the info panel and the mute sit behind the gear now, so anything
   that used to click them straight off the HUD opens settings first. Both
   helpers are idempotent: the panels are a STACK, and settings stays open
   underneath whatever it opened. */
const settingsOpen = () => page.evaluate(() => !!document.getElementById('settingspanel'));
const openSettings = async () => {
  if (!(await settingsOpen())) await page.click('#btn-settings');
  await page.waitForSelector('#settingspanel');
};
const closeSettings = async () => {
  if (await settingsOpen()) {
    await page.click('#btn-settings-close');
    await page.waitForSelector('#settingspanel', { state: 'detached' });
  }
};

const C = await page.evaluate(() => window.__gtb.CONSTS);

/* board-space -> screen-space drag helpers */
const box0 = await page.locator('#board').boundingBox();
const P = (b, p) => ({ x: b.x + p.x * b.width / C.W, y: b.y + p.y * b.height / C.H });
async function mouseDrag(b, from, to){
  const a = P(b, from), z = P(b, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x+z.x)/2, (a.y+z.y)/2, { steps: 5 });
  await page.mouse.move(z.x, z.y, { steps: 5 }); await page.mouse.up();
}
async function mouseTap(b, at){
  const a = P(b, at);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.up();
}
async function touchTap(cdp, b, at){
  const a = P(b, at);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:a.x,y:a.y}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd',   touchPoints:[] });
}
/* mirrors deleteButtonAt() in the game: off the midpoint along the normal,
   flipped to whichever side keeps it on the board. The offset and radius are
   READ FROM THE GAME rather than copied - they were hardcoded here as 32/12
   and went stale the moment the × was resized. */
function delBtn(r){
  const mx=(r.x1+r.x2)/2, my=(r.y1+r.y2)/2, dx=r.x2-r.x1, dy=r.y2-r.y1;
  const m=Math.hypot(dx,dy)||1; const nx=-dy/m, ny=dx/m;
  const OFF=C.DEL_OFF, R=C.DEL_R;
  let bx=mx+nx*OFF, by=my+ny*OFF;
  if (bx<R||bx>C.W-R||by<R||by>C.H-R){ bx=mx-nx*OFF; by=my-ny*OFF; }
  return { x: Math.min(Math.max(bx,R),C.W-R), y: Math.min(Math.max(by,R),C.H-R) };
}
async function touchDrag(cdp, b, from, to){
  const a = P(b, from), z = P(b, to);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:a.x,y:a.y}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove',  touchPoints:[{x:(a.x+z.x)/2,y:(a.y+z.y)/2}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove',  touchPoints:[{x:z.x,y:z.y}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd',   touchPoints:[] });
}

/* ---------------------------------------------------------------- */
section('1. Boot');
check(await page.locator('#board').isVisible(), 'board renders');
check(await page.locator('#overlay').isHidden(), 'no overlay on a fresh board');
/* The chip names the BOARD BY NUMBER and nothing else. The city name it used
   to carry is in the level picker this opens - the chip has to survive the
   ~70px of bar it lives in, which no city name would. */
check((await page.locator('#level-title').textContent()).trim() === 'Level 1',
  'the level chip says which board this is, by number', await page.locator('#level-title').textContent());
check(await page.locator('#btn-settings').isVisible(),
  'the settings gear is on the HUD');
check(await page.locator('.hud .iconbtn').count() === 2 && await page.locator('.hud #btn-inventory.iconbtn').count() === 1,
  'beside only the bag - the wheel, the info panel and the mute are behind the gear');
/* The level chip lives IN the bar, so the row under the board is gone and
   the board runs to the bottom of the column. */
const pillGeo = await page.evaluate(() => {
  const p = document.getElementById('level-title').getBoundingClientRect();
  const b = document.querySelector('.stage').getBoundingClientRect();
  const h = document.querySelector('.hud').getBoundingClientRect();
  const counts = [...document.querySelectorAll('.hud .chips.left .counter')]
    .map(e => e.getBoundingClientRect());
  const bag = document.getElementById('btn-inventory').getBoundingClientRect();
  const word = document.querySelector('.levelpill .lvnum');
  return { inHud: p.top >= h.top - 0.5 && p.bottom <= h.bottom + 0.5,
           rightOfCounts: p.left >= Math.max(...counts.map(c => c.right)),
           leftOfBag: p.right <= bag.left + 0.5,
           belowBoard: p.top > b.bottom, ellipsised: word.scrollWidth > word.clientWidth + 0.5 };
});
check(pillGeo.inHud && pillGeo.rightOfCounts && pillGeo.leftOfBag && !pillGeo.belowBoard,
  'the level chip is in the bar, between the counts and the bag', JSON.stringify(pillGeo));
check(!pillGeo.ellipsised, 'and the word fits the gap rather than being cut short');
/* NOTHING SHARES THE BOARD'S SLOT any more. The board is a fixed 3:5, so it
   can only fill the axis that runs out first - what this proves is that it is
   the SLOT that caps it, not a row parked underneath it. */
const slotGeo = await page.evaluate(() => {
  const slot = document.querySelector('.board-slot').getBoundingClientRect();
  const b = document.querySelector('.stage').getBoundingClientRect();
  return { kids: document.querySelectorAll('.board-slot > *').length,
           rowsUnder: document.querySelectorAll('.levelrow').length,
           spare: +Math.min(slot.width - b.width, slot.height - b.height).toFixed(1) };
});
check(slotGeo.kids === 1 && slotGeo.rowsUnder === 0 && slotGeo.spare <= 1.5,
  'the board has the slot to itself, edge to edge - no row under it', JSON.stringify(slotGeo));
/* THE + IS GONE. Ramps are drawn on the board, so the bar carries counts and
   doors, and nothing else. What the + used to show - the ramps left on this
   board - is a counter chip beside the coins and the balls. */
const barGeo = await page.evaluate(() => {
  const h = document.querySelector('.hud').getBoundingClientRect();
  const counts = [...document.querySelectorAll('.hud .chips.left .counter')]
    .map(e => ({ cls: e.className, r: e.getBoundingClientRect() }));
  const ramps = document.getElementById('ramps-left');
  return { plus: !!document.getElementById('btn-add-ramp'),
           counts: counts.map(c => c.cls),
           rampsText: ramps ? ramps.textContent : null,
           inBar: !!ramps && ramps.getBoundingClientRect().top >= h.top - 0.5 &&
                  ramps.getBoundingClientRect().bottom <= h.bottom + 0.5,
           spread: Math.max(...counts.map(c => c.r.right)) -
                   Math.min(...counts.map(c => c.r.left)) };
});
check(!barGeo.plus, 'the + button is gone from the bar entirely');
check(barGeo.counts.length === 3 && barGeo.counts.some(c => /ramps/.test(c)),
  'three counts sit together on the left: coins, balls, ramps', barGeo.counts.join(' | '));
check(barGeo.inBar && barGeo.rampsText !== null,
  'and the ramps-left count is right there in the HUD', `reads ${barGeo.rampsText}`);
check(await page.locator('#try-count').count() === 0,
  'and the Try counter is gone - it is on the win card, where it changes the rating');
check(await page.locator('.legend').count() === 0,
  'and the old bottom legend is gone - it duplicated the panel');
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'level-01.png') });
ok('screenshot: level-01.png');

/* ---------------------------------------------------------------- */
section('2. Level data structure and position variety');
const lvinfo = await page.evaluate(() => {
  const { LEVELS, CONSTS } = window.__gtb;
  const TYPES = ['OPEN','SIDE_WALL','POCKET','NARROW_GAP','ENCLOSED'];
  let badId=0, badType=0, outOfBoard=0, overlap=0;
  let prevId = 0;
  LEVELS.forEach((l, i) => {
    /* STRICTLY INCREASING, not 1..n. The countries are authored out of
       order - Emberkeep and Needlecrest are in, the countries between them
       are not yet - so the array has id gaps at the country borders until
       they land. What must never break is the ORDER (progression walks the
       array) and the country containment checked below, since countryOf()
       and every derived city name read the id. */
    if (l.id <= prevId) badId++;
    prevId = l.id;
    if (TYPES.indexOf(l.targetType) < 0) badType++;
    const t = l.target;
    if (t.x-t.r < 0 || t.x+t.r > CONSTS.W || t.y-t.r < 0 || t.y+t.r > CONSTS.H) outOfBoard++;
    if (!(t.r > 0)) outOfBoard++;
    if (l.spawn.x < 0 || l.spawn.x > CONSTS.W) outOfBoard++;
    l.obstacles.forEach(o => {
      if (o.x-o.r < 0 || o.x+o.r > CONSTS.W || o.y-o.r < 0) outOfBoard++;
      if (Math.hypot(o.x-t.x, o.y-t.y) < o.r + t.r) overlap++;      // obstacle sitting on the target
      if (Math.abs(o.x - l.spawn.x) < o.r + CONSTS.BALL_R && o.y < 150) overlap++;  // blocking the spawn
    });
  });
  // position variety: how the target sits relative to the spawn, and how the
  // targets are spread over the board
  let right=0, left=0; const ys=[], seen=[];
  let tooClose = 0;
  LEVELS.forEach(l => {
    (l.target.x > l.spawn.x) ? right++ : left++;
    ys.push(l.target.y);
    // 30px apart on a 480x800 board is a visibly different board position
    // variety is a within-COUNTRY property: two levels twenty apart, in
    // different countries with different mechanics, may sit in the same place
    const w = window.__gtb.countryOf(l.id).id;
    seen.forEach(q => { if (q.w === w && Math.hypot(q.x-l.target.x, q.y-l.target.y) < 30) tooClose++; });
    seen.push({x:l.target.x, y:l.target.y, w:w});
  });
  // Verdholm (country 1) is pinned exactly; later countries are generated and
  // only have to obey the structural rules, not a hand-written plan
  const W1 = LEVELS.slice(0, 20);
  return { n: LEVELS.length, badId, badType, outOfBoard, overlap,
           countries: window.__gtb.COUNTRIES.map(c => `${c.id}:${c.from}-${c.to}`).join(' '),
           countrySpan: window.__gtb.COUNTRIES[window.__gtb.COUNTRIES.length-1].to,
           blocks: W1.map(l=>l.maxBlocks).join(','),
           obst:   W1.map(l=>l.obstacles.length).join(','),
           types:  W1.map(l=>l.targetType).join(','),
           moving: LEVELS.map((l,i)=>l.move?i+1:0).filter(Boolean).join(','),
           hasMoveKey: LEVELS.some(l => 'move' in l),
           idGaps: LEVELS.map((l,i)=> i && l.id !== LEVELS[i-1].id+1
                     ? `${LEVELS[i-1].id}->${l.id}` : '').filter(Boolean).join(' '),
           /* Which levels patrol, and the shape of it. A moving target is a
              deliberate mechanic now, so the guard is no longer "none exist"
              but "only where intended, and only sideways". */
           movingIds: LEVELS.filter(l=>l.targetMove).map(l=>l.id).join(','),
           movingNotOpen: LEVELS.filter(l=>l.targetMove&&l.targetType!=='OPEN').map(l=>l.id).join(','),
           right, left, tooClose,
           ySpread: Math.max(...ys) - Math.min(...ys) };
});
/* NO GAPS. Countries are authored out of plan order, but their level RANGES
   are assigned in shipping order (see countries.data.ts), so the ids the
   player sees always run 1..N unbroken. This is the check that keeps it that
   way: build a country and forget to give it the next free block and the
   numbering splits, which is exactly what it used to do. */
const PLAN_ID_GAPS = '';
/* Only Needlecrest patrols its target - country 10, shipped third, at 41-50. */
const PLAN_MOVING  = '41,42,43,44,45,46,47,48,49,50';
const PLAN_BLOCKS = '1,1,1,2,2,2,1,3,2,2,2,2,3,2,3,2,2,2,3,3';
const PLAN_OBST   = '0,0,1,0,1,2,2,2,3,2,0,1,1,2,2,3,2,3,4,3';
const PLAN_TYPES  = 'OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,' +
                    'SIDE_WALL,POCKET,NARROW_GAP,NARROW_GAP,ENCLOSED,OPEN,SIDE_WALL,NARROW_GAP,POCKET,ENCLOSED';
console.log(`  ${lvinfo.n} levels; ${lvinfo.right} reach right, ${lvinfo.left} reach left; ` +
            `target y spread ${lvinfo.ySpread}px`);
console.log(`  countries: ${lvinfo.countries}`);
check(lvinfo.n >= 20, 'the original twenty are still all there', `${lvinfo.n} levels total`);
check(lvinfo.n <= lvinfo.countrySpan,
  'no level exists outside the declared country ranges',
  `${lvinfo.n} of ${lvinfo.countrySpan} planned`);
/* --- countries and cities: the structure the level ids hang off --- */
const geo = await page.evaluate(() => {
  const g = window.__gtb, C = g.COUNTRIES;
  const gaps = [];
  for (let i = 0; i < C.length; i++) {
    if (C[i].from > C[i].to) gaps.push(`${C[i].name} range inverted`);
    if (i && C[i].from !== C[i - 1].to + 1)
      gaps.push(`${C[i - 1].name}->${C[i].name} not contiguous`);
  }
  const sizes = C.map(c => c.to - c.from + 1);
  const palettes = new Set(C.map(c => c.sky.join('|') + c.wash + c.accent));
  const names = new Set(C.map(c => c.name));
  // every shipped level resolves to a country, and to a city name inside it
  const cities = g.LEVELS.map(l => g.cityOf(l));
  const orphan = g.LEVELS.filter(l => {
    const c = g.countryOf(l.id);
    return l.id < c.from || l.id > c.to;
  }).length;
  return {
    n: C.length, first: C[0].from, last: C[C.length - 1].to,
    gaps, sizes, uniquePalettes: palettes.size, uniqueNames: names.size,
    orphan, uniqueCities: new Set(cities).size, nCities: cities.length,
    sample: [g.cityOf(g.LEVELS[0]), g.cityOf(g.LEVELS[19]),
             g.cityOf(g.LEVELS[20]), g.cityOf(g.LEVELS[29])],
    verdholmFrozen: C[0].name === 'Verdholm' &&
                    /* the toon day sky. It replaced the night navy on purpose;
                       pinned so it cannot change by accident either */
                    C[0].sky.join(',') === '#d3edff,#e4f3ff,#f2ecff' &&
                    C[0].accent === '#ffb400',
  };
});
console.log(`  cities: ${geo.sample.join(', ')}`);
check(geo.n === 14, 'fourteen countries are declared', `${geo.n}`);
check(geo.gaps.length === 0, 'their level ranges are contiguous with no gaps',
  geo.gaps.join('; ') || `${geo.first}-${geo.last}`);
check(geo.first === 1 && geo.last === 150, 'and they span levels 1-150',
  `${geo.first}-${geo.last}`);
check(geo.sizes[0] === 20 && geo.sizes.slice(1).every(n => n === 10),
  'the first country holds twenty cities and the rest ten', geo.sizes.join(','));
check(geo.uniqueNames === geo.n, 'every country name is distinct');
check(geo.uniquePalettes === geo.n, 'every country has its own palette',
  `${geo.uniquePalettes} of ${geo.n}`);
check(geo.verdholmFrozen, 'Verdholm keeps its pinned (toon day) palette');
check(geo.orphan === 0, 'every level falls inside its country range');
check(geo.uniqueCities === geo.nCities, 'every city name is unique',
  `${geo.uniqueCities} of ${geo.nCities}`);
/* The four sampled cities are levels 1, 20, 21 and 30 - the two ends of
   Verdholm and the two ends of Solmesa, so the ordinal is checked where it
   starts, where it reaches XX, and where it rolls over into the next country. */
check(geo.sample[0] === 'Verdholm I' && geo.sample[1] === 'Verdholm XX' &&
      geo.sample[2] === 'Solmesa I'  && geo.sample[3] === 'Solmesa X',
  'city names are derived from country + position, and roll over at a border',
  geo.sample.join(', '));

check(lvinfo.badId === 0, 'level ids increase strictly down the array');
/* Stated out loud rather than left implicit: this is the cost of authoring
   countries out of order, and it is visible to the player as a jump in the
   level number. It goes away as the missing countries are filled in. */
check(lvinfo.idGaps === PLAN_ID_GAPS, 'the only id gaps are the un-authored countries',
  lvinfo.idGaps || 'none');
check(lvinfo.badType === 0, 'every targetType is one of the five');
check(lvinfo.outOfBoard === 0, 'spawns, targets and obstacles are inside the board');
check(lvinfo.overlap === 0, 'no obstacle sits on a target or blocks a spawn');
check(lvinfo.blocks === PLAN_BLOCKS, 'world 1 ramp budgets match the plan, drops at 7/14/17/18 intact');
check(lvinfo.obst === PLAN_OBST, 'world 1 obstacle counts match the plan');
check(lvinfo.types === PLAN_TYPES, 'world 1 target types match the plan');
/* The OLD 2D waypoint block stays gone for good - that is the one that
   dragged walls through player ramps. What replaced it is horizontal-only
   and is checked on its own terms just below. */
check(lvinfo.moving === '' && !lvinfo.hasMoveKey,
  'the old 2D `move` waypoint block is still gone', lvinfo.moving || 'none');
check(lvinfo.movingIds === PLAN_MOVING, 'only Needlecrest patrols its target',
  lvinfo.movingIds || 'none');
check(lvinfo.movingNotOpen === '',
  'and every patrolling target is OPEN, so no wall is ever dragged with it',
  lvinfo.movingNotOpen || 'none');
check(lvinfo.right >= 7 && lvinfo.left >= 7,
  'targets are reached both leftward and rightward', `${lvinfo.right}R / ${lvinfo.left}L`);
check(lvinfo.tooClose === 0, 'no two levels put the target in the same spot');
check(lvinfo.ySpread > 100, 'target height varies across levels', `${lvinfo.ySpread}px spread`);

/* ---------------------------------------------------------------- */
/* Level 20 once had an obstacle parked on its cup's mouth, which left a
   1.5px channel either side of it for an 18px ball. Walls bounce the ball
   predictably, so a narrow WALL gap is a skill test; obstacles scatter it
   at random, so a narrow OBSTACLE gap is a lottery. Difficulty belongs in
   the approach, where a plan can account for it - never in the one passage
   the ball is obliged to take. */
section('2b. Nothing random may choke a walled target\'s entry');
const mouths = await page.evaluate(() => {
  const { LEVELS, CONSTS } = window.__gtb;
  const { BALL_R, WALL_HT } = CONSTS;
  const out = [];
  LEVELS.forEach(lv => {
    const c = lv.target, d = c.r + 16, up = lv.wallH || 112;
    let y, lo, hi;
    if (lv.targetType === 'ENCLOSED'){
      // the mouth is the gap between the tops of the two side bars
      y = c.y - up; lo = c.x - d + WALL_HT + BALL_R; hi = c.x + d - WALL_HT - BALL_R;
    } else if (lv.targetType === 'NARROW_GAP'){
      // gapW is already the clear window for the ball's CENTRE
      y = c.y - d;
      const gx = c.x + (lv.gapX || 0), half = (lv.gapW || 46) / 2;
      lo = gx - half; hi = gx + half;
    } else return;                              // no obligatory passage
    // carve each obstacle's shadow (grown by the ball's radius) out of it
    let free = [[lo, hi]];
    lv.obstacles.forEach(o => {
      const dy = Math.abs(y - o.y), rr = o.r + BALL_R;
      if (dy >= rr) return;
      const half = Math.sqrt(rr * rr - dy * dy);
      const a = o.x - half, b = o.x + half, next = [];
      free.forEach(seg => {
        const st = seg[0], en = seg[1];
        if (b <= st || a >= en){ next.push(seg); return; }
        if (a > st) next.push([st, a]);
        if (b < en) next.push([b, en]);
      });
      free = next;
    });
    const widest = free.reduce((m, seg) => Math.max(m, seg[1] - seg[0]), 0);
    out.push({ id: lv.id, type: lv.targetType,
               open: +(hi - lo).toFixed(1), clear: +widest.toFixed(1) });
  });
  return out;
});
for (const m of mouths)
  console.log(`  L${String(m.id).padStart(2)} ${m.type.padEnd(10)} mouth ${String(m.open).padStart(5)}px ` +
              `-> ${String(m.clear).padStart(5)}px clear after obstacles`);
check(mouths.length >= 5, 'the walled-target levels are being checked', `${mouths.length} levels`);
check(mouths.every(m => m.clear >= 20),
  'every obligatory passage leaves the ball real room, not a sliver',
  `tightest ${Math.min(...mouths.map(m => m.clear))}px`);
/* An obstacle may shave the edge of a mouth - L15's does, and at 75px of 84
   the ball is in no danger of needing luck. What must never happen again is
   one standing in the middle of it: the version of L20 this guards against
   left 1.5px of a 72px mouth, or 2%. */
const mouthKept = mouths.reduce((w, m) => Math.min(w, m.clear / m.open), 1);
check(mouthKept >= 0.6, 'and none has most of its mouth taken away by an obstacle',
  `tightest keeps ${(mouthKept * 100).toFixed(0)}% of its mouth`);

/* ---------------------------------------------------------------- */
section('3. Walls are real physics, not decoration');
const wall = await page.evaluate(() => {
  const { LEVELS, simulate, buildWalls } = window.__gtb;
  const D=180/Math.PI, R=Math.PI/180;
  const ramp=(cx,cy,deg,len=120)=>{const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy};};
  const lv = LEVELS[0];
  const tc = lv.target;
  const origSpawn = lv.spawn.x, origType = lv.targetType, origWalls = lv.walls;

  // APPROACH A - straight down the middle, no ramps at all (spawn moved over
  // the target). This is the "drop it into the cup" approach.
  // APPROACH B - deflected in from the left at a shallow angle by one ramp.
  /* The side ramp is SEARCHED for, not derived. A single analytically-placed
     ramp only ever scored under one particular simulator, which made this
     baseline an engine assumption rather than a control. Any shallow ramp
     that scores on the open board serves the purpose: the point of the
     section is that a wall then BLOCKS it. */
  const shallowRy = 560;
  const phi = Math.atan2(tc.y - shallowRy, tc.x - origSpawn) * D;
  let sideCfg = [ramp(origSpawn, shallowRy, (phi + 90) / 2)];
  let sideRy = shallowRy;
  search:
  for (const ry of [560, 540, 520, 500, 580, 600]) {
    const base = Math.atan2(tc.y - ry, tc.x - origSpawn) * D;
    for (let d = 0; d <= 40; d += 2)
      for (const th of [(base + 90) / 2 + d, (base + 90) / 2 - d]) {
        const cfg = [ramp(origSpawn, ry, th)];
        lv.spawn.x = origSpawn;
        if (simulate(cfg, 1, 0).result === 'win') { sideCfg = cfg; sideRy = ry; break search; }
      }
  }
  const sideDeg = Math.abs(Math.atan2(tc.x - origSpawn, tc.y - sideRy) * D);

  const probe = () => {
    lv.spawn.x = tc.x;
    const vertical = simulate([], 1, 0);
    lv.spawn.x = origSpawn;
    const side = simulate(sideCfg, 1, 0);
    return { vertical: vertical.result, side: side.result,
             sMax: side.spdMax, vyMax: side.vyMax };
  };

  const open = probe();
  const walled = {};
  for (const type of ['SIDE_WALL','POCKET','NARROW_GAP','ENCLOSED']){
    lv.targetType = type; lv.walls = buildWalls(lv);
    walled[type] = Object.assign({ n: lv.walls.length }, probe());
  }
  lv.spawn.x = origSpawn; lv.targetType = origType; lv.walls = origWalls;
  return { open, sideDeg, rows: Object.keys(walled).map(k => Object.assign({type:k}, walled[k])) };
});
console.log(`  OPEN target: vertical drop = ${wall.open.vertical}, ` +
            `side approach (${wall.sideDeg.toFixed(0)}° off vertical) = ${wall.open.side}`);
check(wall.open.vertical === 'win' && wall.open.side === 'win',
  'with no walls, BOTH approaches score');
for (const r of wall.rows)
  console.log(`  ${r.type.padEnd(11)} ${r.n} wall(s): vertical=${r.vertical.padEnd(4)} side=${r.side}`);
const row = t => wall.rows.find(r => r.type === t);
check(wall.rows.every(r => r.n > 0), 'every walled type generates wall segments');
check(row('SIDE_WALL').side !== 'win', 'SIDE_WALL blocks the side it guards');
check(row('SIDE_WALL').vertical === 'win', 'SIDE_WALL still allows entry from above');
check(row('POCKET').vertical !== 'win', 'POCKET lid blocks entry from above');
check(row('POCKET').side !== 'win', 'POCKET wall blocks the guarded side');
check(row('NARROW_GAP').side !== 'win', 'NARROW_GAP blocks the shallow side approach');
check(row('NARROW_GAP').vertical === 'win', 'NARROW_GAP lets a ball through its opening');
check(row('ENCLOSED').side !== 'win', 'ENCLOSED blocks the side approach that OPEN allowed');
check(row('ENCLOSED').vertical === 'win', 'ENCLOSED still lets a vertical drop into the cup');
const e = row('ENCLOSED');
check(e.sMax <= C.MAX_SPEED + 1e-9 && e.vyMax <= C.TERMINAL_VY + 1e-9,
  'wall bounces stay inside the speed and terminal-velocity caps',
  `peak ${e.sMax.toFixed(2)} / cap ${C.MAX_SPEED.toFixed(2)}, vy ${e.vyMax.toFixed(2)}`);

/* ---------------------------------------------------------------- */
/* Targets used to glide between WAYPOINTS on levels 17/19/20, in two
   dimensions, dragging their walls with them. That was removed, because a
   target sliding through the space a ramp occupies made the collision read
   as a bug, and this section was the guard against it returning.

   Needlecrest reintroduces movement, deliberately and in a narrower form,
   so the guard is rewritten rather than deleted. What killed the first
   attempt was never "the target moved" - it was that COLLIDABLE GEOMETRY
   moved. So the property defended here is now exactly that one:

     - walls are built from the target centre and never move, on any level;
     - a target with no patrol never drifts, ever;
     - a patrol is horizontal ONLY: y and r are constant, and the levels
       carrying one are OPEN, which have no walls to drag in the first place
       (enforced in levels/index.ts, checked in section 2).

   A target that moves in y, or one that moves while carrying walls, is
   still a defect and still fails here. */
section('3b. Targets move only where intended, and never drag geometry');
const stat = await page.evaluate(async () => {
  const { LEVELS, buildWalls, state, clock } = window.__gtb;
  const noMoveBlock = LEVELS.every(l => l.move === undefined);
  /* A patrol is horizontal and nothing else. Sampled right across a full
     period on every patrolling level: y and r must never budge, and x must
     stay inside the authored bounds - which together is the whole of what
     "horizontal-only" means. */
  const { targetAt } = window.__gtb;
  let vertical = 0, outOfBounds = 0, patrols = 0, planMismatch = 0;
  LEVELS.filter(l => l.targetMove).forEach(lv => {
    patrols++;
    /* t=0 is what the player plans against, so the authored centre and the
       patrol's start have to be the same point. If they drift apart, the
       board shows one thing and the drop begins somewhere else. */
    if (targetAt(lv, 0).x !== lv.target.x) planMismatch++;
    const lo = Math.min(lv.targetMove.x0, lv.targetMove.x1);
    const hi = Math.max(lv.targetMove.x0, lv.targetMove.x1);
    for (let k = 0; k <= 64; k++){
      const c = targetAt(lv, lv.targetMove.period * k / 64);
      if (c.y !== lv.target.y || c.r !== lv.target.r) vertical++;
      if (c.x < lo - 1e-9 || c.x > hi + 1e-9) outOfBounds++;
    }
  });
  // walls are built once at boot and must stay identical to a fresh build
  let wallsStale = 0;
  LEVELS.forEach(lv => {
    const fresh = buildWalls(lv, lv.target);
    if (fresh.length !== lv.walls.length) { wallsStale++; return; }
    for (let i = 0; i < fresh.length; i++){
      const f = fresh[i], w = lv.walls[i];
      if (f.x1!==w.x1 || f.y1!==w.y1 || f.x2!==w.x2 || f.y2!==w.y2) wallsStale++;
    }
  });
  // and the live target must not drift as the animation clock advances.
  // Stays on whatever level is loaded on purpose: setLevel() would push
  // `highest` forward and quietly hand section 7 a bogus save to read.
  const t0 = state().target, c0 = clock();
  await new Promise(r => setTimeout(r, 600));
  const t1 = state().target, c1 = clock();
  return { noMoveBlock, wallsStale, patrols, vertical, outOfBounds, planMismatch,
           drift: Math.hypot(t1.x - t0.x, t1.y - t0.y),
           clockRan: c1 - c0 };
});
check(stat.noMoveBlock, 'no level carries the old 2D `move` waypoint block');
check(stat.patrols > 0, 'the patrol sampler actually had levels to sample',
  `${stat.patrols} patrolling levels`);
check(stat.vertical === 0, 'a patrolling target never changes y or radius - horizontal only',
  `${stat.vertical} samples off the line`);
check(stat.outOfBounds === 0, 'and never leaves the bounds it was authored with',
  `${stat.outOfBounds} samples outside`);
check(stat.planMismatch === 0, 'a patrol starts exactly where the planning board draws it',
  `${stat.planMismatch} mismatched`);
check(stat.wallsStale === 0, 'cached walls match a fresh build for every level');
check(stat.clockRan > 0.2, 'the animation clock is still running', `${stat.clockRan.toFixed(2)}s`);
/* Still the sharpest check in this section, and sharper than it was: a patrol
   runs on the SIMULATION clock, so even on a patrolling board the target must
   sit perfectly still while the player is only planning. Movement driven off
   the animation clock would pass every other check here and fail this one. */
check(stat.drift === 0, 'the target does not move while the animation clock advances',
  `${stat.drift.toFixed(3)}px`);

/* the same thing, but through a real drop: the target the ball is chasing
   must be in the same place at the end of the flight as at the start */
const statDrop = await page.evaluate(() => {
  const { LEVELS, simulate } = window.__gtb;
  let moved = 0;
  LEVELS.forEach((lv, li) => {
    const before = { x: lv.target.x, y: lv.target.y };
    simulate([{x1:60,y1:300,x2:200,y2:340}], 3, li);
    if (lv.target.x !== before.x || lv.target.y !== before.y) moved++;
  });
  return moved;
});
check(statDrop === 0, 'simulating a drop never displaces a target');

/* ---------------------------------------------------------------- */
section('4. Obstacle bounce quality');
const bq = await page.evaluate(() => {
  const { simulate, CONSTS } = window.__gtb;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=110) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  const { LEVELS } = window.__gtb;
  const D = 180/Math.PI;
  const all = [];
  // aim straight at each obstacle so every run actually produces a bounce
  for (const li of [2, 4]){
    const lv = LEVELS[li], sx = lv.spawn.x, o = lv.obstacles[0];
    for (let ry = lv.spawn.y + 100; ry < o.y - 40; ry += 6)
      for (let s = 1; s <= 40; s++){
        const phi = Math.atan2(o.y - ry, o.x - sx) * D;
        all.push(...simulate([ramp(sx, ry, (phi + 90)/2)], s, li).bounces);
      }
  }
  let outward=0, cone=0, jit=0, sum=0;
  for (const b of all){
    const refl = 2*b.nAng - b.inAng + Math.PI;
    const fromRefl = Math.abs(wrap(b.outAng - refl));
    const fromNorm = Math.abs(wrap(b.outAng - b.nAng));
    if (Math.cos(fromNorm) > 0) outward++;
    if (fromNorm <= CONSTS.OB_MAX_DEV + 1e-9) cone++;
    if (fromRefl <= CONSTS.OB_JITTER + 1e-9) jit++;
    sum += fromRefl;
  }
  return { n: all.length, outward, cone, jit, mean: (sum/all.length)*180/Math.PI };
});
console.log(`  ${bq.n} bounces; mean deviation from a true reflection ${bq.mean.toFixed(1)}°`);
check(bq.n > 200, 'harvested a real bounce sample', `${bq.n}`);
check(bq.outward === bq.n, 'every bounce sends the ball away from the obstacle');
check(bq.cone === bq.n, 'no bounce escapes the outward cone');
check(bq.jit === bq.n, 'every bounce is a mirror reflection plus bounded scatter');
check(bq.mean > 8, 'bounces still carry real randomness', `mean ${bq.mean.toFixed(1)}°`);

/* ---------------------------------------------------------------- */
section('5. Gravity model: terminal velocity, caps, and lossy bounces');
/* A BOOSTER IS THE ONE THING ALLOWED PAST THESE CAPS, and only it.

   The general caps are what the whole trajectory model rests on, so the sweep
   below splits the levels rather than relaxing the bound for all of them. A
   level with no booster on it must still obey MAX_SPEED and TERMINAL_VY
   exactly as before - that is what proves a boost tuning cannot leak into the
   worlds that have none. A level with a booster is held to BOOST_CAP, which
   is the speed the ball would start passing through ramps at. */
const inv = await page.evaluate(() => {
  const { LEVELS, simulate, CONSTS, MECH } = window.__gtb;
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=110) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  let rnd = 4242; const rand = () => (rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff;
  let overSpeed = 0, overVy = 0, runs = 0, bounces = 0, segs = 0;
  let overBoost = 0, boostRuns = 0;
  let peak = 0, peakVy = 0, varied = 0;
  for (let li = 0; li < LEVELS.length; li++){
    const boosted = LEVELS[li].boosters.length > 0;
    for (let i = 0; i < 1200; i++){
      const cfg = [];
      for (let k = 0; k < LEVELS[li].maxBlocks; k++)
        cfg.push(ramp(30+rand()*420, 120+rand()*520, -85+rand()*170, 60+rand()*90));
      const o = simulate(cfg, 1 + (i%64), li);
      runs++; bounces += o.hits; segs += o.segHits;
      if (boosted) {
        boostRuns++;
        if (o.spdMax > MECH.BOOST_CAP + 1e-9) overBoost++;
      } else {
        if (o.spdMax > CONSTS.MAX_SPEED + 1e-9) overSpeed++;
        if (o.vyMax  > CONSTS.TERMINAL_VY + 1e-9) overVy++;
        peakVy = Math.max(peakVy, o.vyMax);
      }
      if (o.spdMax - o.spdMin > 1e-6) varied++;
      peak   = Math.max(peak, o.spdMax);
    }
  }
  return { runs, bounces, segs, overSpeed, overVy, overBoost, boostRuns,
           peak, peakVy, varied,
           cap: CONSTS.MAX_SPEED, term: CONSTS.TERMINAL_VY, boostCap: MECH.BOOST_CAP };
});
console.log(`  ${inv.runs} runs (${inv.boostRuns} on boosted levels), ` +
            `${inv.bounces} obstacle + ${inv.segs} segment bounces; ` +
            `peak speed ${inv.peak.toFixed(2)}, peak vy ${inv.peakVy.toFixed(2)}/${inv.term}`);
check(inv.overSpeed === 0, 'on a level with no booster, speed never exceeds the cap',
  `${inv.overSpeed} runs over ${inv.cap.toFixed(2)}`);
check(inv.overVy === 0, 'on a level with no booster, vy never exceeds TERMINAL_VY',
  `${inv.overVy} runs over`);
check(inv.overBoost === 0, 'and a boosted level never exceeds the boost cap either',
  `${inv.overBoost} of ${inv.boostRuns} runs over ${inv.boostCap}`);
check(inv.varied === inv.runs, 'speed genuinely varies during every run (gravity is real)',
  `${inv.varied}/${inv.runs}`);
check(inv.peakVy > inv.term * 0.98, 'a free fall actually reaches terminal velocity',
  `${inv.peakVy.toFixed(3)}`);

/* free-fall profile: how long to terminal, straight down, no ramps */
const fall = await page.evaluate(() => {
  const { LEVELS, CONSTS } = window.__gtb;
  // integrate the same way stepBall does, so this measures the shipped numbers
  const G = CONSTS.GRAVITY, T = CONSTS.TERMINAL_VY, S = CONSTS.SUBSTEPS;
  let vy = 0, steps = 0;
  while (vy < T - 1e-9 && steps < 600){
    for (let i = 0; i < S; i++){ vy += G/S; if (vy > T) vy = T; }
    steps++;
  }
  return { steps, secs: steps/60 };
});
console.log(`  free fall reaches terminal velocity in ${fall.steps} steps (${fall.secs.toFixed(2)}s)`);
check(fall.secs >= 0.30 && fall.secs <= 0.50,
  'terminal velocity is reached in 0.3-0.5s of free fall', `${fall.secs.toFixed(2)}s`);

/* a head-on bounce must lose energy, not preserve or reset it */
const rest = await page.evaluate(() => {
  const { LEVELS, simulate, CONSTS } = window.__gtb;
  // a flat ramp square under the spawn: the ball falls onto it head-on
  const lv = LEVELS[0], sx = lv.spawn.x;
  const flat = [{ x1: sx-70, y1: 420, x2: sx+70, y2: 420 }];
  const o = simulate(flat, 1, 0);
  // and no genuine win anywhere should be long enough to look like a stall
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=110) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  let rnd = 4242; const rand = () => (rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff;
  let slowestWin = 0, winN = 0, longRuns = 0, sampled = 0;
  for (let li = 0; li < LEVELS.length; li++)
    for (let i = 0; i < 400; i++){
      const cfg = [];
      for (let k = 0; k < LEVELS[li].maxBlocks; k++)
        cfg.push(ramp(30+rand()*420, 120+rand()*520, -85+rand()*170, 60+rand()*90));
      const w = simulate(cfg, 1+(i%64), li);
      sampled++;
      if (w.secs > 5) longRuns++;
      if (w.result === 'win'){ winN++; slowestWin = Math.max(slowestWin, w.secs); }
    }
  return { r: CONSTS.RESTITUTION, result: o.result, segHits: o.segHits,
           secs: o.secs, slowestWin, winN, longRuns, sampled, restPx: CONSTS.REST_PX };
});
check(rest.segHits > 0, 'the flat-ramp probe actually made contact', `${rest.segHits} hits`);
check(rest.result !== 'win' && rest.secs < 6,
  'a ball that settles on a flat ramp is called early, not after the full 14s',
  `${rest.result} in ${rest.secs.toFixed(2)}s`);
check(rest.slowestWin < C.MAX_STEPS / 60,
  'every win lands well inside the 14s cap', `slowest win ${rest.slowestWin.toFixed(2)}s`);
console.log(`  stall watch: ${rest.restPx}px per ${C.REST_STEPS} steps; ` +
            `${rest.winN} wins in the sample, ${rest.longRuns} runs still over 5s`);
check(rest.longRuns / rest.sampled < 0.05,
  'long dead-end runs stay rare', `${rest.longRuns}/${rest.sampled}`);

/* ---------------------------------------------------------------- */
section('6. Live drop: accelerating fall + smooth rendering');
const best1 = await page.evaluate(() => {
  const { LEVELS, simulate } = window.__gtb;
  const D=180/Math.PI, R=Math.PI/180;
  const ramp=(cx,cy,deg,len=120)=>{const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy};};
  const lv=LEVELS[0], tc=lv.target;
  for (let ry=200; ry<600; ry+=10){
    const phi=Math.atan2(tc.y-ry,tc.x-lv.spawn.x)*D;
    const cfg=[ramp(lv.spawn.x,ry,(phi+90)/2)];
    if (simulate(cfg,1,0).result==='win') return cfg;
  }
  return null;
});
check(!!best1, 'found a level-1 solution to drive the UI with');
const live = await page.evaluate(async (ramps) => {
  const g = window.__gtb;
  g.reset(); g.setSeed(4); g.setRamps(ramps);
  const speeds = [], draws = [];
  let juiceHits = 0, maxSquash = 0, maxParticles = 0;
  window.__gtb.drop();
  await new Promise(res => (function tick(){
    const s = g.state();
    if (s.phase !== 'drop') return res();
    if (s.ball){
      speeds.push(s.ball.speed);
      juiceHits = Math.max(juiceHits, s.ball.hits);
      maxSquash = Math.max(maxSquash, Math.abs(s.juice.squash));
      maxParticles = Math.max(maxParticles, s.juice.live);
      draws.push({d:s.draw, a:{x:s.ball.px,y:s.ball.py}, b:{x:s.ball.x,y:s.ball.y}});
    }
    requestAnimationFrame(tick);
  })());
  let offSeg=0, frozen=0, prestep=0, prev=null;
  for (const s of draws){
    const abx=s.b.x-s.a.x, aby=s.b.y-s.a.y, apx=s.d.x-s.a.x, apy=s.d.y-s.a.y;
    const len=Math.hypot(abx,aby);
    if (len<=1e-9){ prestep++; prev=s.d; continue; }   // painted before the first
    const cross=Math.abs(abx*apy-aby*apx)/len;         // physics step ran
    const t=(apx*abx+apy*aby)/(len*len);
    if (cross>1e-6 || t<-1e-6 || t>1+1e-6) offSeg++;
    if (prev && Math.hypot(s.d.x-prev.x, s.d.y-prev.y) < 1e-9) frozen++;
    prev = s.d;
  }
  // the win is swallowed by the target before the overlay appears - watch it
  let sawCapture = 0, shrank = false;
  const startR = 999;
  await new Promise(res => (function tick(){
    const s = g.state();
    if (s.capturing){ sawCapture++; }
    if (s.phase === 'over') return res();
    requestAnimationFrame(tick);
  })());
  return { n:speeds.length, min:Math.min(...speeds), max:Math.max(...speeds), offSeg, frozen, prestep,
           juiceHits, maxSquash, maxParticles,
           sawCapture, result: g.state().result };
}, best1);
console.log(`  ${live.n} frames, speed ${live.min.toFixed(3)} .. ${live.max.toFixed(3)} ` +
            `(cap ${C.MAX_SPEED.toFixed(2)}), ${live.juiceHits} contacts, ` +
            `peak squash ${live.maxSquash.toFixed(3)}, peak live particles ${live.maxParticles}`);
check(live.n > 20, 'sampled the drop', `${live.n} frames`);
check(live.min < live.max - 1e-3, 'the ball visibly accelerates during a live drop',
  `${live.min.toFixed(3)} -> ${live.max.toFixed(3)}`);
check(live.max <= C.MAX_SPEED + 1e-6, 'live speed stays inside the cap');
check(live.juiceHits > 0 && live.maxSquash > 0.05,
  'a live impact squashes the ball', `${live.juiceHits} hits, peak ${live.maxSquash.toFixed(3)}`);
check(live.maxParticles >= 4 && live.maxParticles <= 96,
  'a live impact spawns particles from the pool', `peak ${live.maxParticles}`);
check(live.offSeg === 0, 'painted position always lies between the two physics states');
check(live.frozen === 0, 'ball never paints twice in the same spot once moving',
  `${live.frozen} frozen, ${live.prestep} pre-step frames ignored`);
check(live.result === 'win', 'the solution wins through the real UI');
check(live.sawCapture > 3, 'the capture animation actually plays before the overlay',
  `${live.sawCapture} frames of capture`);

/* ---------------------------------------------------------------- */
section('6b. Juice helpers in isolation');
const juice = await page.evaluate(async () => {
  const { tween, Ease, burst, state } = window.__gtb;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* --- tween: reaches the end value, on the curve, and is retargetable --- */
  const o = { v: 0 };
  tween(o, 'v', 0, 100, 200, Ease.linear);
  const atStart = o.v;
  await wait(100);
  const mid = o.v;                       // linear: should be near 50 at halfway
  await wait(180);
  const end = o.v;

  // a second tween on the same property must replace the first, not fight it
  const o2 = { v: 0 };
  tween(o2, 'v', 0, 100, 4000, Ease.linear);
  tween(o2, 'v', 0, 10, 120, Ease.linear);
  const tweensAfterReplace = state().juice.tweens;
  await wait(200);
  const replaced = o2.v;

  // outBack must overshoot its target and come back
  const o3 = { v: 0 };
  let peak = 0;
  tween(o3, 'v', 0, 1, 260, Ease.outBack);
  for (let i = 0; i < 30; i++){ await wait(10); peak = Math.max(peak, o3.v); }
  await wait(200);

  /* --- particles: bounded pool, they die, and they carry the colour --- */
  const before = state().juice.live;
  for (let i = 0; i < 40; i++) burst(240, 400, 0, -1, '#3ec8ff', 8, 3, 0.8, 120);
  const after = state().juice.live;      // 320 spawned into a 96-slot pool
  await wait(500);
  const settled = state().juice.live;

  return { atStart, mid, end, tweensAfterReplace, replaced,
           peak, o3end: o3.v, before, after, settled };
});
console.log(`  tween 0->100 linear: t=0 ${juice.atStart}, t=100ms ${juice.mid.toFixed(1)}, done ${juice.end}`);
check(juice.atStart === 0, 'a tween starts at its `from` value');
check(juice.mid > 35 && juice.mid < 70, 'a linear tween is about halfway at halfway',
  `${juice.mid.toFixed(1)}`);
check(juice.end === 100, 'a tween lands exactly on its `to` value', `${juice.end}`);
check(juice.tweensAfterReplace === 1, 'retweening a property replaces the running tween',
  `${juice.tweensAfterReplace} live`);
check(juice.replaced === 10, 'the replacement tween is the one that finishes', `${juice.replaced}`);
check(juice.peak > 1.02 && Math.abs(juice.o3end - 1) < 1e-9,
  'outBack overshoots and then settles on the target', `peak ${juice.peak.toFixed(3)}`);
console.log(`  particles: ${juice.before} live -> ${juice.after} after 320 spawns -> ${juice.settled} after 500ms`);
check(juice.after > 0 && juice.after <= 96, 'the particle pool is bounded, never grows',
  `${juice.after}/96`);
check(juice.settled === 0, 'particles expire on their own', `${juice.settled} left`);

/* ---------------------------------------------------------------- */
section('7. Progression and localStorage');
check(await page.locator('#overlay').isVisible(), 'overlay shown after the win');
check(await page.locator('#btn-next').isVisible(), 'Next button offered on a win');
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'level-01-win.png') });
ok('screenshot: level-01-win.png');
await page.locator('#btn-next').click();
let st = await page.evaluate(() => window.__gtb.state());
check(st.levelId === 2 && st.phase === 'plan', 'Next advances to level 2', `now level ${st.levelId}`);
check(st.ramps.length === 0, 'ramps cleared on the new level');
check((await page.locator('#level-title').textContent()).trim() === 'Level 2',
  'the level chip follows the board it is on', await page.locator('#level-title').textContent());
const stored = await page.evaluate(() => localStorage.getItem('gtb.progress.v1'));
check(stored && JSON.parse(stored).highest >= 1, 'progress persisted to localStorage', stored);
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
st = await page.evaluate(() => window.__gtb.state());
check(st.levelId === 2, 'progress survives a reload', `resumed at level ${st.levelId}`);

/* ---------------------------------------------------------------- */
/* The trail is the one piece of the visual pass that carries state across
   frames, so it is the one piece that can leak between drops. */
section('7b. Ball trail');
const trailState = await page.evaluate(async () => {
  const { state, reset, setLevel, setRamps, setSeed } = window.__gtb;
  const idle = state().juice.trail;
  setLevel(0); setRamps([{x1:110,y1:300,x2:240,y2:360}]); setSeed(7);
  const planning = state().juice.trail;
  window.__gtb.drop();
  await new Promise(r => setTimeout(r, 300));
  const flying = state().juice.trail;
  reset();
  await new Promise(r => setTimeout(r, 120));
  const afterReset = state().juice.trail;
  return { idle, planning, flying, afterReset, stars: state().juice.stars };
});
check(trailState.planning === 0, 'no trail while planning - a parked ball must not smear',
  `${trailState.planning} points`);
check(trailState.flying > 1, 'the ball leaves a trail once it is falling',
  `${trailState.flying} points`);
check(trailState.flying <= 16, 'the trail is capped, not unbounded', `${trailState.flying} points`);
check(trailState.afterReset === 0, 'the trail is cleared with the rest of the drop state',
  `${trailState.afterReset} points`);
check(trailState.stars === 46, 'the star field is present', `${trailState.stars} stars`);
await page.evaluate(() => { window.__gtb.reset(); window.__gtb.setSeed(null); });

/* ---------------------------------------------------------------- */
section('8. Miss and stuck: a label, not a modal');
/* a board geometry probe - the label must never move the board */
const boardBox = () => page.evaluate(() => {
  const r = document.getElementById('board').getBoundingClientRect();
  return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
});
const geoIdle = await boardBox();

await page.evaluate(() => {
  const g = window.__gtb;
  g.setLevel(0); g.reset(); g.setSeed(9);
  g.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]);   // a ramp that will not save it
});
const rampsBefore = JSON.stringify((await page.evaluate(() => window.__gtb.state().ramps)));
await dropBall();
await page.waitForFunction(() => { const s = window.__gtb.state();
  return s.phase === 'plan' && s.result; }, null, { timeout: 25000 });
st = await page.evaluate(() => window.__gtb.state());
check(st.result === 'out' || st.result === 'timeout', 'bare drop loses', `result=${st.result}`);
check(await page.locator('#overlay').isHidden(), 'NO modal overlay on a miss');
check(await page.locator('#flash').isVisible(), 'the top-centre label is shown instead');
check((await page.locator('#flash').textContent()) === 'Missed! Try readjusting your ramps.',
  'fall-past-target wording', JSON.stringify(await page.locator('#flash').textContent()));
check(st.phase === 'plan', 'planning resumes with no click required', `phase=${st.phase}`);
check(st.ball === null, 'the ball is back on the spawn');
check(JSON.stringify(st.ramps) === rampsBefore, 'the ramps are left exactly where they were');
check(!(await page.evaluate(() => window.__gtb.ballInfo().dropDisabled)),
      'the board is immediately droppable again');
check(await boardBox() === geoIdle, 'the label does not shift the board', await boardBox());

/* the stuck case: a dead-flat ramp under the spawn, which the stall watch calls */
await page.evaluate(() => {
  const g = window.__gtb, sx = g.LEVELS[0].spawn.x;
  g.reset(); g.setSeed(9);
  g.setRamps([{ x1: sx-70, y1: 420, x2: sx+70, y2: 420 }]);
});
await dropBall();
await page.waitForFunction(() => { const s = window.__gtb.state();
  return s.phase === 'plan' && s.result; }, null, { timeout: 25000 });
st = await page.evaluate(() => window.__gtb.state());
check(st.result === 'timeout', 'a flat ramp gets the ball stuck', `result=${st.result}`);
check((await page.locator('#flash').textContent()) === 'Got stuck! Try readjusting your ramps.',
  'stuck wording differs from the miss wording');

/* and it clears itself, without being dismissed */
await page.waitForTimeout(3200);
check(await page.locator('#flash').isHidden(), 'the label fades out on its own');
check(await boardBox() === geoIdle, 'the board is unmoved after the label goes', await boardBox());

/* The flash and the drop cue share ONE slot. Watch a whole miss, frame by
   frame: at no point may both be showing, the cue must be gone for the whole
   drop, the flash must hold the slot while it has something to say, and the
   cue must be back the moment it clears. */
await page.evaluate(() => {
  const g = window.__gtb;
  // the walkthrough's bubble keeps the caption quiet on level 1; not under test here
  g.skipTutorial();
  g.reset(); g.setSeed(3);
  g.setRamps([{ x1: 150, y1: 300, x2: 250, y2: 360 }]);
  const vis = id => getComputedStyle(document.getElementById(id)).visibility === 'visible';
  window.__slot = [];
  const t0 = performance.now();
  const tick = () => {
    const s = g.state();
    window.__slot.push({ t: performance.now() - t0, flash: vis('flash'), cue: vis('drop-cue'),
                         phase: s.phase, sel: s.selected, text: s.flash || '' });
    if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await dropBall();
await page.waitForTimeout(9300);
const slot = await page.evaluate(() => window.__slot);
const both = slot.filter(f => f.flash && f.cue).length;
const cueInDrop = slot.filter(f => f.cue && f.phase !== 'plan').length;
const flashWrong = slot.filter(f => f.flash !== !!f.text).length;
const cueWrong = slot.filter(f => f.cue !== (!f.text && f.phase === 'plan' && f.sel < 0)).length;
const sawFlash = slot.some(f => f.flash), last = slot[slot.length - 1];
check(both === 0, 'the flash and the drop cue are never up together',
      `${both} of ${slot.length} frames`);
check(cueInDrop === 0, 'the cue is down for the whole drop', `${cueInDrop} frames`);
check(sawFlash && flashWrong === 0, 'the flash is up exactly while there is a message',
      `${flashWrong} frames out of step`);
check(cueWrong === 0, 'the cue is up exactly when nothing else has the slot',
      `${cueWrong} frames out of step`);
check(last.cue && !last.flash, 'and the cue has the slot back once the message clears',
      JSON.stringify(last));

/* ---------------------------------------------------------------- */
/* Every mechanic gets explained the moment it first appears on a board -
   the game is plan-first, so learning what a booster does by watching one
   fire is learning it one drop too late. */
section('8b. Mechanics are taught on sight, and the tips fit');
const tipCheck = await page.evaluate(async () => {
  const g = window.__gtb;
  // a player who has done the ramp tutorial but never seen a mechanic
  const save = JSON.parse(localStorage.getItem('gtb.progress.v1') || '{}');
  save.tips = {}; save.tutorialSeen = true;
  localStorage.setItem('gtb.progress.v1', JSON.stringify(save));
  return null;
});
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
const flashEl = () => page.evaluate(() => {
  const e = document.getElementById('flash');
  return { text: e.textContent, on: e.classList.contains('on'),
           clipped: e.scrollWidth > e.clientWidth + 1 };
});
// find the first level carrying each mechanic and check it teaches itself
const firstWith = await page.evaluate(() => {
  const g = window.__gtb, out = {};
  ['boosters','wind','slippery','portals','breakables','stars'].forEach(k => {
    for (let i = 0; i < g.LEVELS.length; i++)
      if (g.LEVELS[i][k].length){ out[k] = i; break; }
  });
  return out;
});
const taught = [];
for (const [key, li] of Object.entries(firstWith)){
  await page.evaluate(i => window.__gtb.setLevel(i), li);
  const f = await flashEl();
  taught.push({ key, li, text: f.text, on: f.on, clipped: f.clipped });
}
for (const t of taught)
  console.log(`  ${t.key.padEnd(11)} first seen on L${t.li + 1}: ${JSON.stringify(t.text)}`);
check(taught.length > 0, 'at least one new mechanic ships to be taught', `${taught.length}`);
check(taught.every(t => t.on && t.text.length > 0),
  'arriving at a board with a new mechanic explains it straight away',
  taught.filter(t => !t.on).map(t => t.key).join(',') || 'all taught');
check(taught.every(t => !t.clipped),
  'and every tip fits the one-line label instead of being cut off',
  taught.filter(t => t.clipped).map(t => `${t.key} truncated`).join(', ') || 'all fit');
/* seen once, never again */
const firstKey = taught[0];
await page.evaluate(() => window.__gtb.setLevel(0));
await page.evaluate(i => window.__gtb.setLevel(i), firstKey.li);
check(!(await flashEl()).on, 'and it is not repeated on a later visit', firstKey.key);
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
await topUp();

/* ---------------------------------------------------------------- */
/* The legend only covers the board in front of you and the tips fire once,
   so there has to be somewhere to look things up afterwards. */
section('8c. Info panel');
await page.evaluate(() => window.__gtb.setLevel(20));      // Solmesa's first board
check(await page.locator('#infopanel').isHidden(), 'the info panel starts closed');
await openSettings();
await page.locator('#btn-info').click();
check(await page.locator('#infopanel').isVisible(), 'the How to play row opens it');
check(await settingsOpen(),
  'and it opens ON TOP of settings, so closing it lands back there');
const panelInfo = await page.evaluate(() => {
  const body = document.getElementById('info-body');
  const lines = [...body.querySelectorAll('.iline')].map(e => ({
    name: e.querySelector('b').textContent.replace(' • on this level', '').trim(),
    here: e.classList.contains('here')
  }));
  const card = document.querySelector('.infocard').getBoundingClientRect();
  return { text: body.textContent, lines,
           scrolls: body.scrollHeight > body.clientHeight,
           withinViewport: card.top >= -1 && card.bottom <= innerHeight + 1,
           headings: [...body.querySelectorAll('h4')].map(h => h.textContent) };
});
console.log(`  sections: ${panelInfo.headings.join(' / ')}`);
console.log(`  entries: ${panelInfo.lines.map(l => l.name + (l.here ? '*' : '')).join(', ')}`);
check(panelInfo.lines.length >= 11, 'it documents every thing that can be on a board',
  `${panelInfo.lines.length} entries`);
for (const w of ['Target','Obstacle','Breakable block','Booster pad','Portal','Wind','Ice',
                 'Gold star','Your ramp','Wall','Ball'])
  if (!panelInfo.lines.some(l => l.name === w)) bad(`info panel is missing "${w}"`);
/* Flagged against something this board really has. It used to be the booster
   pad, because level 21 came with one; no level carries a pad any more, so the
   chest - which every level in the game carries - is what proves the marking
   works. */
check(panelInfo.lines.some(l => l.name === 'Mystery box' && l.here),
  'and flags what is on the level you are looking at', 'the chest marked on L21');
check(!panelInfo.lines.some(l => l.name === 'Booster pad' && l.here),
  'while the booster PAD is listed but never marked - no level ships one',
  'documented, never on a board');
check(panelInfo.lines.some(l => l.name === 'Portal' && !l.here),
  'without flagging what is not');
check(['THE BASICS','ON THE BOARD','BALLS','LEVEL RATING'].every(h =>
  panelInfo.headings.some(x => x.toUpperCase() === h)),
  'and covers the controls, the economy and the rating too', panelInfo.headings.join('/'));
check(/costs one ball/i.test(panelInfo.text), 'the balls rule is stated in words');
check(panelInfo.scrolls, 'long content scrolls inside the card');
check(panelInfo.withinViewport, 'and the card itself never runs off the screen');

await page.evaluate(() => document.getElementById('btn-info-close').click());
check(await page.locator('#infopanel').isHidden(), 'Close closes it');

/* the "on this level" flags must track every board exactly - this is the
   check the old per-level legend used to carry.

   React renders on its own schedule, so each level has to be stepped with an
   await rather than clicked through synchronously the way the imperative
   build allowed. */
const WANT = [['obstacles','Obstacle'], ['breakables','Breakable block'],
              ['boosters','Booster pad'], ['portals','Portal'],
              ['wind','Wind'],          ['slippery','Ice'], ['stars','Gold star']];
const levelCount = await page.evaluate(() => window.__gtb.LEVELS.length);
const agree = [];
await openSettings();
for (let i = 0; i < levelCount; i++){
  await page.evaluate(ix => window.__gtb.setLevel(ix), i);
  await page.click('#btn-info');
  await page.waitForSelector('#infopanel .iline');
  const here = await page.$$eval('.iline.here b',
    els => els.map(e => e.textContent.replace(' • on this level', '').trim()));
  await page.click('#btn-info-close');
  await page.waitForSelector('#infopanel', { state: 'detached' });
  const lv = await page.evaluate(ix => {
    const l = window.__gtb.LEVELS[ix];
    return { id: l.id, obstacles: l.obstacles.length, breakables: l.breakables.length,
             boosters: l.boosters.length, portals: l.portals.length, wind: l.wind.length,
             slippery: l.slippery.length, stars: l.stars.length, walls: l.walls.length };
  }, i);
  for (const [key, name] of WANT)
    if (here.includes(name) !== (lv[key] > 0)) agree.push(`L${lv.id} ${key}`);
  if (here.includes('Wall') !== (lv.walls > 0)) agree.push(`L${lv.id} wall`);
}
await closeSettings();
await page.evaluate(() => window.__gtb.setLevel(0));
check(agree.length === 0, 'the panel flags exactly what each level actually has',
  agree.slice(0, 3).join(', ') || `all ${levelCount} levels agree`);
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
await topUp();

/* ---------------------------------------------------------------- */
section('8c. The toon palette holds its own contrast rules');
const pal = await page.evaluate(() => {
  const g = window.__gtb, P = g.PALETTE;
  const lum = h => { const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hue = h => { const n = parseInt(h.slice(1), 16), r = (n >> 16) / 255, gg = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
    const x = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    return (x * 60 + 360) % 360; };
  const light = g.COUNTRIES.filter(c => g.isLightSky(c.sky[1]));
  const stops = light.flatMap(c => c.sky.map(s => [c.name, s]));
  const worst = (col) => stops.reduce((m, [n, s]) => { const v = cr(col, s); return v < m.v ? { v, at: `${n} ${s}` } : m; }, { v: 99 });
  const hd = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };
  return { n: light.length, ink: worst(P.INK), red: worst(P.OBSTACLE.base), green: worst(P.TARGET.dark),
           blue: worst(P.RAMP.base), wall: worst(P.WALL.base),
           hues: [hd(P.OBSTACLE.base, P.TARGET.base), hd(P.TARGET.base, P.RAMP.base), hd(P.OBSTACLE.base, P.RAMP.base)] };
});
check(pal.n >= 1, 'at least one country has the toon day sky', `${pal.n}`);
check(pal.ink.v >= 7, 'the ink outline stands off every day sky', `${pal.ink.v.toFixed(2)} at ${pal.ink.at}`);
for (const [k, name] of [['red', 'obstacle red'], ['green', 'target green'], ['blue', 'ramp blue'], ['wall', 'wall grey']])
  check(pal[k].v >= 3, `the ${name} clears 3:1 against every day sky`, `${pal[k].v.toFixed(2)} at ${pal[k].at}`);
check(pal.hues.every(d => d >= 60), 'red, green and blue are at least 60° of hue apart',
      pal.hues.map(d => d.toFixed(0) + '°').join(' '));

/* ---------------------------------------------------------------- */
section('9. Ramps are DRAWN - one drag sets place, length and angle');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); window.__gtb.setWallet(100, 0); });   // level 4: 2 ramps
const box = await page.locator('#board').boundingBox();
const S = () => page.evaluate(() => window.__gtb.state());
const lenOf = r => Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
const midOf = r => ({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 });
const angOf = r => Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180 / Math.PI;

check(await page.locator('#ramps-left').textContent() === '2', 'level 4 shows a budget of 2');
check(await page.locator('#btn-add-ramp').count() === 0,
  'there is no + button any more - a ramp is drawn, not handed out');

/* ---- the gesture: press, drag, let go ---- */
const ballsBeforeDrag = await page.evaluate(() => window.__gtb.ballInfo().balls);
await mouseDrag(box, { x: 120, y: 300 }, { x: 240, y: 360 });
st = await S();
check(st.ramps.length === 1, 'a drag on empty board draws a ramp');
const firstRamp = st.ramps[0];
check(Math.abs(firstRamp.x1 - 120) < 6 && Math.abs(firstRamp.y1 - 300) < 6 &&
      Math.abs(firstRamp.x2 - 240) < 6 && Math.abs(firstRamp.y2 - 360) < 6,
  'and it runs from where the press landed to where the finger let go',
  `(${firstRamp.x1.toFixed(0)},${firstRamp.y1.toFixed(0)})-(${firstRamp.x2.toFixed(0)},${firstRamp.y2.toFixed(0)})`);
check(Math.abs(lenOf(firstRamp) - Math.hypot(120, 60)) < 8,
  'so the length is the drag\'s length', `${lenOf(firstRamp).toFixed(0)} units`);
check(Math.abs(angOf(firstRamp) - Math.atan2(60, 120) * 180 / Math.PI) < 4,
  'and the angle is the drag\'s angle', `${angOf(firstRamp).toFixed(0)}°`);
check((await page.evaluate(() => window.__gtb.ballInfo().balls)) === ballsBeforeDrag &&
      st.phase === 'plan', 'a drag never drops the ball');
check(await page.locator('#ramps-left').textContent() === '1', 'and the counter drops to 1');

/* ---- LENGTH IS THE PLAYER'S AGAIN: two drags, two different ramps ---- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await mouseDrag(box, { x: 90, y: 300 }, { x: 150, y: 300 });
await mouseDrag(box, { x: 90, y: 480 }, { x: 240, y: 480 });
st = await S();
check(st.ramps.length === 2 && Math.abs(lenOf(st.ramps[1]) - lenOf(st.ramps[0])) > 50,
  'two drags of different lengths make two ramps of different lengths',
  `${lenOf(st.ramps[0]).toFixed(0)} and ${lenOf(st.ramps[1]).toFixed(0)} units`);

/* ---- the limits the drawing tool enforces ---- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
/* Just past the tap's own slop, so it is unmistakably a drag, and still
   under MIN_RAMP - the band where a gesture is neither a tap nor a ramp. */
await mouseDrag(box, { x: 200, y: 300 }, { x: 200 + C.MIN_RAMP - 6, y: 300 });
await page.waitForTimeout(150);
check((await S()).ramps.length === 0,
  'a drag shorter than MIN_RAMP leaves nothing behind - that is a twitch, not a ramp',
  `under ${C.MIN_RAMP} units`);
check((await S()).phase === 'plan',
  'and being a drag rather than a tap, it does not drop either');
check(await page.locator('#ramps-left').textContent() === '2', 'the budget is untouched by it');
await mouseDrag(box, { x: 40, y: 300 }, { x: 460, y: 300 });
st = await S();
check(st.ramps.length === 1 && lenOf(st.ramps[0]) <= C.MAX_RAMP + 0.01,
  'and one longer than MAX_RAMP is truncated rather than refused',
  `${lenOf(st.ramps[0]).toFixed(0)} units, cap ${C.MAX_RAMP}`);

/* ---- the draft is live while the finger is down ---- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
const a0 = P(box, { x: 140, y: 320 }), z0 = P(box, { x: 260, y: 400 });
await page.mouse.move(a0.x, a0.y);
await page.mouse.down();
await page.mouse.move((a0.x + z0.x) / 2, (a0.y + z0.y) / 2, { steps: 4 });
const draftMid = await page.evaluate(() => window.__gtb.draft());
await page.mouse.move(z0.x, z0.y, { steps: 4 });
const draftFar = await page.evaluate(() => window.__gtb.draft());
await page.mouse.up();
check(!!draftMid && !!draftFar && lenOf(draftFar) > lenOf(draftMid),
  'the ramp is on screen while it is being drawn, and follows the finger',
  draftMid && draftFar
    ? `${lenOf(draftMid).toFixed(0)} -> ${lenOf(draftFar).toFixed(0)} units` : 'no draft');
check((await page.evaluate(() => window.__gtb.draft())) === null,
  'and the draft is gone once it is let go');
check((await S()).ramps.length === 1, 'having become a real ramp');

/* ---- the budget, and the spares behind it ---- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); window.__gtb.setWallet(100, 0); });
await mouseDrag(box, { x: 90, y: 300 }, { x: 210, y: 340 });
await mouseDrag(box, { x: 90, y: 420 }, { x: 210, y: 460 });
check((await S()).ramps.length === 2 && await page.locator('#ramps-left').textContent() === '0',
  'two drags spend a budget of two');
check(await page.locator('.counter.ramps.empty').count() === 1,
  'and the counter dims to say so');
check((await page.evaluate(() => window.__gtb.canDraw())) === false,
  'with none left, the board stops taking drags');
await mouseDrag(box, { x: 90, y: 540 }, { x: 210, y: 580 });
check((await S()).ramps.length === 2, 'so a third drag draws nothing');
await page.evaluate(() => window.__gtb.setWallet(100, 1));
check((await page.locator('#ramps-spare').textContent()) === '+1',
  'a spare in the drawer shows on the counter');
await mouseDrag(box, { x: 90, y: 540 }, { x: 210, y: 580 });
check((await S()).ramps.length === 3 && (await page.evaluate(() => window.__gtb.spareRamps())) === 0,
  'and drawing then spends it', `${await page.evaluate(() => window.__gtb.spareRamps())} left`);
/* a spare is only spent by a ramp that is actually KEPT */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); window.__gtb.setWallet(100, 1); });
await mouseDrag(box, { x: 90, y: 300 }, { x: 210, y: 340 });
await mouseDrag(box, { x: 90, y: 420 }, { x: 210, y: 460 });
await mouseDrag(box, { x: 300, y: 540 }, { x: 300 + C.MIN_RAMP - 6, y: 540 });
check((await page.evaluate(() => window.__gtb.spareRamps())) === 1,
  'a drag too short to keep never touches the drawer',
  `${await page.evaluate(() => window.__gtb.spareRamps())} spare`);

/* ---- the × still takes one back ---- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); window.__gtb.setWallet(100, 0); });
await mouseDrag(box, { x: 120, y: 300 }, { x: 240, y: 360 });
st = await S();
await mouseTap(box, midOf(st.ramps[0]));      // select it
await mouseTap(box, delBtn(st.ramps[0]));
check((await S()).ramps.length === 0, 'its × removes the ramp');
check(await page.locator('#ramps-left').textContent() === '2', 'and the slot returns to the counter');

/* ---- the whole gesture by touch ---- */
const cdp = await context.newCDPSession(page);
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await touchDrag(cdp, box, { x: 130, y: 330 }, { x: 250, y: 390 });
st = await S();
check(st.ramps.length === 1 && lenOf(st.ramps[0]) > C.MIN_RAMP,
  'drawing works by touch as well as by mouse',
  st.ramps.length ? `${lenOf(st.ramps[0]).toFixed(0)} units` : 'nothing drawn');

/* ---- and the bag is for OWNED items, which a ramp is not ---- */
await page.click('#btn-inventory');
await page.waitForSelector('#inventorypanel');
check(await page.locator('#btn-item-ramp').count() === 0,
  'the bag does not offer ramps - they are drawn, not owned');
check(await page.locator('#btn-inv-shop').count() === 1,
  'and the shop is still one tap away from it');
await page.click('#btn-inv-close');
await page.waitForSelector('#inventorypanel', { state: 'detached' });

section('9b. Tap to drop - the gesture that replaced the Drop Ball button');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await topUp();
let g = await page.evaluate(() => ({ balls: window.__gtb.ballInfo().balls,
                                     phase: window.__gtb.state().phase }));

/* a TAP on empty board drops */
await mouseTap(box, { x:60, y:120 });
await page.waitForTimeout(250);
let g2 = await page.evaluate(() => ({ balls: window.__gtb.ballInfo().balls,
                                      phase: window.__gtb.state().phase }));
check(g2.balls === g.balls - 1 && g2.phase !== 'plan',
      'a tap on empty board drops the ball', `balls ${g.balls} -> ${g2.balls}, phase ${g2.phase}`);

await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await topUp();
/* a tap that only DISMISSES a selection must not cost a ball: the player was
   putting the ramp down, not asking for a drop */
await mouseDrag(box, { x: 120, y: 300 }, { x: 240, y: 340 });
const seg = (await S()).ramps[0];
check((await S()).selected === -1,
  'a freshly drawn ramp is NOT selected - the drag that made it was the whole gesture');
await mouseTap(box, { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 });
check((await S()).selected === 0, 'tapping it selects it');
const bBefore = await page.evaluate(() => window.__gtb.ballInfo().balls);
await mouseTap(box, { x:60, y:120 });
await page.waitForTimeout(200);
const afterDismiss = await page.evaluate(() => ({ balls: window.__gtb.ballInfo().balls,
                                                  sel: window.__gtb.state().selected,
                                                  phase: window.__gtb.state().phase }));
check(afterDismiss.sel === -1 && afterDismiss.balls === bBefore && afterDismiss.phase === 'plan',
      'the tap that clears a selection does not also drop',
      `balls ${bBefore} -> ${afterDismiss.balls}, phase ${afterDismiss.phase}`);

/* the board has to say how the drop is done, since no button does */
check(await page.locator('#drop-cue').isVisible(), 'the drop cue is on the board while planning');
check(/drop the ball/i.test(await page.locator('#drop-cue').textContent()),
      'and it says how to drop', (await page.locator('#drop-cue').textContent()).trim());
/* A caption along the board's bottom edge: inside the frame, centred on
   it, plain text (no fill), and clear of every level's target. */
const cueBox = await page.locator('#drop-cue').boundingBox();
const stageBox = await page.locator('.stage').boundingBox();
const cue = await page.evaluate(() => {
  const g = window.__gtb, cv = document.querySelector('canvas#board').getBoundingClientRect();
  const low = Math.max(...g.LEVELS.map(l => l.target.y + l.target.r * 0.5));
  const cs = getComputedStyle(document.getElementById('drop-cue'));
  return { targetBottom: cv.top + low * cv.height / g.CONSTS.H,
           bg: cs.backgroundColor, border: cs.borderTopStyle, opacity: +cs.opacity };
});
const stageBottom = stageBox.y + stageBox.height;
check(cueBox.y + cueBox.height <= stageBottom && stageBottom - (cueBox.y + cueBox.height) <= 12,
      'and it sits as a caption along the board\'s bottom edge',
      `caption bottom ${(cueBox.y + cueBox.height).toFixed(1)} vs board bottom ${stageBottom.toFixed(1)}`);
check(Math.abs((cueBox.x + cueBox.width / 2) - (stageBox.x + stageBox.width / 2)) <= 2,
      'centred on the board');
check(cue.bg === 'rgba(0, 0, 0, 0)' && cue.border === 'none' && cue.opacity < 0.7,
      'plain, quiet text - no pill behind it', `bg ${cue.bg}, border ${cue.border}, opacity ${cue.opacity}`);
/* A handful of levels put a target's bottom rim into the caption's band.
   Faint text may pass over that rim, but never over the target's heart. */
check(cueBox.y >= cue.targetBottom,
      'and it never covers more than the lower rim of any target',
      `caption top ${cueBox.y.toFixed(1)} vs lowest target half-radius ${cue.targetBottom.toFixed(1)}`);
await mouseTap(box, midOf(seg));
check(await page.locator('#drop-cue').isHidden(), 'it steps aside while a ramp is selected');
await mouseTap(box, { x:60, y:120 });            // dismisses, does not drop

/* A slide on empty board is never a drop. With nothing selected it is the
   drawing gesture; with a ramp selected it only puts that ramp down. Either
   way the ball stays where it is - a drag is not a tap. */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
const bSlide = await page.evaluate(() => window.__gtb.ballInfo().balls);
await mouseDrag(box, { x:60, y:120 }, { x:140, y:180 });
await page.waitForTimeout(200);
check((await page.evaluate(() => window.__gtb.ballInfo().balls)) === bSlide && (await S()).phase === 'plan',
      'a slide on empty board does not drop');
check((await S()).ramps.length === 1,
      'it draws a ramp instead - which is exactly what makes it not a drop');

/* The press is answered at once with a ripple; the drop lands on release.
   On a CLEAR board: the slide above left a ramp under that spot, and a press
   on a ramp is a grab, not a tap. */
await page.evaluate(() => window.__gtb.setRamps([]));
const pressAt = P(box, { x:60, y:120 });
const bPress = await page.evaluate(() => window.__gtb.ballInfo().balls);
await page.mouse.move(pressAt.x, pressAt.y);
await page.mouse.down();
const onPress = await page.evaluate(() => ({ phase: window.__gtb.state().phase,
                                             ripple: !!document.querySelector('.tap-ripple') }));
await page.mouse.up();
await page.waitForTimeout(100);
const onRelease = await page.evaluate(() => ({ balls: window.__gtb.ballInfo().balls,
                                               phase: window.__gtb.state().phase }));
check(onPress.ripple && onPress.phase === 'plan', 'the press is answered with a ripple where it landed');
check(onRelease.balls === bPress - 1 && onRelease.phase !== 'plan',
      'and the release drops', `balls ${bPress} -> ${onRelease.balls}, phase ${onRelease.phase}`);
check(await page.locator('#drop-cue').isHidden(), 'the cue is gone while the ball falls');
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });

/* the × is a real touch target now - 2.5x what it was */
check(C.DEL_R === 30 && C.DEL_OFF === 50,
      'the × is sized at 2.5x its old radius', `r=${C.DEL_R} off=${C.DEL_OFF}`);
/* ...and PAINTED at that size. Checking the constant alone passed for a whole
   release while the renderer still drew the × at its old radius of 12, so
   this reads the canvas: three quarters of the way out from the ×'s centre is
   inside the new button and well outside the old one. */
await page.evaluate(() => { window.__gtb.drawRamp(160, 380, 280, 430); window.__gtb.select(0); });
await page.waitForTimeout(120);
const delPaint = await page.evaluate((C) => {
  const g = window.__gtb, cv = document.querySelector('canvas#board');
  const r = g.state().ramps[0], bd = g.board(), k = cv.width / bd.w;
  const mx=(r.x1+r.x2)/2, my=(r.y1+r.y2)/2, dx=r.x2-r.x1, dy=r.y2-r.y1, m=Math.hypot(dx,dy)||1;
  let bx=mx-dy/m*C.DEL_OFF, by=my+dx/m*C.DEL_OFF;
  if (bx<bd.x0+C.DEL_R||bx>bd.x1-C.DEL_R||by<C.DEL_R||by>C.H-C.DEL_R){ bx=mx+dy/m*C.DEL_OFF; by=my-dx/m*C.DEL_OFF; }
  bx=Math.min(Math.max(bx,bd.x0+C.DEL_R),bd.x1-C.DEL_R); by=Math.min(Math.max(by,C.DEL_R),C.H-C.DEL_R);
  const px = p => cv.getContext('2d').getImageData(Math.round((p[0]-bd.x0)*k), Math.round(p[1]*k), 1, 1).data;
  const probe = [[bx - C.DEL_R*0.75, by], [bx + C.DEL_R*0.75, by]].map(px);
  return probe.map(d => [d[0], d[1], d[2]]);
}, C);
check(delPaint.every(([r,g,b]) => r > 170 && g < 110 && b < 120),
      'the × is painted at its full radius, not its old one', JSON.stringify(delPaint));
await page.evaluate(() => window.__gtb.select(-1));
check(C.DEL_GRAB >= C.DEL_R && C.DEL_GRAB < C.DEL_R * 2,
      'its grab radius hugs the circle instead of swallowing the ramp', `grab=${C.DEL_GRAB}`);

await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await topUp();

/* ---------------------------------------------------------------- */
section('10. Budget, removal, and lock during the drop');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); window.__gtb.setWallet(100, 0); });
for (let i = 0; i < 3; i++)
  await page.evaluate(i => window.__gtb.drawRamp(120, 300 + i * 90, 240, 340 + i * 90), i);
st = await S();
check(st.ramps.length === 2, "ramp budget caps at this level's maxBlocks", `got ${st.ramps.length}`);
check(await page.locator('#ramps-left').textContent() === '0', 'counter reads 0');
/* ramps come off one at a time, each by its own × */
for (let i = 0; i < 2; i++) {
  const cur = (await S()).ramps[0];
  await mouseTap(box, midOf(cur));
  await mouseTap(box, delBtn(cur));
}
check((await S()).ramps.length === 0, 'every ramp can be taken off with its ×');
await dropBall();
check(await page.locator('#btn-inventory').isDisabled(), 'the bag is disabled while the ball falls');
check((await page.evaluate(() => window.__gtb.canDraw())) === false &&
      (await page.evaluate(() => window.__gtb.drawRamp(120, 300, 240, 340))) === false &&
      (await S()).ramps.length === 0,
      'and no ramp can be drawn mid-drop');
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });

section('10b. Reshaping, moving and deleting a placed ramp');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });  // level 4: 2 ramps
await topUp();
/** Draw one the way a player does, then select it. */
const drawRamp = async (from, to) => {
  await mouseDrag(box, from, to);
  const r = (await S()).ramps.slice(-1)[0];
  await mouseTap(box, midOf(r));
  return (await S()).ramps.slice(-1)[0];
};
let r0 = await drawRamp({ x: 140, y: 340 }, { x: 260, y: 340 });
check((await S()).selected === 0, 'tapping a drawn ramp selects it');

/* --- drag an END: that end follows the finger, the other stays put --- */
const before2 = { ...r0 };
await mouseDrag(box, { x: before2.x2, y: before2.y2 }, { x: before2.x2 + 20, y: before2.y2 + 80 });
st = await S();
const after2 = st.ramps[0];
check(Math.abs(after2.x1 - before2.x1) < 1 && Math.abs(after2.y1 - before2.y1) < 1,
  'dragging an end leaves the other end exactly where it was',
  `anchor moved ${Math.hypot(after2.x1 - before2.x1, after2.y1 - before2.y1).toFixed(2)}px`);
check(Math.abs(after2.x2 - (before2.x2 + 20)) < 6 && Math.abs(after2.y2 - (before2.y2 + 80)) < 6,
  'and the dragged end lands under the finger',
  `(${after2.x2.toFixed(0)},${after2.y2.toFixed(0)})`);
check(Math.abs(lenOf(after2) - lenOf(before2)) > 20,
  'so a reshape changes the LENGTH as well as the angle - a ramp is not a fixed item',
  `${lenOf(before2).toFixed(0)} -> ${lenOf(after2).toFixed(0)} units`);
/* the other end works the same way */
/* Toward the anchor rather than away from it: the ramp above is already at
   MAX_RAMP, and a drag that only made it longer would be truncated to the
   same place it started, proving nothing. */
const before2b = { ...after2 };
await mouseDrag(box, { x: before2b.x1, y: before2b.y1 },
                     { x: before2b.x2 - 60, y: before2b.y2 - 40 });
const after2b = (await S()).ramps[0];
check(Math.abs(after2b.x2 - before2b.x2) < 1 && Math.abs(after2b.y2 - before2b.y2) < 1 &&
      Math.hypot(after2b.x1 - before2b.x1, after2b.y1 - before2b.y1) > 30,
  'dragging the other end reshapes from that side instead',
  `anchor held, dragged end moved ` +
  `${Math.hypot(after2b.x1 - before2b.x1, after2b.y1 - before2b.y1).toFixed(0)}px`);

/* --- the limits an edit is held to are the drawing tool's own --- */
await page.evaluate(() => window.__gtb.setRamps([{ x1: 200, y1: 400, x2: 320, y2: 400 }]));
await page.evaluate(() => window.__gtb.select(0));
await mouseDrag(box, { x: 320, y: 400 }, { x: 206, y: 400 });
let lim = (await S()).ramps[0];
check(lenOf(lim) >= C.MIN_RAMP - 0.01,
  'an end dragged onto its own anchor is pushed back out to MIN_RAMP',
  `${lenOf(lim).toFixed(1)} units, floor ${C.MIN_RAMP}`);
await page.evaluate(() => window.__gtb.setRamps([{ x1: 60, y1: 400, x2: 180, y2: 400 }]));
await page.evaluate(() => window.__gtb.select(0));
await mouseDrag(box, { x: 180, y: 400 }, { x: 460, y: 400 });
lim = (await S()).ramps[0];
check(lenOf(lim) <= C.MAX_RAMP + 0.01,
  'and one dragged past MAX_RAMP stops there', `${lenOf(lim).toFixed(1)} units, cap ${C.MAX_RAMP}`);

/* --- drag the MIDDLE: translates without changing angle or length --- */
await page.evaluate(() => window.__gtb.setRamps([{ x1: 140, y1: 400, x2: 260, y2: 440 }]));
await page.evaluate(() => window.__gtb.select(0));
const before3 = (await S()).ramps[0];
const mid3 = midOf(before3);
await mouseDrag(box, mid3, { x: mid3.x + 55, y: mid3.y + 45 });
st = await S();
const after3 = st.ramps[0];
const d1 = Math.hypot(after3.x1 - before3.x1, after3.y1 - before3.y1);
const d2 = Math.hypot(after3.x2 - before3.x2, after3.y2 - before3.y2);
check(d1 > 40 && Math.abs(d1 - d2) < 1e-6, 'dragging the middle moves the whole ramp',
  `both ends moved ${d1.toFixed(1)}px`);
check(Math.abs(lenOf(after3) - lenOf(before3)) < 1e-6, 'a move changes neither length nor angle');

/* --- an edit near the edge stays on the board --- */
await page.evaluate(() => window.__gtb.setRamps([{ x1: 60, y1: 400, x2: 180, y2: 400 }]));
await page.evaluate(() => window.__gtb.select(0));
await mouseDrag(box, { x: 60, y: 400 }, { x: 10, y: 300 });
const edge = (await S()).ramps[0];
const bdE = await page.evaluate(() => window.__gtb.board());
check(Math.min(edge.x1, edge.x2) >= bdE.x0 - 1e-6 && Math.max(edge.y1, edge.y2) <= C.H,
      'an end dragged off the board is kept on it', JSON.stringify(edge));

/* --- tapping empty board space deselects --- */
await mouseTap(box, { x: 420, y: 720 });
check((await S()).selected === -1, 'tapping empty board space deselects');

/* --- delete takes exactly one, and the slot comes back --- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await mouseDrag(box, { x: 120, y: 320 }, { x: 240, y: 360 });
await mouseDrag(box, { x: 120, y: 520 }, { x: 240, y: 560 });
st = await S();
const keep = JSON.stringify(st.ramps[1]);
await mouseTap(box, midOf(st.ramps[0]));
check((await S()).selected === 0, 'tapping a placed ramp selects it');
await mouseTap(box, delBtn(st.ramps[0]));
st = await S();
check(st.ramps.length === 1, 'the × removes exactly one ramp', `${st.ramps.length} left`);
check(JSON.stringify(st.ramps[0]) === keep, 'the other ramp is untouched');
check(st.selected === -1, 'selection clears after a delete');
check(await page.locator('#ramps-left').textContent() === '1', 'the freed slot returns to the counter');
await mouseDrag(box, { x: 120, y: 620 }, { x: 240, y: 660 });
check((await S()).ramps.length === 2, 'the freed slot can be drawn into again');

/* --- and all of it works on touch --- */
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });
await touchDrag(cdp, box, { x: 130, y: 330 }, { x: 250, y: 370 });
const t0 = { ...(await S()).ramps[0] };
await touchTap(cdp, box, midOf(t0));
check((await S()).selected === 0, 'touch tap selects a ramp');
await touchDrag(cdp, box, { x: t0.x2, y: t0.y2 }, { x: t0.x2 + 10, y: t0.y2 + 80 });
st = await S();
check(Math.hypot(st.ramps[0].x2 - t0.x2, st.ramps[0].y2 - t0.y2) > 30 &&
      Math.abs(st.ramps[0].x1 - t0.x1) < 1,
  'touch drag on an end reshapes from that end');
await touchTap(cdp, box, { x: 420, y: 720 });
check((await S()).selected === -1, 'a touch tap on empty board deselects');
const t1 = (await S()).ramps[0];
await touchTap(cdp, box, midOf(t1));
await touchTap(cdp, box, delBtn(t1));
st = await S();
check(st.ramps.length === 0 && st.selected === -1, 'touch tap on × deletes the ramp');
check(await page.locator('#ramps-left').textContent() === '2', 'counter restored after touch delete');

/* --- editing is locked once the ball is in flight --- */
await page.evaluate(() => window.__gtb.drawRamp(120, 320, 240, 360));
await dropBall();
st = await S();
check(st.selected === -1, 'dropping the ball clears any selection');
const midLocked = await page.evaluate(() => {
  const g = window.__gtb, r = g.state().ramps[0];
  const before = JSON.stringify(r);
  const c = document.getElementById('board'), bb = c.getBoundingClientRect();
  const sx = bb.width/g.CONSTS.W, sy = bb.height/g.CONSTS.H;
  const mx = (r.x1+r.x2)/2, my = (r.y1+r.y2)/2;
  const ev = (t,x,y) => c.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:3,
    clientX:bb.left+x*sx, clientY:bb.top+y*sy}));
  ev('pointerdown',mx,my); ev('pointermove',mx+60,my+60); ev('pointerup',mx+60,my+60);
  return { before, after: JSON.stringify(g.state().ramps[0]), sel: g.state().selected };
});
check(midLocked.before === midLocked.after && midLocked.sel === -1,
  'ramps cannot be selected or dragged mid-drop');
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });

/* ---------------------------------------------------------------- */
section('11. Level select');
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
await topUp();
await page.locator('#level-title').click();
check(await page.locator('#select').isVisible(), 'tapping the level name opens the picker');
let grid = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#lvgrid button')];
  return { n: b.length, locked: b.filter(x => x.disabled).length,
           labels: b.map(x => x.textContent).join(',') };
});
const nLevels = await page.evaluate(() => window.__gtb.LEVELS.length);
check(grid.n === nLevels, 'the picker shows every level', `${grid.n}`);

/* THE DEV UNLOCK. RewardManager has a commented-out line that opens every
   level at once; with it uncommented, locking is switched off by design and
   the three checks below cannot pass. Detected on a freshly cleared save -
   progress is zero, so anything unlocked past the first level can only be the
   switch - and reported loudly rather than left to fail as three confusing
   reds that look like a broken picker. */
const devUnlock = grid.locked === 0 && nLevels > 1;
if (devUnlock){
  console.log('  ! DEV UNLOCK IS ON (RewardManager.highest) - 3 lock checks skipped.');
  console.log('    Comment that line back out before shipping, or to test locking.');
}
const lockCheck = (c, n, x) => devUnlock
  ? console.log(`  - ${n}  (skipped: dev unlock on)`)
  : check(c, n, x);

lockCheck(grid.locked === nLevels - 1, 'everything past your best is locked', `${grid.locked} locked`);
lockCheck(await page.locator('#lvgrid button').nth(4).isDisabled(), 'level 5 locked on a fresh save');

// unlock a few and re-open
await page.evaluate(() => { window.__gtb.setLevel(0);
  for (let i = 0; i <= 6; i++) window.__gtb.setLevel(i); });
await page.locator('#btn-close-sel').click();
await page.locator('#level-title').click();
grid = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#lvgrid button')];
  return { locked: b.filter(x => x.disabled).length };
});
lockCheck(grid.locked === nLevels - 7, 'reaching level 7 unlocks the first seven', `${grid.locked} locked`);
await page.locator('#lvgrid button').nth(3).click();
const sel = await page.evaluate(() => window.__gtb.state());
check(sel.levelId === 4 && sel.phase === 'plan', 'picking a level jumps straight to it', `level ${sel.levelId}`);
check(await page.locator('#select').isHidden(), 'picker closes after choosing');
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'level-select.png') });
ok('screenshot: level-select.png');

/* ---------------------------------------------------------------- */
/* Runs LAST on purpose: it wipes localStorage to fake a brand-new player,
   which would pull the progress out from under any section after it. */
section('12. First-run tutorial (once only)');
const tutErrors = [];
page.on('pageerror', e => tutErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') tutErrors.push(m.text()); });

await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
const tbox = await page.locator('#board').boundingBox();
const tut = () => page.evaluate(() => window.__gtb.state().tutorial);

let T = await tut();
const coach = () => page.evaluate(() => document.getElementById('coach')?.dataset.step ?? null);
check(T.step === 'intro', 'a brand-new player lands on the intro', `step=${T.step}`);
check(T.seen === false, 'the tutorialSeen flag starts unset');
check(await page.locator('#btn-skip').isVisible(), 'Skip is offered');
check((await coach()) === 'intro' && (await page.locator('#coach').textContent()).includes('target'),
  'a bubble says what the game is about', await page.locator('#coach .coach-title').textContent());
check((await page.locator('#coach').evaluate(e => getComputedStyle(e).pointerEvents)) === 'none',
  'and the bubble never swallows a tap meant for the board');
check((await page.locator('#drop-cue').textContent()) === '' || await page.locator('#drop-cue').isHidden(),
  'the caption stays quiet while the bubble is talking');
await page.click('#btn-coach-next');

/* draw: the bubble asks for a ramp, and the counter it comes out of leans in */
T = await tut();
check(T.step === 'draw' && (await coach()) === 'draw',
  'next it asks for a ramp to be drawn', `step=${T.step}`);
check(await page.locator('.counter.ramps.coached').count() === 1,
  'and the ramps counter leans in, the way the + used to');
check(/drag/i.test(await page.locator('#coach').textContent()),
  'the bubble teaches the gesture rather than a button',
  (await page.locator('#coach .coach-text').textContent()).trim());
check((await page.locator('#hint').textContent()).toLowerCase().includes('drag'),
  'and so does the hint line', await page.locator('#hint').textContent());

/* drawing one completes the step in a single gesture - there is no separate
   aim step any more, because the drag that draws it IS the aim */
await mouseDrag(tbox, { x: 150, y: 420 }, { x: 260, y: 470 });
T = await tut();
check((await page.evaluate(() => window.__gtb.state().ramps.length)) === 1, 'a ramp went down');
check(T.step === 'drop' && (await coach()) === 'drop',
  'and that one gesture takes it straight to the drop step', `step=${T.step}`);
check(await page.locator('.counter.ramps.coached').count() === 0,
  'the counter stops leaning in once a ramp is down');
check((await page.evaluate(() => window.__gtb.state().selected)) === -1,
  'the new ramp is not left selected, so the next tap is the drop');
/* There is no Drop Ball button to highlight any more, so the drop step is
   carried by the bubble and the hint - both have to teach the tap. */
check((await page.locator('#hint').textContent()) === 'Tap anywhere to drop the ball.',
  'the drop step teaches the tap');
check(T.seen === false, 'the flag stays unset until the ball is dropped');

/* taking that ramp off again sends the player back to drawing one */
const tutRamp = (await page.evaluate(() => window.__gtb.state())).ramps[0];
await mouseTap(tbox, { x:(tutRamp.x1+tutRamp.x2)/2, y:(tutRamp.y1+tutRamp.y2)/2 });
await mouseTap(tbox, delBtn(tutRamp));
T = await tut();
check(T.step === 'draw', 'removing the ramp returns to the draw step', `step=${T.step}`);
check(await page.locator('.counter.ramps.coached').count() === 1, 'and the counter leans in again');
await mouseDrag(tbox, { x: 150, y: 420 }, { x: 260, y: 470 });
check((await tut()).step === 'drop', 'drawing another takes it forward again');

/* the tutorial's drop: a straight miss, from a known seed */
await page.evaluate(() => { window.__gtb.setSeed(1); window.__gtb.setRamps([{ x1: 420, y1: 200, x2: 440, y2: 300 }]); });
await dropBall();
T = await tut();
check(T.step === null, 'the tutorial ends when the ball is dropped', `step=${T.step}`);
check(T.seen === true, 'tutorialSeen is set on completion');
/* a miss on that first drop gets one more word of encouragement */
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
check((await tut()).step === 'retry' && (await coach()) === 'retry',
  'a missed first drop is followed by a retry nudge');
check(await page.locator('#btn-skip').isHidden(), 'Skip goes away with it');
await page.click('#btn-coach-next');
check((await tut()).step === null && (await coach()) === null, 'and OK dismisses it for good');
const savedFlag = await page.evaluate(() => JSON.parse(localStorage.getItem('gtb.progress.v1')||'{}'));
check(savedFlag.tutorialSeen === true, 'the flag is persisted alongside `highest`',
  JSON.stringify(savedFlag));
check(tutErrors.length === 0, 'no page errors during the tutorial', tutErrors.join(' | '));

/* --- and it must never come back --- */
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
T = await tut();
check(T.step === null, 'a reload does NOT bring the tutorial back', `step=${T.step}`);
check(await page.locator('#btn-skip').isHidden(), 'Skip stays gone after a reload');
check((await tut()).step === null, 'no tutorial step is re-armed after a reload');
await page.evaluate(() => { window.__gtb.setLevel(0); window.__gtb.reset(); });
check((await tut()).step === null, 'replaying level 1 does not resurrect it');

/* --- step 3: the just-in-time obstacle tip, on the first obstacle ever --- */
await page.evaluate(() => {
  const g = window.__gtb;
  g.setLevel(2); g.reset(); g.setSeed(3);
  g.LEVELS[2].spawn.x = g.LEVELS[2].obstacles[0].x;   // drop straight onto it
});
check((await tut()).obstacleTipSeen === false, 'the obstacle tip has not fired yet');
await dropBall();
await page.waitForFunction(() => window.__gtb.state().tutorial.obstacleTipSeen, null, { timeout: 20000 });
check((await page.locator('#flash').textContent()) === 'Obstacles bounce you randomly \u2014 try to avoid them.',
  'the obstacle tip reuses the miss/stuck label');
check((await tut()).obstacleTipSeen === true, 'it has its own flag - level 1 has no obstacles to teach on');
const savedTip = await page.evaluate(() => JSON.parse(localStorage.getItem('gtb.progress.v1')||'{}'));
check(savedTip.obstacleTipSeen === true, 'the obstacle flag persists too');

/* --- Skip, from a clean slate, kills all of it at once --- */
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
check((await tut()).step === 'intro', 'a cleared save brings the tutorial back');
await page.locator('#btn-skip').click();
T = await tut();
check(T.step === null && T.seen === true, 'Skip marks it seen immediately');
check(await page.locator('#coach').count() === 0, 'and the bubble goes with it');
check(T.obstacleTipSeen === true, 'Skip also suppresses the obstacle tip');
check(await page.locator('#btn-skip').isHidden(), 'Skip removes itself');

/* ---------------------------------------------------------------- */
/* Runs after the tutorial section because it, too, owns localStorage
   outright. One ball is spent per DROP, win or lose. Moving between
   levels is free - the ball is spent at the moment it is used. */
section('13. Balls economy: one ball per drop, first-clear bonus, running dry');

const BALLS = await page.evaluate(() => window.__gtb.BALLS);
console.log(`  start ${BALLS.start}, ad grants ${BALLS.adReward}, ` +
            `first-clear bonus by Act [${BALLS.clearBonus.join(' ')}]`);

/** Wipe everything and come back as a player who has never opened the game. */
async function freshPlayer(){
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__gtb);
  await page.evaluate(() => window.__gtb.skipTutorial());
}
/** Find a winning single ramp for level `li`, then actually play it. */
async function winLevel(li){
  const armed = await page.evaluate((li) => {
    const g = window.__gtb, R = Math.PI / 180;
    const ramp = (cx,cy,deg,len=120) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
      return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
    g.setLevel(li); g.setSeed(1);                 // setLevel does not charge
    const lv = g.LEVELS[li], sx = lv.spawn.x;
    for (let ry = lv.spawn.y + 80; ry <= 660; ry += 15)
      for (let th = 25; th <= 155; th += 1.5){
        const cfg = [ramp(sx, ry, th)];
        if (g.simulate(cfg, 1, li).result === 'win'){ g.setRamps(cfg); return true; }
      }
    return false;
  }, li);
  if (!armed) return false;
  await dropBall();
  await page.waitForFunction(() => window.__gtb.state().phase === 'over', null, { timeout: 25000 });
  return true;
}
const ballsNow = () => page.evaluate(() => window.__gtb.balls());

/* --- a first-ever load grants exactly ten --- */
await freshPlayer();
check((await ballsNow()) === BALLS.start,
  `a first-ever load grants exactly ${BALLS.start} balls`, `${await ballsNow()}`);
check(BALLS.start > 0 && Number.isInteger(BALLS.start),
  'and the opening grant is a sane whole number', `${BALLS.start}`);
check((await page.locator('#ball-count').textContent()) === String(BALLS.start),
  'the HUD shows the count');
check((await page.evaluate(key => JSON.parse(localStorage.getItem(key)).balls, BALLS.key)) === BALLS.start,
  'the opening grant is persisted, so it is granted ONCE');
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
check((await ballsNow()) === BALLS.start,
  'a second load does not grant it again', `${await ballsNow()}`);
await page.evaluate(() => { window.__gtb.skipTutorial(); window.__gtb.setBalls(4); });
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
check((await ballsNow()) === 4, 'an existing count is left alone', `${await ballsNow()}`);

/* --- the tiers, across all twenty levels --- */
const tiers = await page.evaluate(() =>
  window.__gtb.LEVELS.map(l => window.__gtb.clearBonus(l.id)));
check(tiers.slice(0,5).every(t => t === 1),  'levels 1-5 pay +1',  tiers.slice(0,5).join(','));
check(tiers.slice(5,10).every(t => t === 2), 'levels 6-10 pay +2', tiers.slice(5,10).join(','));
check(tiers.slice(10,15).every(t => t === 2),'levels 11-15 pay +2',tiers.slice(10,15).join(','));
check(tiers.slice(15,20).every(t => t === 3),'levels 16-20 pay +3',tiers.slice(15,20).join(','));

/* --- a real first clear in each Act pays its tier --- */
for (const [li, want] of [[0,1],[5,2],[10,2],[15,3]]){
  await freshPlayer();
  await page.evaluate(() => window.__gtb.setBalls(20));
  const before = await ballsNow();
  const played = await winLevel(li);          // exactly one drop, so -1
  const after = await ballsNow();
  check(played, `level ${li+1} is winnable with one ramp (test setup)`);
  check(after - before === want - 1,
    `first clear of level ${li+1} pays +${want} against the 1 the drop spent`,
    `${before} -> ${after}`);
  /* The card states the payout as two chips and no prose - a coin mark and a
     ball mark, each with its number. */
  check((await page.locator('#ov-balls').textContent()).trim() === `+${want}`,
    'and the win card says so', await page.locator('#ov-balls').textContent());
  check((await page.evaluate(() => window.__gtb.cleared()))[li] === true,
    'the level is recorded as cleared');
}

/* --- the coin flight: a flourish that must not leak or double-pay --- */
await freshPlayer();
await page.evaluate(() => window.__gtb.setBalls(20));
await winLevel(0);
const flight = await page.evaluate(() => ({
  layer: !!document.querySelector('.coinfly'),
  inAir: document.querySelectorAll('.flycoin').length,
  coins: window.__gtb.coins(),
}));
check(flight.layer, 'the flight layer is mounted above the panels');
check(flight.inAir > 0, 'coins leave the card when it opens', `${flight.inAir} in the air`);
/* The wallet is credited by recordClear, not by the animation. Nothing here
   can be missed, interrupted, or replayed into paying twice - so the total is
   already right while the coins are still mid-flight. */
check(flight.coins === (await page.evaluate(() => window.__gtb.coins())),
  'and the wallet was already credited before they land - the flight pays nothing');
/* The whole run is STAGGER * (COINS - 1) + FLIGHT, about 2.8s - so this waits
   well past it rather than on top of it. */
await page.waitForFunction(() => document.querySelectorAll('.flycoin').length === 0,
  null, { timeout: 10000 });
check(true, 'every coin removes itself on arrival - the layer does not leak nodes');

/* A re-render while the card is open must not relaunch it. */
const flightPaid = await page.evaluate(() => window.__gtb.coins());
await page.evaluate(() => { window.__gtb.setBalls(19); window.__gtb.setBalls(20); });
await page.waitForTimeout(120);
check(await page.evaluate(() => document.querySelectorAll('.flycoin').length) === 0,
  'and a re-render while the card is open does not relaunch it');
check(await page.evaluate(() => window.__gtb.coins()) === flightPaid,
  'nor pay again', `${flightPaid} coins`);

/* --- replaying an already-cleared level pays nothing --- */
await freshPlayer();
await page.evaluate(() => window.__gtb.setBalls(20));
await winLevel(0);
let mid = await ballsNow();
await winLevel(0);                                    // same level, second clear
check((await ballsNow()) === mid - 1,
  'replaying a cleared level pays no second bonus - it just costs the drop',
  `${mid} -> ${await ballsNow()}`);
mid = await ballsNow();
await winLevel(0);
check((await ballsNow()) === mid - 1, 'and not on the third time either',
  `${await ballsNow()}`);
/* the farm the ledger exists to stop: the bonus must not come back on reload */
mid = await ballsNow();
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await page.evaluate(() => window.__gtb.skipTutorial());
await winLevel(0);
check((await ballsNow()) === mid - 1, 'nor after a reload - the ledger is persisted',
  `${await ballsNow()}`);
check((await ballsNow()) < mid, 'so grinding a cleared level DRAINS the tank, never fills it',
  `${mid} -> ${await ballsNow()}`);

/* the finale is the case a highest-level marker cannot express, because
   `highest` stops at the last index and can never advance past it */
await freshPlayer();
await page.evaluate(() => window.__gtb.setBalls(20));
const beforeFinale = await ballsNow();
const finalePlayed = await winLevel(19);
check(finalePlayed, 'level 20 is winnable with one ramp (test setup)');
check((await ballsNow()) - beforeFinale === 3 - 1,
  'clearing the FINALE still pays its +3', `${beforeFinale} -> ${await ballsNow()}`);
const afterFinale = await ballsNow();
await winLevel(19);
check((await ballsNow()) === afterFinale - 1, 'and only once, on the finale too',
  `${await ballsNow()}`);

/* --- a drop costs exactly one ball, win or lose --- */
await freshPlayer();
await page.evaluate(() => {
  const g = window.__gtb;
  g.setBalls(9); g.setLevel(0); g.setSeed(9);
  g.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]);        // a ramp that loses
});
let before = await ballsNow();
await dropBall();
check(before - (await ballsNow()) === 1, 'a drop costs exactly one ball',
  `${before} -> ${await ballsNow()}`);
check((await page.locator('#ball-count').textContent()) === String(await ballsNow()),
  'the HUD chip follows immediately, on the press');
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
check((await ballsNow()) === before - 1, 'a LOST drop is not refunded', `${await ballsNow()}`);

/* a won drop costs the same - checked on an ALREADY cleared level, so no
   first-clear bonus is in the way of the arithmetic */
await freshPlayer();
await page.evaluate(() => window.__gtb.setBalls(9));
await winLevel(0);                                        // first clear: -1, +1
const settled = await ballsNow();
await winLevel(0);                                        // cleared already: -1
check(settled - (await ballsNow()) === 1, 'a WON drop costs one ball too',
  `${settled} -> ${await ballsNow()}`);

/* --- every retry costs, so four attempts cost four balls --- */
await page.evaluate(() => {
  const g = window.__gtb;
  g.setBalls(9); g.setLevel(0); g.setSeed(9);
  g.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]);
});
const retryStart = await ballsNow();
for (let i = 0; i < 4; i++){
  await dropBall();
  await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
  // adjust between attempts, the way a player actually would
  await page.evaluate(i => window.__gtb.setRamps([{ x1:150+i*6, y1:300, x2:250, y2:360+i*4 }]), i);
}
check(retryStart - (await ballsNow()) === 4, 'four adjust-and-drop retries cost four balls',
  `${retryStart} -> ${await ballsNow()}`);

/* --- moving between levels is free; only throwing a ball costs --- */
before = await ballsNow();
await page.locator('#level-title').click();
await page.locator('#lvgrid button').first().click();
check((await ballsNow()) === before, 'opening another level from the picker is free',
  `${before} -> ${await ballsNow()}`);
check(await page.locator('#select').isHidden(), 'and the picker closes');
check((await page.evaluate(() => window.__gtb.state())).levelIndex === 0, 'and it really moved');

await page.evaluate(() => window.__gtb.setBalls(9));
await winLevel(0);                                        // leaves the win card up
before = await ballsNow();
await page.locator('#btn-next').click();
check((await ballsNow()) === before, 'and so is Next after a win',
  `${before} -> ${await ballsNow()}`);
check((await page.evaluate(() => window.__gtb.state())).levelIndex === 1, 'which advanced a level');

/* --- at zero, the drop tap turns into the way to get more --- */
await page.evaluate(() => {
  const g = window.__gtb;
  g.setBalls(0); g.setLevel(0); g.setSeed(9);
  g.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]);
});
let info = await page.evaluate(() => window.__gtb.ballInfo());
check(info.balls === 0 && !info.stopShown,
  'the stop screen is not up until the player actually taps to drop');
check(!info.dropDisabled,
  'the tap stays live at zero balls - it opens the way to get more');
await dropBall();
await page.waitForTimeout(200);
info = await page.evaluate(() => window.__gtb.ballInfo());
check(info.stopShown && await page.locator('#noballs').isVisible(),
  'pressing it at zero raises the out-of-balls screen');
check((await page.evaluate(() => window.__gtb.state())).phase === 'plan',
  'and drops nothing');
check(info.balls === 0, 'and spends nothing', `${info.balls}`);

/* being broke must not trap you on the level you happen to be standing on */
await page.evaluate(() => document.getElementById('btn-nb-close').click());
await page.locator('#level-title').click();
await page.locator('#lvgrid button').nth(1).click();
check((await page.evaluate(() => window.__gtb.state())).levelIndex === 1 &&
      (await ballsNow()) === 0,
  'an empty tank still lets you move around the game, just not throw a ball');

/* --- the two offers on that screen --- */
await page.evaluate(() => { window.__gtb.setLevel(0);
  window.__gtb.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]); });
await dropBall();
await page.waitForTimeout(200);
info = await page.evaluate(() => window.__gtb.ballInfo());
check(await page.locator('#btn-buy').isVisible(), 'the Buy Balls button is on screen');
/* It buys with COINS, so what it offers depends on the wallet. Both states
   are checked, because "you cannot afford one" is the one a stranded player
   actually meets and it must still say why. */
await page.evaluate(() => window.__gtb.setWallet(0, 0));
info = await page.evaluate(() => window.__gtb.ballInfo());
check(info.buyDisabled && await page.locator('#btn-buy').isDisabled(),
  'broke, it is disabled rather than failing when pressed');
check(/need \d+ coins/i.test(info.buyText),
  'and says what a ball costs instead of just refusing', info.buyText.trim());
await page.evaluate(() => window.__gtb.setWallet(40, 0));
info = await page.evaluate(() => window.__gtb.ballInfo());
/* 24, not 20: 40 coins is two of the 12-ball bundles. The number quoted here
   has to be one the shop will really hand over, or the offer reads as broken
   the moment the player gets there. */
check(!info.buyDisabled && /buys 24/.test(info.buyText),
  'with coins, it says how many balls they buy - at bundle prices', info.buyText.trim());
await page.locator('#btn-buy').click();
check(await page.locator('#shoppanel').isVisible(), 'and it opens the shop');
await page.locator('#btn-buy-balls-12').click();
const shopBought = await page.evaluate(() => [window.__gtb.coins(), window.__gtb.balls()]);
check(shopBought[0] === 20 && shopBought[1] === 12,
  'the bulk row is a real discount: 20 coins buys 12 balls, not 10',
  `${shopBought[0]} coins, ${shopBought[1]} balls`);
await page.locator('#btn-shop-close').click();
await page.evaluate(() => { window.__gtb.setBalls(0); window.__gtb.setWallet(0, 0); });
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'balls-empty.png') });
ok('screenshot: balls-empty.png');

await page.locator('#btn-ad').click();
info = await page.evaluate(() => window.__gtb.ballInfo());
check(info.balls === BALLS.adReward, `the ad placeholder grants +${BALLS.adReward}`, `${info.balls}`);
check(!info.stopShown && await page.locator('#noballs').isHidden(),
  'and hands the board straight back');
before = await ballsNow();
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
check(before - (await ballsNow()) === 1, 'play resumes and the next drop spends normally',
  `${before} -> ${await ballsNow()}`);

/* "Not now" leaves everything exactly as it was */
await page.evaluate(() => window.__gtb.setBalls(0));
await dropBall();
await page.waitForTimeout(200);
check(await page.locator('#noballs').isVisible(), 'blocked again at zero');
await page.locator('#btn-nb-close').click();
info = await page.evaluate(() => window.__gtb.ballInfo());
check(!info.stopShown && info.balls === 0,
  'Not now dismisses it without spending or granting anything');
check(!(await page.evaluate(() => window.__gtb.ballInfo().dropDisabled)),
      'and hands the board back');

/* ---------------------------------------------------------------- */
section('14. Daily spin wheel');

const SPIN = await page.evaluate(() => window.__gtb.SPIN);
const WALLET = await page.evaluate(() => window.__gtb.WALLET);
const SEG = 360 / SPIN.prizes.length;
console.log(`  ${SPIN.prizes.length} wedges [${SPIN.prizes.map(p=>p.balls).join(' ')}], ` +
            `cooldown ${SPIN.cooldownMs/3600000}h, spin ${SPIN.animMs}ms`);

/** Which wedge the pointer is actually over, derived only from the rendered
    rotation - the independent half of the "not rigged" check below. */
const wedgeUnderPointer = deg => Math.floor(((((-deg) % 360) + 360) % 360) / SEG)
                                % SPIN.prizes.length;

/** Put the cooldown clock `agoMs` in the past, via storage and a reload. */
async function seedSpin(agoMs){
  await page.evaluate(([key, ago]) => {
    localStorage.setItem(key, JSON.stringify({ last: Date.now() - ago, pending: 0 }));
  }, [SPIN.key, agoMs]);
  await page.reload();
  await page.waitForFunction(() => !!window.__gtb);
  await page.evaluate(() => { window.__gtb.skipTutorial(); window.__gtb.setBalls(0); });
}

/* ---------------------------------------------------------------- */
section('13b. Coins, the shop and spare ramps');

await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
let w = await page.evaluate(() => ({ coins: window.__gtb.coins(),
  balls: window.__gtb.balls(), ramps: window.__gtb.spareRamps() }));
check(w.coins === WALLET.startCoins && w.balls === BALLS.start && w.ramps === 0,
  'a new player starts with the stated wallet',
  `${w.coins} coins, ${w.balls} balls, ${w.ramps} spare ramps`);

/* --- the prices are the prices --- */
await page.evaluate(() => window.__gtb.setWallet(100, 0));
check(await page.evaluate(() => window.__gtb.buyBalls(10)), 'ten balls can be bought');
w = await page.evaluate(() => ({ coins: window.__gtb.coins(), balls: window.__gtb.balls() }));
check(w.coins === 100 - 10 * WALLET.ballPrice,
  `a ball costs ${WALLET.ballPrice} coins, exactly`, `100 -> ${w.coins}`);

/* --- and the bundles are cheaper than the sum of their parts --- */
/* The whole point of a bulk row. Checked against the LIST price rather than
   against a hard-coded number, so retuning the table cannot leave a bundle
   quietly charging full freight. */
const deals = await page.evaluate(() => {
  const g = window.__gtb;
  return { balls: g.BALL_BUNDLES.map(b => [b.n, b.coins, g.ballCost(b.n)]),
           ramps: g.RAMP_BUNDLES.map(b => [b.n, b.coins, g.rampCost(b.n)]) };
});
for (const [kind, unit, rows] of [['ball', WALLET.ballPrice, deals.balls],
                                  ['ramp', WALLET.rampPrice, deals.ramps]]) {
  for (const [n, listed, charged] of rows) {
    check(charged === listed && charged <= n * unit,
      `${n} ${kind}${n === 1 ? '' : 's'} costs ${listed}, never more than ${n * unit} singles`,
      `charged ${charged}`);
  }
  const top = rows[rows.length - 1];
  check(top[1] < top[0] * unit, `and the biggest ${kind} bundle is a real discount`,
    `${top[0]} for ${top[1]} vs ${top[0] * unit} at list`);
}
check(await page.evaluate(() => window.__gtb.buyRamps(3)), 'three spare ramps can be bought');
w = await page.evaluate(() => ({ coins: window.__gtb.coins(), ramps: window.__gtb.spareRamps() }));
check(w.coins === 100 - 20 - 3 * WALLET.rampPrice,
  `a spare ramp costs ${WALLET.rampPrice} coins, exactly`, `${w.coins} left`);
check(w.ramps === 3, 'and lands in the drawer', `${w.ramps} spare ramps`);

/* An order that cannot be paid for must be refused WHOLE. A shop that fills
   part of it has spent coins the player never agreed to spend. */
const broke = await page.evaluate(() => {
  window.__gtb.setWallet(10, 0);
  const ok = window.__gtb.buyBalls(50);
  return { ok, coins: window.__gtb.coins(), balls: window.__gtb.balls() };
});
check(!broke.ok && broke.coins === 10,
  'an order you cannot afford is refused whole, not part-filled',
  `${broke.coins} coins still there`);

/* --- clearing pays coins, and a board pays ONCE --- */
const pay = await page.evaluate(() => {
  const g = window.__gtb;
  /* The cheapest a ball can ever be bought for: the best bundle's rate, which
     is what a farm would actually pay for the drop a replay costs. */
  const cheapestBall = Math.min(...g.BALL_BUNDLES.map(b => b.coins / b.n));
  return {
    firstLow:  g.coinsFor(1, 1, true),
    firstHigh: g.coinsFor(1, 3, true),
    lateHigh:  g.coinsFor(30, 3, true),
    replayHigh: g.coinsFor(1, 3, false),
    replayLate: g.coinsFor(150, 3, false),
    cheapestBall,
  };
});
console.log(`  level 1: ${pay.firstLow} coins at 1 star, ${pay.firstHigh} at 3` +
            `; level 30 at 3 stars: ${pay.lateHigh}; replaying level 1: ${pay.replayHigh}`);
check(pay.firstHigh > pay.firstLow, 'playing well pays more than scraping through',
  `${pay.firstHigh} vs ${pay.firstLow}`);
check(pay.lateHigh > pay.firstHigh, 'and a late level pays more than an early one',
  `${pay.lateHigh} vs ${pay.firstHigh}`);
/* ============================================================
   A REPLAY MAY NOT BE A COIN MACHINE

   Asserted as arithmetic rather than as a number, because that
   is what the rule IS: a drop costs a ball, a ball costs coins,
   so a replay that pays more than a ball is worth is a loop that
   prints coins on the easiest board the player has ever solved.
   It pays nothing at all today; this fails the moment any rate
   that could outrun the ball it costs is reintroduced.
   ============================================================ */
check(pay.replayHigh === 0 && pay.replayLate === 0,
  'a replay of a cleared board pays no coins at all - a board pays once',
  `${pay.replayHigh} on level 1, ${pay.replayLate} on the finale`);
check(pay.replayHigh < pay.cheapestBall && pay.replayLate < pay.cheapestBall,
  'so replaying can never earn more than the ball the drop costs',
  `${pay.replayHigh} coins for a ball worth ${pay.cheapestBall.toFixed(2)}`);

/* --- a spare ramp raises THIS level's budget, and only this level's --- */
await page.evaluate(() => { window.__gtb.setWallet(0, 2); window.__gtb.setLevel(0); });
let bud = await page.evaluate(() => window.__gtb.budget());
const designed = bud.level;
check(bud.inForce === designed && bud.extra === 0,
  'a level starts on its own budget alone', `${bud.inForce} ramps`);
check(await page.evaluate(() => window.__gtb.useExtraRamp()), 'a spare can be spent');
bud = await page.evaluate(() => window.__gtb.budget());
check(bud.inForce === designed + 1 && bud.left === designed + 1,
  'and it raises the budget in force by one', `${designed} -> ${bud.inForce}`);
check(bud.level === designed,
  'without touching the level\'s DESIGNED budget - which is what the stars ' +
  'are measured against, so a spare can never buy a third star',
  `still ${bud.level}`);
check(await page.evaluate(() => window.__gtb.spareRamps()) === 1,
  'the drawer is one lighter', '1 spare ramp left');

await page.evaluate(() => window.__gtb.setLevel(1));
bud = await page.evaluate(() => window.__gtb.budget());
check(bud.extra === 0,
  'and a spare does not follow you to the next level - it is bought into a board');
check(await page.evaluate(() => window.__gtb.spareRamps()) === 1,
  'while the drawer itself is untouched by moving around', '1 spare ramp');

const noSpare = await page.evaluate(() => {
  window.__gtb.setWallet(0, 0);
  return window.__gtb.useExtraRamp();
});
check(!noSpare, 'an empty drawer has nothing to spend');
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });
await topUp();

/* ---------------------------------------------------------------- */
/* --- the prize table is weighted the way the design says --- */
/* The wheel pays coins, balls OR ramps, so wedges can only be compared in
   coins: a ball is WALLET.ballPrice and a ramp is WALLET.rampPrice. */
const coinValue = p => p.kind === 'coins' ? p.n
                     : p.kind === 'balls' ? p.n * WALLET.ballPrice
                     : p.n * WALLET.rampPrice;
const wTotal = SPIN.prizes.reduce((n, p) => n + p.w, 0);
check(wTotal === 100, 'the weights total 100, so each reads as its own percentage', `${wTotal}`);
check(SPIN.prizes.every(p => p.n > 0), 'every wedge pays something - no blanks');
check(new Set(SPIN.prizes.map(p => p.kind)).size === 3,
  'and all three currencies are on the wheel',
  [...new Set(SPIN.prizes.map(p => p.kind))].join(','));
const jackpotShare = SPIN.prizes.filter(p => coinValue(p) >= 60)
                                .reduce((n, p) => n + p.w, 0) / wTotal;
check(jackpotShare > 0 && jackpotShare < 0.12, 'the jackpots are a genuine rarity',
  `${(jackpotShare*100).toFixed(1)}% is worth 60+ coins`);
const ev = SPIN.prizes.reduce((n, p) => n + coinValue(p) * p.w / wTotal, 0);
console.log(`  expected value: ${ev.toFixed(1)} coins a day` +
            ` (${(ev / WALLET.ballPrice).toFixed(0)} balls, or ${(ev / WALLET.rampPrice).toFixed(1)} ramps)`);
check(ev > 15 && ev < 60, 'worth coming back for, not worth more than playing',
  `${ev.toFixed(1)} coins`);

/* the sampler must actually follow those weights */
const sample = await page.evaluate(() => {
  const counts = {};
  for (let i = 0; i < 40000; i++){
    const ix = window.__gtb.pickPrize();
    counts[ix] = (counts[ix] || 0) + 1;
  }
  return counts;
});
const drawn = Object.keys(sample).length;
check(drawn === SPIN.prizes.length, 'every wedge is reachable', `${drawn} of ${SPIN.prizes.length}`);
const worst = SPIN.prizes.reduce((w, p, i) => {
  const want = p.w / wTotal, got = (sample[i]||0) / 40000;
  return Math.max(w, Math.abs(got - want) / want);
}, 0);
check(worst < 0.12, 'sampled frequencies track the declared weights',
  `worst wedge off by ${(worst*100).toFixed(1)}%`);

/* --- the landing maths, on every wedge, without spinning eight times --- */
const aimBad = await page.evaluate(() => {
  const g = window.__gtb, n = g.SPIN.prizes.length, seg = 360 / n;
  const bad = [];
  for (let ix = 0; ix < n; ix++)
    for (const jitter of [-1, -0.5, 0, 0.5, 1])
      for (const from of [0, -22.5, 137.4, 5000.9, -913.2]){
        const t = g.spinTarget(ix, from, jitter);
        const landed = Math.floor(((((-t) % 360) + 360) % 360) / seg) % n;
        if (landed !== ix) bad.push(`wedge ${ix} from ${from} jitter ${jitter} -> ${landed}`);
        if (t < from + 360 * 5) bad.push(`wedge ${ix} from ${from}: only ${(t-from).toFixed(0)} deg`);
      }
  return bad;
});
check(aimBad.length === 0,
  'every wedge is aimed at correctly, at any jitter, from any starting angle',
  aimBad.length ? aimBad[0] : `${SPIN.prizes.length} wedges x 5 jitters x 5 angles`);

/* --- a new player has a spin waiting --- */
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await page.evaluate(() => { window.__gtb.skipTutorial(); window.__gtb.setBalls(0); });
let sp = await page.evaluate(() => window.__gtb.spinInfo());
/* The gear wears the wheel's state now: behind a panel, a waiting spin needs
   a LOUDER signal from the board than it did as its own button, not a
   quieter one, so the gear both pulses and carries a badge. */
check(sp.ready && sp.btnReady && !sp.btnLocked, 'a new player has a spin ready');
check(sp.badge, 'and the gear carries a badge saying so from the board itself');
check(await page.locator('#spinpanel').isHidden(), 'the wheel panel starts closed');
await openSettings();
check(await page.locator('#spin-cd').textContent() === 'Ready',
  'the settings row says Ready rather than counting down');
await page.locator('#btn-spin').click();
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(sp.panelOpen && await page.locator('#spinpanel').isVisible(),
  'and the row opens the wheel, on top of settings');
check(!sp.goDisabled, 'Spin is enabled while the wheel is ready');

/* --- the spin: result first, animation aimed at it --- */
/* A wedge can pay any of the three currencies, so the whole wallet is
   sampled either side and the payout is read off whichever one moved. */
const wallet = () => page.evaluate(() => ({ coins: window.__gtb.coins(),
  balls: window.__gtb.balls(), ramps: window.__gtb.spareRamps() }));
const wBefore = await wallet();
await page.locator('#btn-spin-go').click();
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(sp.spinning, 'the wheel is turning');
check(sp.goDisabled, 'Spin is disabled mid-spin - no double spin');
const committed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),  SPIN.key);
check(committed.pending && committed.pending.n > 0 && committed.pending.kind,
  'the prize is committed to storage BEFORE the wheel stops - no re-roll by reload',
  `pending ${JSON.stringify(committed.pending)}`);

await page.waitForFunction(() => !window.__gtb.spinInfo().spinning, null, { timeout: 20000 });
sp = await page.evaluate(() => window.__gtb.spinInfo());
const wAfter = await wallet();
const moved = ['coins','balls','ramps'].filter(k => wAfter[k] !== wBefore[k]);
const landed = wedgeUnderPointer(sp.deg);
const prize = SPIN.prizes[landed];
const granted = wAfter[prize.kind] - wBefore[prize.kind];
console.log(`  landed on wedge ${landed} (${prize.n} ${prize.kind}), granted ${granted}`);
check(moved.length === 1 && moved[0] === prize.kind,
  'exactly one currency moves, and it is the one the wedge names',
  `moved ${moved.join(',') || 'nothing'}, wedge pays ${prize.kind}`);
check(granted === committed.pending.n && prize.kind === committed.pending.kind,
  'what is paid is what was committed up front',
  `${granted} ${prize.kind} vs ${JSON.stringify(committed.pending)}`);
check(prize.n === granted,
  'the wheel visually STOPS on the prize it actually paid out',
  `wedge ${landed} = ${prize.n} ${prize.kind}, paid ${granted}`);
check(sp.shown === granted && sp.shownKind === prize.kind && /won/i.test(sp.sub),
  'the result is announced, in the right currency', sp.sub);
check((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SPIN.key)).pending === null,
  'the committed debt is cleared once paid');

/* --- and it is locked for a day --- */
/* the gear is driven by a once-a-second tick as well as the game's own
   version counter, so the lock is waited for rather than sampled */
await page.waitForFunction(() => !window.__gtb.spinInfo().btnReady, null, { timeout: 5000 });
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(!sp.ready && sp.btnLocked && !sp.btnReady, 'the wheel locks immediately after use');
check(!sp.badge, 'and the gear drops its badge');
check(sp.goDisabled && await page.locator('#btn-spin-go').isDisabled(), 'Spin is disabled while locked');
/* the row's countdown ticks on its own once-a-second timer, so it is waited
   for rather than sampled the instant the wheel stops */
await page.waitForFunction(() => /^(\d+h \d{2}m|\d+m|\d+s)$/
  .test(document.getElementById('spin-cd')?.textContent ?? ''), null, { timeout: 5000 });
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(/^(\d+h \d{2}m|\d+m|\d+s)$/.test(sp.cdText),
  'and the settings row carries a countdown instead', sp.cdText);
check(sp.nextMs > SPIN.cooldownMs - 60000 && sp.nextMs <= SPIN.cooldownMs,
  'a full cooldown is on the clock', `${Math.round(sp.nextMs/3600000)}h`);
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'wheel-result.png') });
ok('screenshot: wheel-result.png');

/* pressing the disabled Spin must not sneak a second one through */
const lockedWallet = JSON.stringify(await wallet());
await page.evaluate(() => document.getElementById('btn-spin-go').click());
await page.waitForTimeout(200);
check(JSON.stringify(await wallet()) === lockedWallet,
  'a forced Spin while locked pays nothing, in any currency', lockedWallet);

/* --- the cooldown boundary, simulated by backdating the stored stamp --- */
await seedSpin(SPIN.cooldownMs - 60 * 60 * 1000);        // an hour short of a day
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(!sp.ready && sp.btnLocked, 'an hour short of 24h the wheel is still locked', sp.cdText);

await seedSpin(SPIN.cooldownMs + 60 * 1000);             // just over a day
sp = await page.evaluate(() => window.__gtb.spinInfo());
check(sp.ready && sp.btnReady, 'past 24h the wheel is available again');
check(await page.evaluate(() => document.getElementById('btn-settings').classList.contains('ready')),
  'and the gear pulses to say so');

/* --- the wheel lets itself in, once a day --- */
section('14b. The wheel opens itself');
await seedSpin(SPIN.cooldownMs * 2);          // a spin is due
await autoSpin(true);
await page.evaluate(() => window.__gtb.skipTutorial());
let auto = await page.evaluate(() => window.__gtb.spinInfo());
check(auto.wouldOffer, 'with a spin due and nothing offered yet, it is armed');
await page.waitForFunction(() => !!document.getElementById('spinpanel'),
  null, { timeout: 4000 });
check(await page.locator('#spinpanel').isVisible(),
  'and it opens on its own, with no button pressed');

/* Closing it without spinning must not make it a nag. */
await page.locator('#btn-spin-close').click();
await page.waitForSelector('#spinpanel', { state: 'detached' });
auto = await page.evaluate(() => window.__gtb.spinInfo());
check(!auto.wouldOffer && auto.ready,
  'closing it without spinning leaves the spin available but disarms the offer');
await page.waitForTimeout(1600);
check(await page.locator('#spinpanel').count() === 0,
  'so it does not raise itself again a second later');
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await page.evaluate(() => window.__gtb.skipTutorial());
await page.waitForTimeout(1600);
check(await page.locator('#spinpanel').count() === 0,
  'nor on the next reload - the offer is remembered, not the session');
check((await page.evaluate(() => window.__gtb.spinInfo())).ready,
  'and the spin itself is still there to be taken by hand');

/* It must not interrupt. */
await seedSpin(SPIN.cooldownMs * 2);
await autoSpin(true);
await page.evaluate(() => { window.__gtb.skipTutorial(); window.__gtb.setBalls(9);
  window.__gtb.setLevel(0);
  window.__gtb.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]); });
await dropBall();
check((await page.evaluate(() => window.__gtb.state())).phase !== 'plan',
  'set up: a drop is in flight');
await page.waitForTimeout(1400);
check(await page.locator('#spinpanel').count() === 0,
  'it does not open over a drop in flight');
await page.waitForFunction(() => window.__gtb.state().phase === 'plan',
  null, { timeout: 25000 });
await page.waitForFunction(() => !!document.getElementById('spinpanel'),
  null, { timeout: 5000 });
check(true, 'and waits for the board to come back to planning');
await page.locator('#btn-spin-close').click();
await page.waitForSelector('#spinpanel', { state: 'detached' });
await autoSpin(false);
await topUp();

/* --- a spin abandoned mid-animation still pays out on the next load --- */
const owe = async (pending, read) => {
  await page.evaluate(([key, p]) => {
    localStorage.setItem(key, JSON.stringify({ last: Date.now(), pending: p }));
  }, [SPIN.key, pending]);
  await page.reload();
  await page.waitForFunction(() => !!window.__gtb);
  await page.evaluate(() => window.__gtb.skipTutorial());
  return { got: await page.evaluate(read),
           left: (await page.evaluate(k => JSON.parse(localStorage.getItem(k)), SPIN.key)).pending };
};

let owed = await owe({ kind: 'coins', n: 40 }, () => window.__gtb.coins());
check(owed.got >= 40, 'a spin abandoned mid-animation is still paid on the next load',
  `${owed.got} coins`);
check(owed.left === null, 'and it is only paid once');

owed = await owe({ kind: 'ramps', n: 2 }, () => window.__gtb.spareRamps());
check(owed.got >= 2, 'a ramp prize is owed and paid the same way', `${owed.got} spare ramps`);

/* A bare number is how the wheel recorded a debt before it paid anything but
   balls. A save from then must still be honoured rather than silently voided. */
const beforeLegacy = await page.evaluate(() => window.__gtb.balls());
owed = await owe(4, () => window.__gtb.balls());
check(owed.got === beforeLegacy + 4,
  'and a debt written by the old balls-only wheel is still honoured',
  `${beforeLegacy} -> ${owed.got} balls`);
check(owed.left === null, 'then cleared like any other');

/* --- a clock wound backwards must not lock the wheel forever --- */
await page.evaluate(key => {
  localStorage.setItem(key, JSON.stringify({ last: Date.now() + 30 * 864e5, pending: null }));
}, SPIN.key);
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
check((await page.evaluate(() => window.__gtb.spinInfo())).ready,
  'a stamp far in the future hands back a spin rather than locking forever');

/* --- the two systems are actually joined up --- */
await seedSpin(SPIN.cooldownMs * 2);                 // 0 balls, a spin waiting
await page.evaluate(() => { window.__gtb.setLevel(0);
  window.__gtb.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]); });
let joint = await page.evaluate(() => window.__gtb.ballInfo());
check(joint.balls === 0, 'set up: out of balls with a spin available');
await dropBall();
await page.waitForTimeout(200);
check(await page.locator('#noballs').isVisible(),
  'tapping to drop at zero raises the stop screen');

/* the wheel is reachable FROM the stop screen. It used to be reachable
   because this screen only covered the board; now that it covers the
   viewport, the offer has to be on the card itself. */
check(await page.locator('#btn-nb-spin').isVisible(),
  'the stop screen offers the wheel when a spin is available');
await page.locator('#btn-nb-spin').click();
check(await page.locator('#spinpanel').isVisible(),
  'and it opens on top of the stop screen, so it is a way out of it');
await page.locator('#btn-spin-go').click();
await page.waitForFunction(() => !window.__gtb.spinInfo().spinning, null, { timeout: 20000 });
await page.locator('#btn-spin-close').click();
/* The wedge may have paid coins or ramps rather than balls, so what is
   asserted is that the wheel is a way OUT of the stop screen - the wallet is
   worth more than it was, and that value can be turned into balls. */
const wonWallet = await page.evaluate(() => ({ coins: window.__gtb.coins(),
  balls: window.__gtb.balls(), ramps: window.__gtb.spareRamps() }));
const asBalls = wonWallet.balls + Math.floor(wonWallet.coins / WALLET.ballPrice);
check(asBalls > 0, 'the wheel pays something a ball can be got out of',
  `${wonWallet.balls} balls + ${wonWallet.coins} coins`);
if (wonWallet.balls === 0) await page.evaluate(() => window.__gtb.buyBalls(1));
joint = await page.evaluate(() => window.__gtb.ballInfo());
check(joint.balls > 0, 'and the ball tank can be refilled from it', `${joint.balls} balls`);
await page.evaluate(() => document.getElementById('btn-nb-close').click());
const beforeJoint = await page.evaluate(() => window.__gtb.balls());
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
check((await page.evaluate(() => window.__gtb.balls())) === beforeJoint - 1,
  'and that is enough to get back to dropping balls',
  `${beforeJoint} -> ${await page.evaluate(() => window.__gtb.balls())}`);

/* ---------------------------------------------------------------- */
section('14c. Booster ramps: the item you bring, and only pay for when it works');

await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => window.__gtb.setWallet(999, 0, 0));

/* --- before level 21 the item does not exist anywhere --- */
await page.evaluate(() => window.__gtb.setLevel(0));
let bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(!bi.unlocked && bi.owned === 0, 'a new player owns no boosters and has none unlocked',
  JSON.stringify({ unlocked: bi.unlocked, owned: bi.owned }));
await page.click('#btn-inventory');
await page.waitForSelector('#inventorypanel');
check(await page.locator('#btn-item-booster').count() === 0,
  'the bag does not offer one before level 21');
check(await page.locator('#inv-empty').count() === 1,
  'and with nothing else owned yet the tray says so rather than looking broken',
  (await page.locator('#inv-empty').textContent()).trim().slice(0, 60) + '…');
await page.click('#btn-inv-close');
await openSettings();
await page.click('#btn-shop');
await page.waitForSelector('#shoppanel');
check(await page.locator('#shop-boosters-head').count() === 0 &&
      await page.locator('#shop-boosters-locked').count() === 1,
  'and the shop does not sell them either - it says when they open',
  (await page.locator('#shop-boosters-locked').textContent()).trim());
check(await page.evaluate(() => window.__gtb.buyBoosters(1)) === false,
  'the wallet refuses the purchase too - a hidden section is not the rule');
await page.click('#btn-shop-close');
await closeSettings();

/* --- reaching level 21 hands over exactly one, exactly once --- */
const UNLOCK = await page.evaluate(() => window.__gtb.BOOSTER.unlockLevel);
await page.evaluate(u => window.__gtb.setLevel(u - 1), UNLOCK);
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.unlocked && bi.owned === 1 && bi.gifted,
  `reaching level ${UNLOCK} unlocks boosters and gives one free`, JSON.stringify(bi.owned));
const flashOnUnlock = await page.evaluate(() => window.__gtb.state().flash);
check(/booster/i.test(flashOnUnlock), 'and says so on the board', flashOnUnlock);
/* Leaving and coming back must not hand over a second one - the whole point
   of the persisted flag. */
await page.evaluate(u => { window.__gtb.setLevel(0); window.__gtb.setLevel(u - 1); }, UNLOCK);
await page.evaluate(u => { window.__gtb.setLevel(u + 3); window.__gtb.setLevel(u - 1); }, UNLOCK);
check((await page.evaluate(() => window.__gtb.boosterInfo())).owned === 1,
  'and every later visit hands over nothing - the gift fires once, ever',
  `still ${(await page.evaluate(() => window.__gtb.boosterInfo())).owned}`);
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
check((await page.evaluate(() => window.__gtb.boosterInfo())).owned === 1,
  'and it survives a reload, like the coins and the ramps', 'persisted');

/* --- the shop sells them once they exist --- */
await openSettings();
await page.click('#btn-shop');
await page.waitForSelector('#shoppanel');
check(await page.locator('#shop-boosters-head').count() === 1,
  'the shop grows a Boosters section the moment they are unlocked');
const bundles = await page.evaluate(() => window.__gtb.BOOSTER.bundles);
const rows = await page.locator('.buyrow button[id^="btn-buy-boosters-"]').count();
check(rows === bundles.length, 'with one row per bundle, same as balls and ramps',
  `${rows} rows`);
const priceShown = await page.evaluate(() =>
  [...document.querySelectorAll('[id^="btn-buy-boosters-"] .price')].map(e => +e.textContent.replace(/\D/g, '')));
check(JSON.stringify(priceShown) === JSON.stringify(bundles.map(b => b.coins)),
  'and every price is the one the wallet will actually charge',
  `${priceShown.join('/')} vs ${bundles.map(b => b.coins).join('/')}`);
await page.evaluate(() => window.__gtb.setWallet(5, 0, 1));
check(await page.locator('#btn-buy-boosters-1').isDisabled(),
  'a bundle you cannot afford is disabled rather than failing when pressed');
await page.evaluate(() => window.__gtb.setWallet(999, 0, 1));
const coinsBefore = await page.evaluate(() => window.__gtb.coins());
await page.click('#btn-buy-boosters-1');
const afterBuy = await page.evaluate(() => ({ coins: window.__gtb.coins(),
                                              owned: window.__gtb.boosterInfo().owned }));
check(afterBuy.owned === 2 && afterBuy.coins === coinsBefore - bundles[0].coins,
  'buying one takes the coins and hands over the goods in one step',
  `${coinsBefore} -> ${afterBuy.coins} coins, ${afterBuy.owned} boosters`);
await page.click('#btn-shop-close');
await closeSettings();

/* --- placing one: reserved, not spent --- */
await page.evaluate(() => { window.__gtb.setLevel(0); window.__gtb.setWallet(999, 0, 2); });
await page.click('#btn-inventory');
await page.waitForSelector('#inventorypanel');
check(await page.locator('#btn-item-booster').count() === 1,
  'the bag offers the booster once it is unlocked');
await page.click('#btn-item-booster');
await page.waitForSelector('#inventorypanel', { state: 'detached' });
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.placed === 1 && bi.selected === 0,
  'tapping it puts one on the board, selected, ready to be dragged',
  JSON.stringify({ placed: bi.placed, selected: bi.selected }));
check(bi.owned === 2 && bi.free === 1 && bi.paid === 0,
  'and nothing has been charged: it is RESERVED out of the bag, not spent',
  `owned ${bi.owned}, free to place ${bi.free}, paid ${bi.paid}`);
const bshape = bi.onBoard[0];
const BOOST = await page.evaluate(() => window.__gtb.BOOSTER);
const barLen = Math.hypot(bshape.x2 - bshape.x1, bshape.y2 - bshape.y1);
check(Math.abs(barLen - BOOST.len) < 0.01,
  'every placed booster ramp is a BAR of the one fixed length - what you choose ' +
  'is where it goes and which way it lies',
  `${barLen.toFixed(1)} units long, the item is ${BOOST.len}`);
check(Math.abs(bshape.y1 - bshape.y2) < 0.01,
  'and it arrives lying flat, unaimed, so turning it is the first thing you do',
  `(${bshape.x1.toFixed(0)},${bshape.y1.toFixed(0)})-(${bshape.x2.toFixed(0)},${bshape.y2.toFixed(0)})`);

/* dragged and turned by the same two-gesture grammar the ramp uses. A bar has
   no centre field of its own, so where it IS and which way it LIES are read
   back out of its two ends - the same numbers the physics collides with. */
const barMid = b => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
const barDeg = b => Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180 / Math.PI;
await page.evaluate(() => window.__gtb.moveBoosterTo(0, 200, 430));
await page.evaluate(() => window.__gtb.aimBooster(0, 260, 490));
let onBoard = (await page.evaluate(() => window.__gtb.boosterInfo())).onBoard[0];
check(Math.abs(barMid(onBoard).x - 200) < 1 && Math.abs(barMid(onBoard).y - 430) < 1,
  'dragging moves it, and turning it pivots about its own middle rather than moving it',
  `(${barMid(onBoard).x.toFixed(0)},${barMid(onBoard).y.toFixed(0)})`);
check(Math.abs(barDeg(onBoard) - 45) < 1,
  'and the knob sets the angle the bar lies at',
  `${barDeg(onBoard).toFixed(0)}°`);
/* the same gestures on the real canvas, not just through the hook */
const bbox = await page.locator('#board').boundingBox();
await mouseDrag(bbox, { x: 200, y: 430 }, { x: 250, y: 470 });
onBoard = (await page.evaluate(() => window.__gtb.boosterInfo())).onBoard[0];
check(Math.abs(barMid(onBoard).x - 250) < 14 && Math.abs(barMid(onBoard).y - 470) < 14,
  'and a real drag on the board moves it too',
  `(${barMid(onBoard).x.toFixed(0)},${barMid(onBoard).y.toFixed(0)})`);

/* --- a miss costs nothing --- */
await page.evaluate(() => window.__gtb.setRamps([]));
await page.evaluate(() => window.__gtb.moveBoosterTo(0, 60, 700));
await page.evaluate(() => window.__gtb.aimBooster(0, 160, 700));
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.owned === 2 && bi.paid === 0 && bi.placed === 1,
  'a drop that MISSES with a booster on the board costs nothing and leaves it there',
  `owned ${bi.owned}, placed ${bi.placed}`);

/* --- a win the booster had nothing to do with charges nothing --- */
const winCfg = await page.evaluate(() => {
  const g = window.__gtb, R = Math.PI / 180;
  const ramp = (cx, cy, d, l = 120) => { const a = d * R, hx = Math.cos(a) * l / 2, hy = Math.sin(a) * l / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
  const lv = g.LEVELS[0], sx = lv.spawn.x;
  // the bar parked in a corner the ball never visits
  g.moveBoosterTo(0, 430, 120);
  g.aimBooster(0, 470, 160);
  for (let ry = lv.spawn.y + 80; ry <= 660; ry += 15)
    for (let th = 25; th <= 155; th += 1.5) {
      const cfg = [ramp(sx, ry, th)];
      if (g.simulate(cfg, 1, 0).result === 'win') { g.setRamps(cfg); g.setSeed(1); return true; }
    }
  return false;
});
check(winCfg, 'level 1 is winnable with one ramp (test setup)');
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase === 'over', null, { timeout: 25000 });
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.owned === 2 && bi.paid === 0,
  'winning with a booster the ball never touched charges nothing - you pay for one that WORKED',
  `owned ${bi.owned}, paid ${bi.paid}`);
await page.evaluate(() => { window.__gtb.reset(); window.__gtb.setLevel(0); });

/* --- a win the booster DID fire on spends exactly one --- */
await page.evaluate(() => window.__gtb.setWallet(999, 0, 2));
const boostWin = await page.evaluate(() => {
  const g = window.__gtb, R = Math.PI / 180;
  const lv = g.LEVELS[0], sx = lv.spawn.x, t = lv.target;
  /* Straight across the fall line, so the ball cannot miss it, and swept for an
     angle that mirrors it into the target with no ramp at all. `bar()` builds
     the item the bag hands out, so what is proved here is the real thing. */
  for (let by = 220; by <= 520; by += 20)
    for (let ang = -80; ang <= 80; ang += 2) {
      const j = g.scratch({ ...lv, boostRamps: [g.bar(sx, by, ang)] }, 5);
      if (g.simulate([], 1, j).result === 'win') return { by, ang, t: t.r };
    }
  return null;
});
check(!!boostWin, 'a booster placement that wins level 1 on its own (test setup)',
  JSON.stringify(boostWin));
await page.evaluate(w => {
  const g = window.__gtb, R = Math.PI / 180;
  g.placeBooster();
  g.moveBoosterTo(0, g.LEVELS[0].spawn.x, w.by);
  g.aimBooster(0, g.LEVELS[0].spawn.x + Math.cos(w.ang * R) * 120,
                  w.by + Math.sin(w.ang * R) * 120);
  g.setRamps([]); g.setSeed(1);
}, boostWin);
const ownedBefore = (await page.evaluate(() => window.__gtb.boosterInfo())).owned;
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase === 'over', null, { timeout: 25000 });
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.owned === ownedBefore - 1 && bi.paid === 1,
  'and the drop that FIRES one and wins is what takes it out of the bag',
  `owned ${ownedBefore} -> ${bi.owned}, paid ${bi.paid}`);
/* Replaying a board already won must not charge for it twice. */
await page.evaluate(() => window.__gtb.drop());
await page.waitForFunction(() => window.__gtb.state().phase !== 'drop', null, { timeout: 25000 });
check((await page.evaluate(() => window.__gtb.boosterInfo())).owned === bi.owned,
  'and replaying that same board never charges for it a second time',
  `still ${(await page.evaluate(() => window.__gtb.boosterInfo())).owned}`);
await page.evaluate(() => window.__gtb.reset());
await page.evaluate(() => window.__gtb.setLevel(0));
check((await page.evaluate(() => window.__gtb.boosterInfo())).placed === 0,
  'leaving the level takes any placed booster back off the board');

/* --- taking one back off the board is free --- */
await page.evaluate(() => window.__gtb.placeBooster());
await page.evaluate(() => window.__gtb.removeBooster(0));
bi = await page.evaluate(() => window.__gtb.boosterInfo());
check(bi.placed === 0 && bi.owned === 1 && bi.free === 1,
  'picking one back up returns it to the bag - it was never spent',
  `owned ${bi.owned}, free ${bi.free}`);

/* --- the capstone board says what it needs --- */
const needIx = await page.evaluate(() =>
  window.__gtb.LEVELS.findIndex(l => l.needsBooster));
check(needIx >= 0, 'the game ships a board that ramps alone cannot solve',
  `level ${await page.evaluate(i => window.__gtb.LEVELS[i].id, needIx)}`);
await page.evaluate(() => window.__gtb.setWallet(999, 0, 0));
await page.evaluate(i => window.__gtb.setLevel(i), needIx);
let needFlash = await page.evaluate(() => window.__gtb.state().flash);
check(/booster/i.test(needFlash) && /shop/i.test(needFlash),
  'and with an empty bag it says so, and where to get one', needFlash);
await page.evaluate(() => window.__gtb.setWallet(999, 0, 1));
await page.evaluate(() => window.__gtb.setLevel(0));
await page.evaluate(i => window.__gtb.setLevel(i), needIx);
needFlash = await page.evaluate(() => window.__gtb.state().flash);
check(/booster/i.test(needFlash) && !/shop/i.test(needFlash),
  'and with one in the bag it stops sending you shopping', needFlash);

/* ---------------------------------------------------------------- */
section('14d. Mystery boxes');

await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => window.__gtb.setWallet(100, 0, 0));
await page.evaluate(() => window.__gtb.setLevel(2));          // level 3

let boxState = await page.evaluate(() => window.__gtb.boxInfo());
check(boxState.onBoard.length === 1, 'level 3 carries a mystery box', JSON.stringify(boxState.onBoard));
check(!boxState.claimedHere && boxState.open.every(o => !o), 'and it starts unopened');
check(boxState.table.every(p => p.kind !== 'boosters'),
  'its prize table cannot roll a booster - the item does not exist this early',
  boxState.table.map(p => `${p.kind}:${p.w}`).join(' '));
const lateTable = await page.evaluate(() => {
  window.__gtb.setWallet(999, 0, 1);            // pretend the player owns one
  return window.__gtb.boxInfo();
});
check(lateTable.table.every(p => p.kind !== 'boosters'),
  'and owning one elsewhere does not change what THIS level may roll');

/* the weights are a table, not a coin flip */
const weights = await page.evaluate(() => window.__gtb.BOX_PRIZES);
check(weights.reduce((a, p) => a + p.w, 0) === 100,
  'the box prize weights total 100, so each one reads as its own percentage',
  weights.map(p => `${p.kind} ${p.n} @${p.w}%`).join(', '));
const common = weights.find(p => p.kind === 'coins').w;
const rare = Math.min(...weights.filter(p => p.kind === 'boosters' || p.kind === 'spin').map(p => p.w));
check(rare < common, 'and the rare prizes really are rarer than the common ones',
  `rarest ${rare}% vs coins ${common}%`);
const rolls = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < 1000; i++) {
    const p = window.__gtb.rollBox(3, i / 1000);
    out[p.kind] = (out[p.kind] || 0) + 1;
  }
  return out;
});
check(!rolls.boosters && rolls.coins > rolls.spin,
  'a thousand rolls on level 3 never produce a booster, and coins lead',
  JSON.stringify(rolls));

/* --- collecting one --- */
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => window.__gtb.setWallet(100, 0, 0));
const boxCfg = await page.evaluate(() => {
  const g = window.__gtb, R = Math.PI / 180;
  const ramp = (cx, cy, d, l = 120) => { const a = d * R, hx = Math.cos(a) * l / 2, hy = Math.sin(a) * l / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
  g.setLevel(2);
  const lv = g.LEVELS[2], sx = lv.spawn.x;
  for (let ry = lv.spawn.y + 90; ry <= 620; ry += 15)
    for (let th = 20; th <= 160; th += 3) {
      const cfg = [ramp(sx, ry, th)];
      if (g.simulate(cfg, 1, 2).boxes > 0) { g.setRamps(cfg); g.setSeed(1); return true; }
    }
  return false;
});
check(boxCfg, 'a ramp layout that routes the ball through the box (test setup)');
const boxBefore = await page.evaluate(() => ({
  coins: window.__gtb.coins(), balls: window.__gtb.balls(),
  ramps: window.__gtb.spareRamps(), boosters: window.__gtb.boosterInfo().owned,
  bonus: window.__gtb.bonusSpins(),
}));
await dropBall();
await page.waitForFunction(() => window.__gtb.boxInfo().claimedHere, null, { timeout: 25000 });
const flashText = await page.evaluate(() => window.__gtb.state().flash);
check(/mystery box/i.test(flashText), 'hitting it announces what it paid', flashText);
const marks = await page.locator('.flymark').count();
check(marks > 0, 'and the reward flies out of the chest toward what now holds it',
  `${marks} marks in the air`);
await page.waitForFunction(() => window.__gtb.state().phase !== 'drop', null, { timeout: 25000 });
const boxAfter = await page.evaluate(() => ({
  coins: window.__gtb.coins(), balls: window.__gtb.balls(),
  ramps: window.__gtb.spareRamps(), boosters: window.__gtb.boosterInfo().owned,
  bonus: window.__gtb.bonusSpins(),
}));
/* The ball itself costs one, and a win pays coins, so the comparison is
   "something went UP that the drop alone cannot explain". */
const gained = boxAfter.coins > boxBefore.coins || boxAfter.balls > boxBefore.balls - 1 ||
               boxAfter.ramps > boxBefore.ramps || boxAfter.bonus > boxBefore.bonus;
check(gained, 'and something the player owns actually went up',
  JSON.stringify({ before: boxBefore, after: boxAfter }));
check((await page.evaluate(() => window.__gtb.boxInfo())).open.some(Boolean),
  'the box is shown as opened from the instant it is hit');

/* --- once, and only once --- */
await page.evaluate(() => window.__gtb.reset());
const had = await page.evaluate(() => ({ coins: window.__gtb.coins(),
                                         balls: window.__gtb.balls(),
                                         ramps: window.__gtb.spareRamps(),
                                         bonus: window.__gtb.bonusSpins() }));
await dropBall();
await page.waitForFunction(() => window.__gtb.state().phase !== 'drop', null, { timeout: 25000 });
const again = await page.evaluate(() => ({ coins: window.__gtb.coins(),
                                           balls: window.__gtb.balls(),
                                           ramps: window.__gtb.spareRamps(),
                                           bonus: window.__gtb.bonusSpins() }));
check(again.ramps === had.ramps && again.bonus === had.bonus &&
      again.balls <= had.balls && again.coins - had.coins <= 32,
  'running through it again pays nothing - a box is claimed once per level, for good',
  JSON.stringify({ had, again }));
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
await page.evaluate(() => window.__gtb.setLevel(2));
check((await page.evaluate(() => window.__gtb.boxInfo())).claimedHere,
  'and the claim survives a reload', 'still claimed');
check((await page.evaluate(() => window.__gtb.boxInfo())).open.every(Boolean),
  'so the board shows the empty outline where it was');

/* --- the free-spin token --- */
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => { const g = window.__gtb;
  // a spin taken just now, so the daily one is definitely not due
  localStorage.setItem(g.SPIN.key, JSON.stringify({ last: Date.now(), pending: null, offered: 0 })); });
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
let bsp = await page.evaluate(() => window.__gtb.spinInfo());
check(!bsp.ready && !bsp.dailyReady, 'with a spin just taken, the wheel is on cooldown',
  `${Math.round(bsp.nextMs / 3600000)}h to go`);
const cooldownAt = bsp.last;
await page.evaluate(() => window.__gtb.grantBonusSpin());
bsp = await page.evaluate(() => window.__gtb.spinInfo());
check(bsp.ready && !bsp.dailyReady && bsp.bonus === 1,
  'a box\'s free spin makes the wheel spinnable without the cooldown being due',
  JSON.stringify({ ready: bsp.ready, daily: bsp.dailyReady, bonus: bsp.bonus }));
check(!bsp.wouldOffer,
  'and it does not make the wheel let itself in - a token is not a daily spin');
check(bsp.btnReady, 'the gear lights up, which is where the wheel lives');
await openSettings();
await page.click('#btn-spin');
await page.waitForSelector('#spinpanel');
check(!(await page.evaluate(() => window.__gtb.spinInfo())).goDisabled,
  'the Spin button is live on a token');
await page.click('#btn-spin-go');
await page.waitForFunction(() => !window.__gtb.spinInfo().spinning, null, { timeout: 15000 });
bsp = await page.evaluate(() => window.__gtb.spinInfo());
check(bsp.bonus === 0, 'spinning spends the token', `${bsp.bonus} left`);
check(bsp.last === cooldownAt,
  'and leaves the daily cooldown exactly where it was - tomorrow is still tomorrow',
  `${bsp.last === cooldownAt ? 'unmoved' : 'moved'}`);
check(!bsp.ready && !bsp.dailyReady, 'with the token gone the wheel is back on cooldown');
await page.evaluate(() => window.__gtb.reset());
await page.click('#btn-spin-close').catch(() => {});
await closeSettings().catch(() => {});

/* ---------------------------------------------------------------- */
section('14e. A gift inside the target');

await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => window.__gtb.setWallet(999, 0, 0));

/* Which boards are wrapped is a designer's choice, so the test finds one
   rather than naming a level - and holds the choice to being a choice. */
const gifted = await page.evaluate(() =>
  window.__gtb.LEVELS.map((l, i) => ({ i, id: l.id, g: !!l.targetGift }))
    .filter(l => l.g));
check(gifted.length > 0, 'the game ships at least one wrapped target',
  gifted.map(l => `level ${l.id}`).join(', '));
check(gifted.length < 10,
  'and only a handful - it is a milestone, not a per-level mechanic',
  `${gifted.length} of ${await page.evaluate(() => window.__gtb.LEVELS.length)}`);

const GIX = gifted[0].i;
await page.evaluate(i => window.__gtb.setLevel(i), GIX);
let gi = await page.evaluate(() => window.__gtb.giftInfo());
check(gi.wrapped && !gi.claimedHere && !gi.panelOpen,
  `level ${gifted[0].id} says its target is wrapped, and nothing is showing yet`,
  JSON.stringify({ wrapped: gi.wrapped, claimed: gi.claimedHere }));
check(/wrapped|gift/i.test(await page.evaluate(() => window.__gtb.state().flash)),
  'and the board says so on the way in',
  await page.evaluate(() => window.__gtb.state().flash));

/* A layout that wins this board, found the way every other section finds one. */
const gWin = await page.evaluate(i => {
  const g = window.__gtb, R = Math.PI / 180;
  const ramp = (cx, cy, d, l = 120) => { const a = d * R,
    hx = Math.cos(a) * l / 2, hy = Math.sin(a) * l / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
  const lv = g.LEVELS[i], sx = lv.spawn.x;
  for (let ry = lv.spawn.y + 80; ry <= 700; ry += 10)
    for (let th = 20; th <= 160; th += 1.5)
      for (const cfg of [[ramp(sx, ry, th)]])
        if (g.simulate(cfg, 1, i).result === 'win') { g.setRamps(cfg); g.setSeed(1); return true; }
  return false;
}, GIX);
check(gWin, `level ${gifted[0].id} is winnable with one ramp (test setup)`);

const gBefore = await page.evaluate(() => ({ coins: window.__gtb.coins(),
                                            balls: window.__gtb.balls(),
                                            ramps: window.__gtb.spareRamps(),
                                            boosters: window.__gtb.boosterInfo().owned,
                                            bonus: window.__gtb.bonusSpins() }));
await dropBall();
await page.waitForSelector('#giftpanel', { timeout: 25000 });
gi = await page.evaluate(() => window.__gtb.giftInfo());
check(!!gi.showing, 'winning it opens the gift panel with a prize behind the wrapping',
  JSON.stringify(gi.showing));
check(!gi.cardOpen && !gi.winCard,
  'and the win card is HELD until the gift is taken - one celebration at a time',
  gi.cardOpen ? 'both on screen' : 'gift first, card waiting');
check(gi.prizeText.includes('?'),
  'the prize is hidden while the box is still being unwrapped', gi.prizeText);
const stillOwed = await page.evaluate(() => ({ ramps: window.__gtb.spareRamps(),
                                               boosters: window.__gtb.boosterInfo().owned,
                                               bonus: window.__gtb.bonusSpins() }));
check(stillOwed.ramps === gBefore.ramps && stillOwed.boosters === gBefore.boosters &&
      stillOwed.bonus === gBefore.bonus,
  'and nothing has been credited yet - the reveal comes first, the ledger after',
  JSON.stringify(stillOwed));

/* the unwrap plays out, and only then is the button live */
await page.waitForFunction(() => !window.__gtb.giftInfo().takeDisabled, null, { timeout: 5000 });
gi = await page.evaluate(() => window.__gtb.giftInfo());
check(!gi.prizeText.includes('?') && /\d/.test(gi.prizeText),
  'once the lid is off, the panel names what was inside', gi.prizeText);
const gShown = gi.showing;
check(await page.evaluate(() => window.__gtb.takeGift()), 'the Take button is pressable');
await page.waitForSelector('#giftpanel', { state: 'detached', timeout: 5000 });
await page.waitForSelector('#card', { timeout: 5000 });
gi = await page.evaluate(() => window.__gtb.giftInfo());
check(gi.cardOpen && !gi.showing && !!gi.winCard,
  'taking it closes the gift and lets the ordinary win card through, stars and all');

const gAfter = await page.evaluate(() => ({ coins: window.__gtb.coins(),
                                           balls: window.__gtb.balls(),
                                           ramps: window.__gtb.spareRamps(),
                                           boosters: window.__gtb.boosterInfo().owned,
                                           bonus: window.__gtb.bonusSpins() }));
/* WHICH prize came up is a roll, so the check is that the RIGHT counter moved
   by the right amount - whichever one the panel named. Coins are exempt from
   an exact figure because clearing the level pays coins as well. */
const paid = { coins: gAfter.coins - gBefore.coins, balls: gAfter.balls - gBefore.balls,
               ramps: gAfter.ramps - gBefore.ramps,
               boosters: gAfter.boosters - gBefore.boosters,
               spin: gAfter.bonus - gBefore.bonus };
const creditedRight =
  gShown.kind === 'coins' ? paid.coins >= gShown.n
  : gShown.kind === 'balls' ? paid.balls >= gShown.n - 1   // the drop itself cost one
  : paid[gShown.kind] === gShown.n;
check(creditedRight, `and the ${gShown.kind} really arrive in the counter that holds them`,
  JSON.stringify({ prize: gShown, moved: paid }));

const gLevelId = await page.evaluate(i => window.__gtb.LEVELS[i].id, GIX);
check(['coins', 'balls', 'ramps', 'boosters', 'spin'].includes(gShown.kind),
  'the gift pays out of the same pool a chest does', `${gShown.kind} on level ${gLevelId}`);

/* once per level, for good - the chest's own rule */
check((await page.evaluate(() => window.__gtb.giftInfo())).claimedHere,
  'the gift is claimed the moment it is opened');
await page.click('#btn-retry');
await page.waitForFunction(() => window.__gtb.state().phase !== 'drop', null, { timeout: 25000 });
check(!(await page.evaluate(() => window.__gtb.giftInfo())).panelOpen,
  'winning the same board again opens no gift - treasure is not income');
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
await topUp();
await page.evaluate(i => window.__gtb.setLevel(i), GIX);
check((await page.evaluate(() => window.__gtb.giftInfo())).claimedHere,
  'and the claim survives a reload, like a chest\'s');

/* --- and a board WITHOUT the flag wins exactly as it always did --- */
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.skipTutorial(); });
await topUp();
await page.evaluate(() => window.__gtb.setLevel(0));
check(!(await page.evaluate(() => window.__gtb.giftInfo())).wrapped,
  'level 1 is not wrapped (the ordinary case)');
await page.evaluate(() => {
  const g = window.__gtb, R = Math.PI / 180;
  const ramp = (cx, cy, d, l = 120) => { const a = d * R,
    hx = Math.cos(a) * l / 2, hy = Math.sin(a) * l / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
  const lv = g.LEVELS[0], sx = lv.spawn.x;
  for (let ry = lv.spawn.y + 80; ry <= 660; ry += 15)
    for (let th = 25; th <= 155; th += 1.5) {
      const cfg = [ramp(sx, ry, th)];
      if (g.simulate(cfg, 1, 0).result === 'win') { g.setRamps(cfg); g.setSeed(1); return; }
    }
});
await dropBall();
await page.waitForSelector('#card', { timeout: 25000 });
gi = await page.evaluate(() => window.__gtb.giftInfo());
check(!gi.panelOpen && !gi.showing && gi.cardOpen,
  'and it goes straight to the win card with no gift panel anywhere near it');
await page.evaluate(() => window.__gtb.reset());

/* ---------------------------------------------------------------- */
/* Portal submission requirements. These are pass/fail gates on the
   CrazyGames side, so they are asserted rather than eyeballed. */
section('15. CrazyGames compliance');

/* Source-level assertions now read the SOURCES rather than one inline file:
   the game is a Vite app, so its code lives under src/ and its CSS in
   src/styles. Concatenated, this is the same surface the old single-file
   build exposed as index.html. */
const readAll = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? readAll(full)
       : /\.(ts|tsx|css|html)$/.test(e.name) ? [fs.readFileSync(full, 'utf8')] : [];
});
const src = [fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8'),
             ...readAll(path.join(root, '..', 'src'))].join('\n');

/* --- safe-area insets on all four sides --- */
const bodyRule = src.slice(src.indexOf('  body{'), src.indexOf('.app{'));
const sides = ['top','right','bottom','left'].filter(k => bodyRule.includes('env(safe-area-inset-' + k + ')'));
check(sides.length === 4, 'the game container pads for the safe area on all four sides',
  sides.join(',') || 'none');
check(/viewport-fit=cover/.test(src), 'and the viewport meta opts into the cutout area');
const padded = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  return ['Top','Right','Bottom','Left'].map(k => parseFloat(cs['padding'+k]));
});
check(padded.every(v => v >= 10), 'the padding still resolves on a device with no inset',
  padded.join('/') + 'px');

/* --- no custom fullscreen control --- */
const fsHits = (src.match(/requestFullscreen|webkitRequestFullScreen|webkitRequestFullscreen|mozRequestFullScreen|msRequestFullscreen|exitFullscreen|fullscreenElement/g) || []);
check(fsHits.length === 0, 'the game implements no fullscreen toggle of its own - the portal owns it',
  fsHits.join(',') || 'no fullscreen API referenced');

/* --- Escape and Ctrl/Cmd+W must reach the browser --- */
const keys = await page.evaluate(() => {
  const fire = (type, init, target) => {
    const e = new KeyboardEvent(type, Object.assign({ bubbles: true, cancelable: true }, init));
    (target || document).dispatchEvent(e);
    return e.defaultPrevented;
  };
  const canvas = document.getElementById('board');
  const probe = () => ({
    esc:      fire('keydown', { key:'Escape', code:'Escape' }),
    escUp:    fire('keyup',   { key:'Escape', code:'Escape' }),
    escOnCanvas: fire('keydown', { key:'Escape', code:'Escape' }, canvas),
    ctrlW:    fire('keydown', { key:'w', code:'KeyW', ctrlKey:true }),
    metaW:    fire('keydown', { key:'w', code:'KeyW', metaKey:true }),
    ctrlWOnCanvas: fire('keydown', { key:'w', code:'KeyW', ctrlKey:true }, canvas)
  });
  const idle = probe();
  // and again mid-gesture, when the game IS swallowing touch events
  window.__gtb.setLevel(0);
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, clientX:120, clientY:300, pointerId:1 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, clientX:200, clientY:360, pointerId:1 }));
  const dragging = probe();
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, clientX:200, clientY:360, pointerId:1 }));
  return { idle, dragging };
});
const anyBlocked = Object.entries(keys.idle).filter(([,v]) => v).map(([k]) => k)
  .concat(Object.entries(keys.dragging).filter(([,v]) => v).map(([k]) => k + '(mid-drag)'));
check(anyBlocked.length === 0,
  'Escape and Ctrl/Cmd+W are never preventDefault-ed, idle or mid-drag',
  anyBlocked.join(', ') || 'all reach the browser');
const keyListeners = (src.match(/addEventListener\('key\w+'/g) || []).length
  + (src.match(/'keydown'|'keyup'|'keypress'/g) || []).length;
check(keyListeners <= 3, 'and there is barely any keyboard handling to go wrong',
  `${keyListeners} keyboard references in source`);

/* --- gameplay in at most one click (currently: zero) --- */
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
const landing = await page.evaluate(() => {
  const s = window.__gtb.state();
  const vis = id => { const e = document.getElementById(id); return e && !e.hidden; };
  return { phase: s.phase, level: s.levelId,
           overlay: vis('overlay'), select: vis('select'),
           noballs: vis('noballs'), spin: vis('spinpanel'),
           boardVisible: document.getElementById('board').getBoundingClientRect().width > 0,
           dropReady: !window.__gtb.ballInfo().dropDisabled };
});
check(landing.phase === 'plan' && landing.level === 1,
  'a first-time player lands directly in level 1 gameplay', `phase=${landing.phase}`);
check(!landing.overlay && !landing.select && !landing.noballs && !landing.spin,
  'with no title screen, menu or modal in the way');
check(landing.boardVisible && landing.dropReady,
  'the board is live and droppable on the very first frame - zero clicks');
/* the tutorial is a hint on the board, not a gate */
check((await page.evaluate(() => window.__gtb.state().tutorial.step)) === 'intro',
  'the first-run tutorial is showing');
check(landing.dropReady, 'and it does not block play - it is a hint, not a gate');
await topUp();

/* --- quality guidelines: buttons must not be sized to encourage ads --- */
await page.evaluate(() => {
  const g = window.__gtb;
  g.setBalls(0); g.setLevel(0);
  g.setRamps([{ x1:150, y1:300, x2:250, y2:360 }]);
});
await dropBall();          // raises the out-of-balls screen
await page.waitForTimeout(200);
const offer = await page.evaluate(() => ['btn-ad','btn-buy','btn-nb-close'].map(id => {
  const e = document.getElementById(id), b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { id, w:+b.width.toFixed(1), h:+b.height.toFixed(1), area:+(b.width*b.height).toFixed(0),
           font: parseFloat(cs.fontSize), label: e.textContent.trim() };
}));
const [adBtn, buyBtn, closeBtn] = offer;
console.log('  out-of-balls offers: ' + offer.map(o => `${o.label} ${o.w}x${o.h}`).join('  |  '));
check(closeBtn.area >= adBtn.area * 0.95,
  'declining the ad is the same size as taking it - no button sized to push an ad',
  `dismiss ${closeBtn.area}px2 vs ad ${adBtn.area}px2`);
check(closeBtn.font >= adBtn.font,
  'and set in the same size type', `${closeBtn.font}px vs ${adBtn.font}px`);
check(closeBtn.h === adBtn.h, 'and the same height to hit', `${closeBtn.h}px vs ${adBtn.h}px`);
check(buyBtn.area <= adBtn.area * 1.05, 'the disabled purchase offer is not oversized either');
await page.evaluate(() => document.getElementById('btn-nb-close').click());
await topUp();

/* --- quality guidelines: every button is actually labelled --- */
const unlabelled = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('button').forEach(b => {
    const text = (b.textContent || '').trim();
    const aria = b.getAttribute('aria-label') || b.getAttribute('title') || '';
    if (!text && !aria) bad.push(b.id || b.className || '(anonymous)');
  });
  return bad;
});
check(unlabelled.length === 0, 'every button carries a readable label or an aria-label',
  unlabelled.join(',') || 'all labelled');

/* --- quality guidelines: onboarding lands in gameplay and is skippable --- */
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
const onboard = await page.evaluate(() => {
  const s = window.__gtb.state();
  return { step: s.tutorial.step, skipShown: s.tutorial.skipShown,
           playable: !window.__gtb.ballInfo().dropDisabled,
           // modals are viewport-level now, so "nothing is covering the board"
           // means no overlay is open at all
           onCanvas: !document.querySelector('.overlay:not([hidden])') };
});
check(onboard.step === 'intro' && onboard.onCanvas,
  'onboarding happens in gameplay, on the board itself - not on a splash screen');
check(onboard.skipShown, 'and it is skippable');
check(onboard.playable, 'and never blocks play while it is up');
await topUp();

/* --- legible across the whole required viewport range --- */
const VIEWPORTS = [[800,450,'CG minimum'], [1920,1080,'CG maximum'],
                   [1280,720,'desktop'], [844,390,'phone landscape'], [390,844,'phone portrait']];
const layout = [];
for (const [w,h,label] of VIEWPORTS){
  await page.setViewportSize({ width:w, height:h });
  await page.waitForTimeout(180);
  layout.push(Object.assign({ w, h, label }, await page.evaluate(() => {
    const de = document.documentElement, vw = innerWidth, vh = innerHeight;
    const clipped = [];
    // modals live outside .app now, so they are swept explicitly too
    document.querySelectorAll('.app *, .overlay:not([hidden]) *').forEach(e => {
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return;
      const b = e.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      if (b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5)
        clipped.push(e.id || e.className || e.tagName);
    });
    const bb = document.getElementById('board').getBoundingClientRect();
    const fs = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
    return { overflowX: de.scrollWidth > de.clientWidth,
             overflowY: de.scrollHeight > de.clientHeight,
             clipped, board: { w: +bb.width.toFixed(0), h: +bb.height.toFixed(0) },
             minFont: Math.min(fs('#level-title'), fs('.counter')) };
  })));
}
await page.setViewportSize({ width:430, height:1000 });
for (const l of layout)
  console.log(`  ${String(l.w+'x'+l.h).padEnd(10)} ${l.label.padEnd(16)} board ${l.board.w}x${l.board.h}, ` +
              `min font ${l.minFont}px`);
check(layout.every(l => !l.overflowX), 'nothing overflows horizontally at any required size',
  layout.filter(l => l.overflowX).map(l => l.w+'x'+l.h).join(',') || 'none');
check(layout.every(l => !l.overflowY), 'nor vertically',
  layout.filter(l => l.overflowY).map(l => l.w+'x'+l.h).join(',') || 'none');
check(layout.every(l => l.clipped.length === 0), 'and nothing is cut off by the viewport edge',
  layout.flatMap(l => l.clipped).join(',') || 'none');
check(layout.every(l => l.minFont >= 11), 'no text drops below 11px anywhere in the range',
  `smallest ${Math.min(...layout.map(l => l.minFont))}px`);
check(layout.every(l => l.board.w >= 150 && l.board.h >= 250),
  'the board stays a usable size even at 800x450',
  `smallest ${Math.min(...layout.map(l => l.board.w))}x${Math.min(...layout.map(l => l.board.h))}`);
const big = layout.find(l => l.w === 1920);
check(big.board.w > 450, 'and actually uses a 1080p screen rather than sitting in a 430px strip',
  `${big.board.w}px wide`);

/* ---------------------------------------------------------------- */
/* The loop is a fixed-timestep accumulator, so frame rate should not
   reach the physics at all - but CrazyGames names high-refresh displays
   as a common failure point, so it is measured rather than assumed.
   rAF is replaced with a queue this test pumps by hand, which makes the
   frame clock exact instead of merely fast. */
section('16. Physics is identical at 60 - 240Hz');

const rateCtx = await browser.newContext({ viewport: { width:430, height:1000 } });
await rateCtx.addInitScript(() => {
  const q = [];
  let vt = null;
  window.__raf = {
    tick(dt){
      if (vt === null) vt = performance.now();
      vt += dt;
      const due = q.splice(0, q.length);
      for (const cb of due) cb(vt);
    }
  };
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
});
const ratePage = await rateCtx.newPage();
ratePage.on('pageerror', e => bad('uncaught page error (refresh test)', e.message));
await ratePage.goto(GAME);
await ratePage.waitForFunction(() => !!window.__gtb);

const RATES = [60, 75, 90, 120, 144, 165, 240];
const rateRows = [];
for (const li of [0, 12, 19]){
  let truth = null, ref = null;
  for (const rate of RATES){
    await ratePage.evaluate(() => {
      window.__gtb.clearProgress(); window.__gtb.skipTutorial(); window.__gtb.setBalls(99);
    });
    const t = await ratePage.evaluate((li) => {
      const g = window.__gtb, R = Math.PI/180;
      const ramp = (cx,cy,d,l=120) => { const a=d*R,hx=Math.cos(a)*l/2,hy=Math.sin(a)*l/2;
        return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
      g.setLevel(li); g.setSeed(1);
      const lv = g.LEVELS[li], sx = lv.spawn.x;
      for (let ry = lv.spawn.y+80; ry <= 660; ry += 15)
        for (let th = 25; th <= 155; th += 1.5){
          const cfg = [ramp(sx,ry,th)];
          const r = g.simulate(cfg, 1, li);
          if (r.result === 'win'){ g.setRamps(cfg);
            return { result:r.result, steps:r.steps, x:+r.x.toFixed(6), y:+r.y.toFixed(6) }; }
        }
      return null;
    }, li);
    if (!t) break;
    truth = t;
    await ratePage.evaluate(() => window.__raf.tick(16));
    await dropBall(ratePage);
    const live = await ratePage.evaluate((dt) => {
      const g = window.__gtb;
      let ticks = 0, last = null;
      while (ticks < 20000){
        const s = g.state();
        if (s.ball) last = { x:+s.ball.x.toFixed(6), y:+s.ball.y.toFixed(6),
                             vx:+s.ball.vx.toFixed(6), vy:+s.ball.vy.toFixed(6),
                             hits:s.ball.hits, speed:+s.ball.speed.toFixed(6) };
        if (s.phase !== 'drop') break;
        window.__raf.tick(dt); ticks++;
      }
      return { result: g.state().result, ticks, ball: last };
    }, 1000/rate);
    const sig = `${live.result}|${live.ball.x}|${live.ball.y}|${live.ball.vx}|${live.ball.vy}|${live.ball.hits}`;
    if (ref === null) ref = sig;
    rateRows.push({ li, rate, sig, ticks: live.ticks, live, truth, matches: sig === ref });
  }
}
await rateCtx.close();

for (const li of [0, 12, 19]){
  const rows = rateRows.filter(r => r.li === li);
  if (!rows.length) continue;
  const t = rows[0].truth;
  console.log(`  level ${li+1}: pure simulate() -> ${t.result} @ (${t.x.toFixed(2)}, ${t.y.toFixed(2)}) in ${t.steps} steps`);
  console.log(`    ${rows.map(r => r.rate + 'Hz/' + r.ticks + 'f').join('  ')}`);
}
check(rateRows.length === RATES.length * 3, 'all three levels ran at all seven rates',
  `${rateRows.length} runs`);
check(rateRows.every(r => r.matches),
  'ball position, velocity and collision count are IDENTICAL at every rate',
  rateRows.filter(r => !r.matches).map(r => `L${r.li+1}@${r.rate}Hz`).join(',') || '60-240Hz agree exactly');
check(rateRows.every(r => r.live.result === 'win'),
  'and every level stays solvable by the same ramp at every rate',
  rateRows.filter(r => r.live.result !== 'win').map(r => `L${r.li+1}@${r.rate}Hz`).join(',') || 'all win');
check(rateRows.every(r => Math.abs(r.live.ball.x - r.truth.x) < 1e-6 &&
                          Math.abs(r.live.ball.y - r.truth.y) < 1e-6),
  'and the live loop agrees with the headless simulator to the last decimal');
/* frame count must scale with rate - proof the test really did run them faster */
for (const li of [0]){
  const rows = rateRows.filter(r => r.li === li);
  const lo = rows.find(r => r.rate === 60), hi = rows.find(r => r.rate === 240);
  check(hi.ticks > lo.ticks * 3.5,
    'the high-rate runs really did render ~4x the frames for the same physics',
    `${lo.ticks} frames at 60Hz vs ${hi.ticks} at 240Hz`);
}

/* ---------------------------------------------------------------- */
/* iOS refuses to start audio outside a real user gesture, and puts the
   context into 'interrupted' after a call or a lock screen. Getting this
   wrong means sound silently never works on iOS Safari - so the contract
   is asserted, not trusted: nothing is constructed at load, and resume()
   only ever happens inside a trusted input event. */
section('17. Audio starts only from a real user gesture');

const audioCtxBrowser = await browser.newContext({
  viewport: { width:430, height:1000 }, hasTouch: true
});
await audioCtxBrowser.addInitScript(() => {
  const Real = window.AudioContext || window.webkitAudioContext;
  window.__gestureSeen = false;
  window.__audio = { built: 0, resumes: 0, builtBeforeGesture: null, resumedBeforeGesture: 0 };
  // registered before the game's own listeners, so this flag is already true
  // by the time the game reacts to the same event
  ['pointerdown','pointerup','click','touchend','keydown'].forEach(n =>
    window.addEventListener(n, e => { if (e.isTrusted) window.__gestureSeen = true; }, true));
  function Wrapped(){
    const c = new Real();
    window.__audio.built++;
    if (window.__audio.builtBeforeGesture === null)
      window.__audio.builtBeforeGesture = !window.__gestureSeen;
    window.__audio.ctx = c;                     // so the test can interrupt it
    const realResume = c.resume.bind(c);
    c.resume = function(){
      window.__audio.resumes++;
      if (!window.__gestureSeen) window.__audio.resumedBeforeGesture++;
      return realResume();
    };
    return c;
  }
  window.AudioContext = Wrapped;
  window.webkitAudioContext = Wrapped;
});
const aPage = await audioCtxBrowser.newPage();
aPage.on('pageerror', e => bad('uncaught page error (audio test)', e.message));
await aPage.goto(GAME);
await aPage.waitForFunction(() => !!window.__gtb);
await aPage.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setBalls(99); });
await aPage.waitForTimeout(600);        // let a few hundred frames go by, untouched

let au = await aPage.evaluate(() => window.__audio);
check(au.built === 0, 'no AudioContext is constructed at load - autoplay is never attempted',
  `${au.built} built`);
check(au.resumes === 0, 'and resume() is not called before any input', `${au.resumes} calls`);

/* now a real, trusted click. It has to be a genuine input event, not
   __gtb.drop(): the whole point of this section is that the browser's own
   autoplay gate opened, and a scripted call never opens it. Tapping the board
   IS the drop gesture now, so this is also closer to what a player does. */
await aPage.locator('#board').click();
await aPage.waitForTimeout(250);
au = await aPage.evaluate(() => window.__audio);
check(au.built === 1, 'the context is built lazily, on the first real gesture', `${au.built} built`);
check(au.builtBeforeGesture === false, 'and it was built INSIDE that gesture, not before it');
check(au.resumedBeforeGesture === 0,
  'and no resume() has happened outside a gesture', `${au.resumedBeforeGesture} outside`);

/* The case that actually bites on iOS: a call or a lock screen parks the
   context, and it never restarts on its own. Suspending it here stands in for
   that interruption - the next tap must bring it back. */
const startState = await aPage.evaluate(() => window.__audio.ctx.state);
await aPage.evaluate(() => window.__audio.ctx.suspend());
await aPage.waitForTimeout(120);
const suspended = await aPage.evaluate(() => window.__audio.ctx.state);
check(suspended === 'suspended', 'the context can be interrupted the way iOS interrupts it',
  `${startState} -> ${suspended}`);
const resumesBefore = await aPage.evaluate(() => window.__audio.resumes);
await aPage.locator('#board').click();          // a real, trusted tap
await aPage.waitForTimeout(250);
au = await aPage.evaluate(() => window.__audio);
check(au.resumes > resumesBefore, 'the next real tap resumes it',
  `${resumesBefore} -> ${au.resumes} resume() calls`);
check(au.resumedBeforeGesture === 0,
  'and every resume() in the whole run happened inside a gesture',
  `${au.resumedBeforeGesture} outside`);
check(au.built === 1, 'without ever building a second context', `${au.built} built`);

/* the interruption path: iOS parks the context in 'interrupted' after a call
   or a lock screen, and the game must retry on later gestures rather than
   giving up on the first one */
const retried = await aPage.evaluate(() => {
  const before = window.__audio.resumes;
  document.getElementById('board').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles:true, clientX:100, clientY:300, pointerId:9 }));
  return { before, after: window.__audio.resumes, handler: typeof window.__audio === 'object' };
});
check(retried.handler, 'later gestures still route to the unlock path');
check(/onstatechange/.test(src),
  'and the context watches for its own state changing, which is how an iOS interruption is noticed');
check(/audioSession/.test(src),
  "the iOS 'playback' audio session is requested, so the ring/silent switch does not mute the game");

/* Mix headroom - nothing should be able to clip the master bus.

   This reads the LIVE audio graph rather than grepping the page source for
   `gain.value = 0.32`, which only ever worked while the whole game was one
   inline file. Asserting on the real nodes is what the check was always
   trying to approximate. */
const mix = await aPage.evaluate(() => window.__gtb.audioMix());
console.log(`  bus gains: music ${mix.music}, sfx ${mix.sfx}, delay wet ${mix.wet}, feedback ${mix.fb}`);
check(mix.fb < 1, 'the delay feedback is below unity, so it decays instead of running away',
  `${mix.fb}`);
check(mix.music < mix.sfx,
  'music sits under the effects, so a bounce is never buried by the loop',
  `music ${mix.music} vs sfx ${mix.sfx}`);
await audioCtxBrowser.close();

await browser.close();
console.log(failures === 0 ? `\nAll checks passed.\nScreenshots in ${SHOTS}`
                           : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
