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
async function mouseTap(b, at){
  const a = P(b, at);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.up();
}
async function touchTap(cdp, b, at){
  const a = P(b, at);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:a.x,y:a.y}] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd',   touchPoints:[] });
}
/* mirrors deleteBtnAt() in the game: off the midpoint along the normal,
   flipped to whichever side keeps it on the board */
function delBtn(r){
  const mx=(r.x1+r.x2)/2, my=(r.y1+r.y2)/2, dx=r.x2-r.x1, dy=r.y2-r.y1;
  const m=Math.hypot(dx,dy)||1; const nx=-dy/m, ny=dx/m, OFF=32, R=12;
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
check((await page.locator('#level-title').textContent()).includes('First Drop'), 'level 1 title shown');
const legend = await page.locator('.legend').textContent();
check(['Target','Obstacle','Wall','ramp'].every(w => legend.includes(w)),
  'legend names target, obstacle, wall and ramp in words');
await page.locator('.app').screenshot({ path: path.join(SHOTS, 'level-01.png') });
ok('screenshot: level-01.png');

/* ---------------------------------------------------------------- */
section('2. Level data structure and position variety');
const lvinfo = await page.evaluate(() => {
  const { LEVELS, CONSTS } = window.__gtb;
  const TYPES = ['OPEN','SIDE_WALL','POCKET','NARROW_GAP','ENCLOSED'];
  let badId=0, badType=0, outOfBoard=0, overlap=0;
  LEVELS.forEach((l, i) => {
    if (l.id !== i+1) badId++;
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
    seen.forEach(q => { if (Math.hypot(q.x-l.target.x, q.y-l.target.y) < 30) tooClose++; });
    seen.push({x:l.target.x, y:l.target.y});
  });
  return { n: LEVELS.length, badId, badType, outOfBoard, overlap,
           blocks: LEVELS.map(l=>l.maxBlocks).join(','),
           obst:   LEVELS.map(l=>l.obstacles.length).join(','),
           types:  LEVELS.map(l=>l.targetType).join(','),
           moving: LEVELS.map((l,i)=>l.move?i+1:0).filter(Boolean).join(','),
           right, left, tooClose,
           ySpread: Math.max(...ys) - Math.min(...ys) };
});
const PLAN_BLOCKS = '1,1,1,2,2,2,1,3,2,2,2,2,3,2,3,2,3,2,3,3';
const PLAN_OBST   = '0,0,1,0,1,2,2,2,3,2,0,1,1,2,2,3,2,3,4,3';
const PLAN_TYPES  = 'OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,OPEN,' +
                    'SIDE_WALL,POCKET,NARROW_GAP,NARROW_GAP,ENCLOSED,OPEN,SIDE_WALL,NARROW_GAP,POCKET,ENCLOSED';
console.log(`  ${lvinfo.n} levels; ${lvinfo.right} reach right, ${lvinfo.left} reach left; ` +
            `target y spread ${lvinfo.ySpread}px`);
check(lvinfo.n === 20, 'all 20 levels present', `${lvinfo.n}`);
check(lvinfo.badId === 0, 'level ids are sequential from 1');
check(lvinfo.badType === 0, 'every targetType is one of the five');
check(lvinfo.outOfBoard === 0, 'spawns, targets and obstacles are inside the board');
check(lvinfo.overlap === 0, 'no obstacle sits on a target or blocks a spawn');
check(lvinfo.blocks === PLAN_BLOCKS, 'ramp budgets match the plan, drops at 7/14/18 intact');
check(lvinfo.obst === PLAN_OBST, 'obstacle counts match the plan');
check(lvinfo.types === PLAN_TYPES, 'target types match the plan');
check(lvinfo.moving === '17,19,20', 'only levels 17, 19 and 20 move', lvinfo.moving);
check(lvinfo.right >= 7 && lvinfo.left >= 7,
  'targets are reached both leftward and rightward', `${lvinfo.right}R / ${lvinfo.left}L`);
check(lvinfo.tooClose === 0, 'no two levels put the target in the same spot');
check(lvinfo.ySpread > 100, 'target height varies across levels', `${lvinfo.ySpread}px spread`);

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
section('3b. Moving targets: straight-line glide, no rotation');
const mv = await page.evaluate(() => {
  const { LEVELS, targetAt, buildWalls, simulate } = window.__gtb;
  const out = [];
  LEVELS.forEach((lv, li) => {
    if (!lv.move) return;
    const pts = lv.move.points, sp = lv.move.speed;
    const loopT = lv.move.total / sp;

    // (a) every sampled position must lie ON one of the waypoint segments
    let offPath = 0, speedErr = 0, corners = 0;
    let prev = targetAt(lv, 0);
    for (let k = 1; k <= 600; k++){
      const t = (k / 600) * loopT * 2;          // two full loops
      const p = targetAt(lv, t);
      let best = Infinity;
      for (let i = 0; i < pts.length; i++){
        const a = pts[i], b = pts[(i+1) % pts.length];
        const dx = b.x-a.x, dy = b.y-a.y, L2 = dx*dx + dy*dy;
        let u = L2 ? ((p.x-a.x)*dx + (p.y-a.y)*dy)/L2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        best = Math.min(best, Math.hypot(p.x - (a.x+u*dx), p.y - (a.y+u*dy)));
      }
      if (best > 0.01) offPath++;
      // (b) constant speed, except on the sample that straddles a corner
      const dt = (loopT * 2) / 600;
      const v = Math.hypot(p.x-prev.x, p.y-prev.y) / dt;
      if (Math.abs(v - sp) > sp * 0.02) { corners++; if (corners > pts.length*2 + 2) speedErr++; }
      prev = p;
    }

    // (c) walls must travel with the target as a rigid unit
    let rigid = true;
    if (lv.targetType !== 'OPEN'){
      const t1 = 0.3 * loopT, t2 = 0.7 * loopT;
      const c1 = targetAt(lv, t1), c2 = targetAt(lv, t2);
      const w1 = buildWalls(lv, c1), w2 = buildWalls(lv, c2);
      const dx = c2.x - c1.x, dy = c2.y - c1.y;
      if (w1.length !== w2.length) rigid = false;
      for (let i = 0; i < w1.length && rigid; i++)
        if (Math.abs((w2[i].x1 - w1[i].x1) - dx) > 1e-6 ||
            Math.abs((w2[i].y1 - w1[i].y1) - dy) > 1e-6 ||
            Math.abs((w2[i].x2 - w1[i].x2) - dx) > 1e-6 ||
            Math.abs((w2[i].y2 - w1[i].y2) - dy) > 1e-6) rigid = false;
    }
    out.push({ id: lv.id, pts: pts.length, span: Math.round(lv.move.total), speed: sp,
               loopT: +loopT.toFixed(2), offPath, speedErr, rigid });
  });
  return out;
});
for (const m of mv)
  console.log(`  L${m.id}: ${m.pts} waypoints, path ${m.span}px at ${m.speed}px/s ` +
              `(loop ${m.loopT}s), walls rigid=${m.rigid}`);
check(mv.length === 3, 'three moving levels');
check(mv.every(m => m.offPath === 0), 'target always sits exactly on a straight waypoint leg');
check(mv.every(m => m.speedErr === 0), 'target glides at constant speed between waypoints');
check(mv.every(m => m.rigid), 'attached walls translate rigidly with the target');
check(mv.find(m=>m.id===17).pts === 2 && mv.find(m=>m.id===19).pts === 2 &&
      mv.find(m=>m.id===20).pts === 3, 'L17/L19 use two waypoints, L20 uses three');
check(mv.find(m=>m.id===19).span > mv.find(m=>m.id===17).span &&
      mv.find(m=>m.id===19).speed > mv.find(m=>m.id===17).speed,
  'L19 moves further AND faster than L17');
check(mv.find(m=>m.id===20).span > mv.find(m=>m.id===19).span,
  'L20 has the longest path of the three');

/* ---------------------------------------------------------------- */
section('3c. Moving targets: solutions must lead the target');
const lead = await page.evaluate(() => {
  const { LEVELS, simulate, targetAt, CONSTS } = window.__gtb;
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=120) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  const out = [];
  LEVELS.forEach((lv, li) => {
    if (!lv.move) return;
    const loopT = lv.move.total / lv.move.speed;
    const seeds = lv.obstacles.length ? [1,2,3] : [1];
    let found = null;
    for (let k = 0; k < 16 && !found; k++){
      const t0 = (k/16) * loopT;
      for (let ry = lv.spawn.y+80; ry <= CONSTS.H-130 && !found; ry += 15)
        for (let th = 25; th <= 155; th += 1.5){
          const cfg = [ramp(lv.spawn.x, ry, th)];
          const r0 = simulate(cfg, seeds[0], li, t0);
          if (r0.result === 'win' && seeds.every(s => simulate(cfg,s,li,t0).result === 'win')){
            found = { cfg, t0, secs: r0.secs, land: {x:r0.x, y:r0.y} }; break;
          }
        }
    }
    if (!found){ out.push({ id: lv.id, found: false }); return; }
    const pDrop   = targetAt(lv, found.t0);
    const pArrive = targetAt(lv, found.t0 + found.secs);
    // hold the ramp, sweep the drop moment: how often does it still score?
    let w = 0, n = 24;
    for (let k = 0; k < n; k++)
      if (seeds.every(s => simulate(found.cfg, s, li, (k/n)*loopT).result === 'win')) w++;
    out.push({ id: lv.id, found: true,
      flight: +found.secs.toFixed(2),
      travel: Math.round(Math.hypot(pArrive.x-pDrop.x, pArrive.y-pDrop.y)),
      distToArrive: Math.round(Math.hypot(found.land.x-pArrive.x, found.land.y-pArrive.y)),
      distToDrop:   Math.round(Math.hypot(found.land.x-pDrop.x,   found.land.y-pDrop.y)),
      r: lv.target.r, timingWin: w/n });
  });
  return out;
});
for (const l of lead){
  if (!l.found){ bad(`L${l.id}: no timed solution found`); continue; }
  console.log(`  L${l.id}: flight ${l.flight}s, target travels ${l.travel}px during it; ` +
              `ball lands ${l.distToArrive}px from its ARRIVAL position ` +
              `(${l.distToDrop}px from where it was at drop). Wins at ${(l.timingWin*100).toFixed(0)}% of drop times.`);
}
check(lead.every(l => l.found), 'every moving level has a verified timed solution');
check(lead.every(l => l.distToArrive <= l.r),
  'the ball lands on the target where it ACTUALLY IS at arrival');
