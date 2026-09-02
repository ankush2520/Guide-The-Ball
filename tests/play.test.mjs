/**
 * Guide the Ball - Playwright suite.   node tests/play.test.mjs
 *
 * Covers boot, level data integrity, WALL physics (walls must really block),
 * obstacle bounce quality, the constant-speed invariant, render interpolation,
 * progression + localStorage, and the drawing UI on mouse and touch.
 * Re-run after ANY change to physics constants or level coordinates.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));
const GAME = pathToFileURL(path.join(root, '..', 'index.html')).href;
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
await page.goto(GAME);
await page.waitForFunction(() => !!window.__gtb);
await page.evaluate(() => { window.__gtb.clearProgress(); window.__gtb.setLevel(0); });

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
check((await page.locator('#level-title').textContent()).includes('First Drop'), 'level 1 title shown');
const legend = await page.locator('.legend').textContent();
check(['Target','Obstacle','Wall','ramp'].every(w => legend.includes(w)),
  'legend names target, obstacle, wall and ramp in words');
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'level-01.png') });
ok('screenshot: level-01.png');

/* ---------------------------------------------------------------- */
section('2. Level data structure');
const lvinfo = await page.evaluate(() => {
  const { LEVELS, CONSTS } = window.__gtb;
  const TYPES = ['OPEN','SIDE_WALL','POCKET','NARROW_GAP','ENCLOSED'];
  let badId=0, badType=0, outOfBoard=0, badBlocks=0;
  LEVELS.forEach((l, i) => {
    if (l.id !== i+1) badId++;
    if (TYPES.indexOf(l.targetType) < 0) badType++;
    if (l.maxBlocks < 1 || l.maxBlocks > 3) badBlocks++;
    const t = l.target;
    if (t.x < 0 || t.x + t.w > CONSTS.W || t.y < 0 || t.y + t.h > CONSTS.H) outOfBoard++;
    if (l.spawn.x < 0 || l.spawn.x > CONSTS.W) outOfBoard++;
    l.obstacles.forEach(o => {
      if (o.x - o.r < 0 || o.x + o.r > CONSTS.W || o.y - o.r < 0) outOfBoard++;
    });
  });
  return { n: LEVELS.length, badId, badType, outOfBoard, badBlocks,
           blocks: LEVELS.map(l => l.maxBlocks), obst: LEVELS.map(l => l.obstacles.length) };
});
console.log(`  ${lvinfo.n} levels; maxBlocks [${lvinfo.blocks}]  obstacles [${lvinfo.obst}]`);
check(lvinfo.badId === 0, 'level ids are sequential from 1');
check(lvinfo.badType === 0, 'every targetType is one of the five');
check(lvinfo.badBlocks === 0, 'maxBlocks in range');
check(lvinfo.outOfBoard === 0, 'spawns, targets and obstacles are inside the board');
check(String(lvinfo.blocks) === '1,1,1,2,2', 'Act 1 ramp budgets match the design (1,1,1,2,2)');
check(String(lvinfo.obst) === '0,0,1,0,1', 'Act 1 obstacle counts match the design (0,0,1,0,1)');

