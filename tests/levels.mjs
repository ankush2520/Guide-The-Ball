/**
 * Per-level design harness.   node tests/levels.mjs [first] [last]
 *
 * For every level:
 *   winnable?   - exhaustive scan of single-ramp placements (ramp height x angle),
 *                 falling back to a constructed 2-ramp route. Walls and obstacles
 *                 are handled because every candidate runs in the REAL simulator.
 *   precision?  - widest contiguous band of winning ramp angles at one height.
 *   trivial?    - win rate of blind random placements.
 */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LO = Number(process.argv[2] ?? 0), HI = Number(process.argv[3] ?? 19);

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => !!window.__gtb);

const report = await page.evaluate(([lo, hi]) => {
  const { LEVELS, simulate, CONSTS } = window.__gtb;
  const D = 180/Math.PI, R = Math.PI/180;
  const ramp = (cx, cy, deg, len=120) => {
    const a = deg*R, hx = Math.cos(a)*len/2, hy = Math.sin(a)*len/2;
    return { x1:cx-hx, y1:cy-hy, x2:cx+hx, y2:cy+hy };
  };
  const RY_STEP = 15, TH_STEP = 1.5, TH_LO = 25, TH_HI = 155;

  const out = [];
  for (let li = lo; li <= hi; li++){
    const lv = LEVELS[li];
    const sx = lv.spawn.x;
    const seeds = lv.obstacles.length ? [1,2,3,4,5,6,7] : [1];
    const wins = (cfg) => seeds.every(s => simulate(cfg, s, li).result === 'win');

    /* ---- exhaustive single-ramp scan ---- */
    let best = { tol: 0 }, total1 = 0;
    for (let ry = lv.spawn.y + 80; ry <= CONSTS.H - 130; ry += RY_STEP){
      let run = 0, runStart = null;
      for (let th = TH_LO; th <= TH_HI; th += TH_STEP){
        if (simulate([ramp(sx, ry, th)], seeds[0], li).result === 'win'){
          if (run === 0) runStart = th;
          run += TH_STEP; total1++;
          if (run > best.tol && wins([ramp(sx, ry, runStart + run/2)]))
            best = { tol: run, ry, th: runStart + run/2 };
        } else run = 0;
      }
    }

    /* ---- constructed 2-ramp route (used when one ramp is not enough) ---- */
    let sols2 = 0, tol2 = 0, best2cfg = null;
    if (lv.maxBlocks >= 2){
      const tc = lv.target;
      // the envelope has to reach low and wide: a pocket mouth can sit near the
      // floor, and the second ramp must be able to get there
      // The second ramp is aimed at the target along a straight line, but the
      // ball arcs under gravity - so sweep a band of offsets around that aim
      // instead of trusting it. AIMS is what makes this a search and not a
      // guess, and it is why the harness stays honest if physics changes.
      const AIMS = [-24,-18,-12,-6,0,6,12,18,24];
      for (let ry = lv.spawn.y+90; ry <= CONSTS.H-170; ry += 24)
        for (let t1 = 28; t1 <= 152; t1 += 6){
          const phi1 = (2*t1-90)*R;
          for (let L = 80; L <= 440; L += 24){
            const p2 = { x: sx+Math.cos(phi1)*L, y: ry+Math.sin(phi1)*L };
            if (p2.x<25||p2.x>CONSTS.W-25||p2.y<25||p2.y>CONSTS.H-55) continue;
            const phi2 = Math.atan2(tc.y-p2.y, tc.x-p2.x);
            const aim = ((phi2+phi1)/2)*D;
            for (let ai = 0; ai < AIMS.length; ai++){
              const t2 = aim + AIMS[ai];
              const cfg = [ramp(sx,ry,t1), ramp(p2.x,p2.y,t2,100)];
              if (!wins(cfg)) continue;
              sols2++;
              if (!best2cfg) best2cfg = cfg;
              if (sols2 % 25 === 1){
                let a=0,b=0;
                for(let d=1;d<=24;d+=1){ if(wins([cfg[0],ramp(p2.x,p2.y,t2+d,100)])) b=d; else break; }
                for(let d=1;d<=24;d+=1){ if(wins([cfg[0],ramp(p2.x,p2.y,t2-d,100)])) a=d; else break; }
                if (a+b > tol2) tol2 = a+b;
              }
            }
          }
        }
    }

    /* ---- blind placement ---- */
    let rnd = 20250903;
    const rand = () => (rnd = (rnd*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
    let blind = 0; const N = 400;
    for (let i = 0; i < N; i++){
      const cfg = [];
      for (let k = 0; k < lv.maxBlocks; k++)
        cfg.push(ramp(40+rand()*(CONSTS.W-80), 110+rand()*(CONSTS.H-260), -85+rand()*170, 70+rand()*80));
      if (simulate(cfg, 1+(i%7), li).result === 'win') blind++;
    }

    out.push({ id: lv.id, name: lv.name, type: lv.targetType, max: lv.maxBlocks,
               obst: lv.obstacles.length,
               tol1: best.tol, any1: total1,
               sols2, tol2, blind: blind/N });
  }
  return out;
}, [LO, HI]);

await browser.close();

console.log('\n  #  name            type        blk ob  1-ramp band  2-ramp   blind');
console.log('  ' + '-'.repeat(72));
let problems = [];
for (const r of report){
  const b1 = r.tol1 ? `±${r.tol1.toFixed(1)}°` : ' none ';
  const b2 = r.max >= 2 ? (r.sols2 ? `${String(r.sols2).padStart(3)}✓` : ' -- ') : '  - ';
  console.log(`  ${String(r.id).padStart(2)} ${r.name.padEnd(15)} ${r.type.padEnd(11)} ` +
    `${r.max}  ${r.obst}  ${b1.padStart(7)}      ${b2}   ` +
    `${(r.blind*100).toFixed(1).padStart(5)}%`);
  if (!r.tol1 && !r.sols2) problems.push(`L${r.id} ${r.name}: NO SOLUTION FOUND`);
  if (r.blind > 0.30)      problems.push(`L${r.id} ${r.name}: trivially winnable (${(r.blind*100).toFixed(0)}% blind)`);
}
console.log('\n  1-ramp band = widest contiguous winning angle window at one ramp height');
if (problems.length){ console.log('\n  PROBLEMS:'); problems.forEach(p => console.log('   ! ' + p)); }
else console.log('\n  No problems: every level winnable, none trivial.');
console.log();