check(lead.every(l => l.travel > 10),
  'the target really does move during the flight', lead.map(l=>l.travel+'px').join(', '));
check(lead.every(l => l.timingWin < 0.95),
  'drop timing genuinely matters - the same ramp fails at other moments');

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
const inv = await page.evaluate(() => {
  const { LEVELS, simulate, CONSTS } = window.__gtb;
  const R = Math.PI/180;
  const ramp = (cx,cy,deg,len=110) => { const a=deg*R,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy}; };
  let rnd = 4242; const rand = () => (rnd=(rnd*1103515245+12345)&0x7fffffff)/0x7fffffff;
  let overSpeed = 0, overVy = 0, runs = 0, bounces = 0, segs = 0;
  let peak = 0, peakVy = 0, varied = 0;
  for (let li = 0; li < LEVELS.length; li++)
    for (let i = 0; i < 1200; i++){
      const cfg = [];
      for (let k = 0; k < LEVELS[li].maxBlocks; k++)
        cfg.push(ramp(30+rand()*420, 120+rand()*520, -85+rand()*170, 60+rand()*90));
      const o = simulate(cfg, 1 + (i%64), li);
      runs++; bounces += o.hits; segs += o.segHits;
      if (o.spdMax > CONSTS.MAX_SPEED + 1e-9) overSpeed++;
      if (o.vyMax  > CONSTS.TERMINAL_VY + 1e-9) overVy++;
      if (o.spdMax - o.spdMin > 1e-6) varied++;
      peak   = Math.max(peak, o.spdMax);
      peakVy = Math.max(peakVy, o.vyMax);
    }
  return { runs, bounces, segs, overSpeed, overVy, peak, peakVy, varied,
           cap: CONSTS.MAX_SPEED, term: CONSTS.TERMINAL_VY };
});
console.log(`  ${inv.runs} runs, ${inv.bounces} obstacle + ${inv.segs} segment bounces; ` +
            `peak speed ${inv.peak.toFixed(2)}/${inv.cap.toFixed(2)}, peak vy ${inv.peakVy.toFixed(2)}/${inv.term}`);