/* ---------------------------------------------------------------- */
section('3. Walls are real physics, not decoration');
const wall = await page.evaluate(() => {
  const { LEVELS, simulate, buildWalls } = window.__gtb;
  const D=180/Math.PI, R=Math.PI/180;
  const ramp=(cx,cy,deg,len=120)=>{const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy};};
  const lv = LEVELS[0];
  const tc = { x: lv.target.x+lv.target.w/2, y: lv.target.y+lv.target.h/2 };
  const origSpawn = lv.spawn.x, origType = lv.targetType, origWalls = lv.walls;

  // APPROACH A - straight down the middle, no ramps at all (spawn moved over
  // the target). This is the "drop it into the cup" approach.
  // APPROACH B - deflected in from the left at a shallow angle by one ramp.
  const shallowRy = 560;
  const phi = Math.atan2(tc.y - shallowRy, tc.x - origSpawn) * D;
  const sideCfg = [ramp(origSpawn, shallowRy, (phi + 90) / 2)];
  const sideDeg = Math.abs(Math.atan2(tc.x - origSpawn, tc.y - shallowRy) * D);

  const probe = () => {
    lv.spawn.x = tc.x;
    const vertical = simulate([], 1, 0);
    lv.spawn.x = origSpawn;
    const side = simulate(sideCfg, 1, 0);
    return { vertical: vertical.result, side: side.result,
             sMin: side.spdMin, sMax: side.spdMax };
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
check(Math.abs(e.sMin - C.SPEED) < 1e-9 && Math.abs(e.sMax - C.SPEED) < 1e-9,
  'speed is unchanged across wall bounces', `${e.sMin} .. ${e.sMax}`);

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
section('5. Speed is constant after every collision, on every level');
const inv = await page.evaluate(() => {
  const { LEVELS, simulate, CONSTS } = window.__gtb;
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=110) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  let rnd = 4242; const rand = () => (rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff;
  let worst = 0, runs = 0, bounces = 0;
  for (let li = 0; li < LEVELS.length; li++)
    for (let i = 0; i < 1200; i++){
      const cfg = [];
      for (let k = 0; k < LEVELS[li].maxBlocks; k++)
        cfg.push(ramp(30+rand()*420, 120+rand()*520, -85+rand()*170, 60+rand()*90));
      const o = simulate(cfg, 1 + (i%64), li);
      runs++; bounces += o.hits;
      worst = Math.max(worst, Math.abs(o.spdMin-CONSTS.SPEED), Math.abs(o.spdMax-CONSTS.SPEED));
    }
  return { runs, bounces, worst, S: CONSTS.SPEED };
});
console.log(`  ${inv.runs} runs across all levels, ${inv.bounces} obstacle bounces`);
check(inv.worst < 1e-9, 'speed never deviates after ANY collision',
  `worst drift ${inv.worst.toExponential(2)}`);

/* ---------------------------------------------------------------- */
section('6. Live drop: constant speed + smooth rendering');
const best1 = await page.evaluate(() => {
  const { LEVELS, simulate } = window.__gtb;
  const D=180/Math.PI, R=Math.PI/180;
  const ramp=(cx,cy,deg,len=120)=>{const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy};};
  const lv=LEVELS[0], tc={x:lv.target.x+lv.target.w/2,y:lv.target.y+lv.target.h/2};
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
  document.getElementById('btn-drop').click();
  await new Promise(res => (function tick(){
    const s = g.state();
    if (s.phase !== 'drop') return res();
    if (s.ball){ speeds.push(s.ball.speed); draws.push({d:s.draw, a:{x:s.ball.px,y:s.ball.py}, b:{x:s.ball.x,y:s.ball.y}}); }
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
  return { n:speeds.length, min:Math.min(...speeds), max:Math.max(...speeds), offSeg, frozen, prestep,
           result: g.state().result };
}, best1);
console.log(`  ${live.n} frames, speed ${live.min.toFixed(4)} .. ${live.max.toFixed(4)} (target ${C.SPEED})`);
check(live.n > 20, 'sampled the drop', `${live.n} frames`);
check(Math.abs(live.min-C.SPEED) < 1e-6 && Math.abs(live.max-C.SPEED) < 1e-6,
  'speed never deviates during a live drop');
check(live.offSeg === 0, 'painted position always lies between the two physics states');
check(live.frozen === 0, 'ball never paints twice in the same spot once moving',
  `${live.frozen} frozen, ${live.prestep} pre-step frames ignored`);
check(live.result === 'win', 'the solution wins through the real UI');

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
check((await page.locator('#level-title').textContent()).includes('Long Reach'), 'level 2 title shown');
const stored = await page.evaluate(() => localStorage.getItem('gtb.progress.v1'));
check(stored && JSON.parse(stored).highest >= 1, 'progress persisted to localStorage', stored);
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
st = await page.evaluate(() => window.__gtb.state());
check(st.levelId === 2, 'progress survives a reload', `resumed at level ${st.levelId}`);

/* ---------------------------------------------------------------- */
section('8. Lose flow');
await page.evaluate(() => { window.__gtb.setLevel(0); window.__gtb.reset(); window.__gtb.setSeed(9); });
await page.locator('#btn-drop').click();
await page.waitForFunction(() => window.__gtb.state().phase === 'over', null, { timeout: 25000 });
st = await page.evaluate(() => window.__gtb.state());
check(st.result === 'out' || st.result === 'timeout', 'bare drop loses', `result=${st.result}`);
check((await page.locator('#ov-title').textContent()).includes('Missed'), 'lose title shown');
check(await page.locator('#btn-next').isHidden(), 'no Next button on a loss');
await page.locator('#btn-adjust').click();
check((await page.evaluate(() => window.__gtb.state())).phase === 'plan', 'Adjust returns to planning');

/* ---------------------------------------------------------------- */
section('9. Ramp drawing - mouse and touch');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });   // level 4: 2 ramps
const box = await page.locator('#board').boundingBox();
check(await page.locator('#ramps-left').textContent() === '2', 'level 4 shows a budget of 2');
await mouseDrag(box, { x:150, y:260 }, { x:250, y:330 });
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 1, 'mouse drag creates a ramp');
check(await page.locator('#ramps-left').textContent() === '1', 'counter drops to 1');
await mouseDrag(box, { x:300, y:430 }, { x:308, y:436 });
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 1, 'a too-short drag is ignored');
await page.locator('#btn-undo').click();
check((await page.evaluate(() => window.__gtb.state())).ramps.length === 0, 'Undo removes the last ramp');
check(await page.locator('#btn-undo').isDisabled(), 'Undo disables when there is nothing to undo');

const cdp = await context.newCDPSession(page);
await touchDrag(cdp, box, { x:140, y:280 }, { x:240, y:350 });
check((await page.evaluate(() => window.__gtb.state())).ramps.length === 1, 'touch drag creates a ramp');

section('10. Budget, clear, and lock during the drop');
await touchDrag(cdp, box, { x:140, y:430 }, { x:240, y:500 });
await touchDrag(cdp, box, { x:140, y:560 }, { x:240, y:630 });
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 2, "ramp budget caps at this level's maxBlocks", `got ${st.ramps.length}`);
check(await page.locator('#ramps-left').textContent() === '0', 'counter reads 0');
await page.locator('#btn-clear').click();
check((await page.evaluate(() => window.__gtb.state())).ramps.length === 0, 'Clear removes every ramp');
await page.locator('#btn-drop').click();
const locked = await page.evaluate(() => {
  const before = window.__gtb.state().ramps.length;
  const c = document.getElementById('board'), r = c.getBoundingClientRect();
  const ev = (t,x,y) => c.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:1,clientX:r.left+x,clientY:r.top+y}));
  ev('pointerdown',40,100); ev('pointermove',160,200); ev('pointerup',160,200);
  return { before, after: window.__gtb.state().ramps.length };
});
check(locked.after === locked.before, 'layout is locked once the ball drops');

await browser.close();
console.log(failures === 0 ? `\nAll checks passed.\nScreenshots in ${SHOTS}`
                           : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