check(inv.overSpeed === 0, 'speed never exceeds the cap on any level', `${inv.overSpeed} runs over`);
check(inv.overVy === 0, 'vy never exceeds TERMINAL_VY', `${inv.overVy} runs over`);
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
  document.getElementById('btn-drop').click();
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
check((await page.locator('#level-title').textContent()).includes('Long Reach'), 'level 2 title shown');
const stored = await page.evaluate(() => localStorage.getItem('gtb.progress.v1'));
check(stored && JSON.parse(stored).highest >= 1, 'progress persisted to localStorage', stored);
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
st = await page.evaluate(() => window.__gtb.state());
check(st.levelId === 2, 'progress survives a reload', `resumed at level ${st.levelId}`);

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
await page.locator('#btn-drop').click();
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
check(!(await page.locator('#btn-drop').isDisabled()), 'Drop Ball is immediately usable again');
check(await boardBox() === geoIdle, 'the label does not shift the board', await boardBox());

/* the stuck case: a dead-flat ramp under the spawn, which the stall watch calls */
await page.evaluate(() => {
  const g = window.__gtb, sx = g.LEVELS[0].spawn.x;
  g.reset(); g.setSeed(9);
  g.setRamps([{ x1: sx-70, y1: 420, x2: sx+70, y2: 420 }]);
});
await page.locator('#btn-drop').click();
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

section('10b. Editing a placed ramp');
await page.evaluate(() => { window.__gtb.setLevel(3); window.__gtb.reset(); });  // level 4: 2 ramps
await mouseDrag(box, { x:150, y:280 }, { x:260, y:350 });
st = await page.evaluate(() => window.__gtb.state());
const placed = st.ramps[0];
check(st.ramps.length === 1 && st.selected === -1, 'a freshly drawn ramp starts unselected');

/* --- select by tapping the ramp body --- */
await mouseTap(box, { x:(placed.x1+placed.x2)/2, y:(placed.y1+placed.y2)/2 });
st = await page.evaluate(() => window.__gtb.state());
check(st.selected === 0, 'tapping a placed ramp selects it', `selected=${st.selected}`);

/* --- drag an ENDPOINT: the stored position must actually change --- */
const before2 = { ...st.ramps[0] };
await mouseDrag(box, { x:before2.x2, y:before2.y2 }, { x:before2.x2 - 70, y:before2.y2 + 55 });
st = await page.evaluate(() => window.__gtb.state());
const after2 = st.ramps[0];
const movedEnd = Math.hypot(after2.x2-before2.x2, after2.y2-before2.y2);
const anchorHeld = Math.hypot(after2.x1-before2.x1, after2.y1-before2.y1);
const angBefore = Math.atan2(before2.y2-before2.y1, before2.x2-before2.x1)*180/Math.PI;
const angAfter  = Math.atan2(after2.y2-after2.y1, after2.x2-after2.x1)*180/Math.PI;
console.log(`  endpoint drag: (${before2.x2.toFixed(0)},${before2.y2.toFixed(0)}) -> ` +
  `(${after2.x2.toFixed(0)},${after2.y2.toFixed(0)}); angle ${angBefore.toFixed(0)}° -> ${angAfter.toFixed(0)}°`);
check(movedEnd > 40, "dragging a handle moves that end of the ramp", `moved ${movedEnd.toFixed(1)}px`);
check(anchorHeld < 1e-6, 'the other end stays put', `drifted ${anchorHeld.toFixed(3)}px`);
check(Math.abs(angAfter - angBefore) > 15, 'which rotates the ramp',
  `${Math.abs(angAfter-angBefore).toFixed(0)}° of rotation`);
const lenAfter = Math.hypot(after2.x2-after2.x1, after2.y2-after2.y1);
check(lenAfter >= C.MIN_RAMP - 1e-6 && lenAfter <= C.MAX_RAMP + 1e-6,
  'an edited ramp stays inside the drawable length limits', `${lenAfter.toFixed(1)}px`);

/* --- drag the MIDDLE: translates without changing angle or length --- */
const before3 = { ...st.ramps[0] };
const mid3 = { x:(before3.x1+before3.x2)/2, y:(before3.y1+before3.y2)/2 };
await mouseDrag(box, mid3, { x: mid3.x + 55, y: mid3.y + 45 });
st = await page.evaluate(() => window.__gtb.state());
const after3 = st.ramps[0];
const d1 = Math.hypot(after3.x1-before3.x1, after3.y1-before3.y1);
const d2 = Math.hypot(after3.x2-before3.x2, after3.y2-before3.y2);
const lenB = Math.hypot(before3.x2-before3.x1, before3.y2-before3.y1);
const lenA = Math.hypot(after3.x2-after3.x1, after3.y2-after3.y1);
check(d1 > 40 && Math.abs(d1-d2) < 1e-6, 'dragging the middle translates the whole ramp',
  `both ends moved ${d1.toFixed(1)}px`);
check(Math.abs(lenA-lenB) < 1e-6, 'a translation changes neither length nor angle');

/* --- tapping empty board space deselects --- */
await mouseTap(box, { x:60, y:700 });
check((await page.evaluate(() => window.__gtb.state())).selected === -1,
  'tapping empty board space deselects');

/* --- the x button deletes just that ramp and frees its slot --- */
await mouseDrag(box, { x:120, y:560 }, { x:230, y:620 });      // a second ramp
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 2, 'two ramps placed', `${st.ramps.length}`);
check(await page.locator('#ramps-left').textContent() === '0', 'budget is spent');
const keep = JSON.stringify(st.ramps[1]);
await mouseTap(box, { x:(st.ramps[0].x1+st.ramps[0].x2)/2, y:(st.ramps[0].y1+st.ramps[0].y2)/2 });
st = await page.evaluate(() => window.__gtb.state());
check(st.selected === 0, 'the first ramp is selected for deletion');
await mouseTap(box, delBtn(st.ramps[0]));
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 1, 'the x button removes exactly one ramp', `${st.ramps.length} left`);
check(JSON.stringify(st.ramps[0]) === keep, 'the other ramp is untouched');
check(st.selected === -1, 'selection clears after a delete');
check(await page.locator('#ramps-left').textContent() === '1', 'the freed slot returns to the counter');
await mouseDrag(box, { x:300, y:420 }, { x:400, y:480 });
check((await page.evaluate(() => window.__gtb.state())).ramps.length === 2,
  'the freed slot can be drawn into again');

/* --- and all of it works on touch --- */
await page.evaluate(() => { window.__gtb.reset(); });
await touchDrag(cdp, box, { x:150, y:280 }, { x:260, y:350 });
st = await page.evaluate(() => window.__gtb.state());
const t0 = { ...st.ramps[0] };
await touchTap(cdp, box, { x:(t0.x1+t0.x2)/2, y:(t0.y1+t0.y2)/2 });
check((await page.evaluate(() => window.__gtb.state())).selected === 0, 'touch tap selects a ramp');
await touchDrag(cdp, box, { x:t0.x1, y:t0.y1 }, { x:t0.x1-60, y:t0.y1+45 });
st = await page.evaluate(() => window.__gtb.state());
check(Math.hypot(st.ramps[0].x1-t0.x1, st.ramps[0].y1-t0.y1) > 30,
  'touch drag moves an endpoint');
await touchTap(cdp, box, delBtn(st.ramps[0]));
st = await page.evaluate(() => window.__gtb.state());
check(st.ramps.length === 0 && st.selected === -1, 'touch tap on x deletes the ramp');
check(await page.locator('#ramps-left').textContent() === '2', 'counter restored after touch delete');

/* --- editing is locked once the ball is in flight --- */
await touchDrag(cdp, box, { x:150, y:280 }, { x:260, y:350 });
await page.evaluate(() => window.__gtb.select(0));
await page.locator('#btn-drop').click();
st = await page.evaluate(() => window.__gtb.state());
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
await page.locator('#level-title').click();
check(await page.locator('#select').isVisible(), 'tapping the level name opens the picker');
let grid = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#lvgrid button')];
  return { n: b.length, locked: b.filter(x => x.disabled).length,
           labels: b.map(x => x.textContent).join(',') };
});
check(grid.n === 20, 'picker shows all 20 levels', `${grid.n}`);
check(grid.locked === 19, 'everything past your best is locked', `${grid.locked} locked`);
check(await page.locator('#lvgrid button').nth(4).isDisabled(), 'level 5 locked on a fresh save');

// unlock a few and re-open
await page.evaluate(() => { window.__gtb.setLevel(0);
  for (let i = 0; i <= 6; i++) window.__gtb.setLevel(i); });
await page.locator('#btn-close-sel').click();
await page.locator('#level-title').click();
grid = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#lvgrid button')];
  return { locked: b.filter(x => x.disabled).length };
});
check(grid.locked === 13, 'reaching level 7 unlocks the first seven', `${grid.locked} locked`);
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
const tbox = await page.locator('#board').boundingBox();
const tut = () => page.evaluate(() => window.__gtb.state().tutorial);

let T = await tut();
check(T.step === 1, 'a brand-new player lands on step 1', `step=${T.step}`);
check(T.seen === false, 'the tutorialSeen flag starts unset');
check(await page.locator('#btn-skip').isVisible(), 'Skip is offered');
check(!T.dropPulsing, 'the Drop Ball highlight is NOT up yet');

/* the mimed drag has to actually be animating, not a static picture */
const h1 = (await tut()).handT;
await page.waitForTimeout(420);
const h2 = (await tut()).handT;
check(h1 !== h2, 'the demo fingertip is animating', `${h1.toFixed(3)} -> ${h2.toFixed(3)}`);

/* placing a ramp anywhere - NOT on the demo path - must satisfy step 1 */
await mouseDrag(tbox, { x:300, y:250 }, { x:400, y:330 });
T = await tut();
check((await page.evaluate(() => window.__gtb.state().ramps.length)) === 1, 'a ramp went down');
check(T.step === 2, 'step 1 clears the moment a ramp is placed', `step=${T.step}`);
check(T.dropPulsing, 'step 2 highlights Drop Ball');
check(await page.locator('#btn-drop').evaluate(el => el.classList.contains('tut-pulse')),
  'the highlight is a class on the real button');
check((await page.locator('#hint').textContent()) === 'Tap Drop Ball when ready.',
  'step 2 names the button');
check(T.seen === false, 'the flag stays unset until Drop Ball is pressed');

/* undoing that ramp must send the mime back, and restart it */
await page.locator('#btn-undo').click();
T = await tut();
check(T.step === 1, 'undoing the ramp returns to step 1', `step=${T.step}`);
const h3 = (await tut()).handT;
await page.waitForTimeout(420);
check((await tut()).handT !== h3, 'the mime restarts after an undo');

await mouseDrag(tbox, { x:300, y:250 }, { x:400, y:330 });
await page.locator('#btn-drop').click();
T = await tut();
check(T.step === 0, 'the tutorial ends when Drop Ball is pressed', `step=${T.step}`);
check(T.seen === true, 'tutorialSeen is set on completion');
check(await page.locator('#btn-skip').isHidden(), 'Skip goes away with it');
check(!(await page.locator('#btn-drop').evaluate(el => el.classList.contains('tut-pulse'))),
  'the Drop Ball highlight is removed');
const savedFlag = await page.evaluate(() => JSON.parse(localStorage.getItem('gtb.progress.v1')||'{}'));
check(savedFlag.tutorialSeen === true, 'the flag is persisted alongside `highest`',
  JSON.stringify(savedFlag));
check(tutErrors.length === 0, 'no page errors during the tutorial', tutErrors.join(' | '));

/* --- and it must never come back --- */
await page.waitForFunction(() => window.__gtb.state().phase === 'plan', null, { timeout: 25000 });
await page.reload();
await page.waitForFunction(() => !!window.__gtb);
T = await tut();
check(T.step === 0, 'a reload does NOT bring the tutorial back', `step=${T.step}`);
check(await page.locator('#btn-skip').isHidden(), 'Skip stays gone after a reload');
check(!(await page.locator('#btn-drop').evaluate(el => el.classList.contains('tut-pulse'))),
  'no Drop Ball highlight after a reload');
await page.evaluate(() => { window.__gtb.setLevel(0); window.__gtb.reset(); });
check((await tut()).step === 0, 'replaying level 1 does not resurrect it');

/* --- step 3: the just-in-time obstacle tip, on the first obstacle ever --- */
await page.evaluate(() => {
  const g = window.__gtb;
  g.setLevel(2); g.reset(); g.setSeed(3);
  g.LEVELS[2].spawn.x = g.LEVELS[2].obstacles[0].x;   // drop straight onto it
});
check((await tut()).obstacleTipSeen === false, 'the obstacle tip has not fired yet');
await page.locator('#btn-drop').click();
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
check((await tut()).step === 1, 'a cleared save brings the tutorial back');
await page.locator('#btn-skip').click();
T = await tut();
check(T.step === 0 && T.seen === true, 'Skip marks it seen immediately');
check(T.obstacleTipSeen === true, 'Skip also suppresses the obstacle tip');
check(await page.locator('#btn-skip').isHidden(), 'Skip removes itself');

await browser.close();
console.log(failures === 0 ? `\nAll checks passed.\nScreenshots in ${SHOTS}`
                           : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
