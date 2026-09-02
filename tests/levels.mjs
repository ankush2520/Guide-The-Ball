/**
 * Per-level design harness.   node tests/levels.mjs [firstLevel] [lastLevel]
 *
 * For every level it answers three questions:
 *   1. Is it winnable?      - construct solutions geometrically, verify in the sim
 *   2. How precise must you be?  - the angular tolerance of the best solution
 *   3. Is it trivially winnable? - win rate of blind random ramp placements
 *
 * Because CURVE is 0 the ball flies in straight lines, so a ramp at angle t
 * turns an incoming heading p into (2t - p). That makes exact solutions
 * constructible; every candidate is then confirmed by running the real sim.
 */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = pathToFileURL(path.join(root, 'index.html')).href;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(GAME);
await page.waitForFunction(() => !!window.__gtb);

const report = await page.evaluate(([lo, hi]) => {
  const { LEVELS, simulate, CONSTS } = window.__gtb;
  const D = 180 / Math.PI, R = Math.PI / 180;
  const SEEDS = [1,2,3,4,5,6,7,8];

  // a ramp centred at (cx,cy) drawn at angle deg
  const ramp = (cx, cy, deg, len = 120) => {
    const a = deg * R, hx = Math.cos(a)*len/2, hy = Math.sin(a)*len/2;
    return { x1: cx-hx, y1: cy-hy, x2: cx+hx, y2: cy+hy };
  };
  const winRate = (cfg, li) => {
    let w = 0;
    for (const s of SEEDS) if (simulate(cfg, s, li).result === 'win') w++;
    return w / SEEDS.length;
  };

  const out = [];
  for (let li = lo; li <= hi; li++){
    const lv = LEVELS[li];
    const tc = { x: lv.target.x + lv.target.w/2, y: lv.target.y + lv.target.h/2 };
    const sx = lv.spawn.x;

    /* ---- 1-ramp solutions: ball falls straight down to (sx, ry), then must
            head at the target. Outgoing angle = 2t - 90, so t = (phi + 90)/2. */
    const sols1 = [];
    for (let ry = lv.spawn.y + 90; ry <= CONSTS.H - 120; ry += 10){
      const phi = Math.atan2(tc.y - ry, tc.x - sx) * D;
      const t = (phi + 90) / 2;
      if (winRate([ramp(sx, ry, t)], li) === 1) sols1.push({ ry, t });
    }
    // widest angle tolerance across the working placements
    let tol1 = 0, tolAt = null;
    for (const s of sols1){
      let lo2 = 0, hi2 = 0;
      for (let d = 0.5; d <= 25; d += 0.5){ if (winRate([ramp(sx, s.ry, s.t + d)], li) === 1) hi2 = d; else break; }
      for (let d = 0.5; d <= 25; d += 0.5){ if (winRate([ramp(sx, s.ry, s.t - d)], li) === 1) lo2 = d; else break; }
      if (lo2 + hi2 > tol1){ tol1 = lo2 + hi2; tolAt = s; }
    }

    /* ---- 2-ramp solutions: ramp1 sends the ball off at phi1, ramp2 sits on
            that ray and turns it onto the target. t2 = (phi2 + phi1)/2. */
    const sols2 = [];
    let tol2 = 0, leg2 = null;
    if (lv.maxBlocks >= 2){
      for (let ry = lv.spawn.y + 90; ry <= CONSTS.H - 260 && sols2.length < 400; ry += 20)
        for (let t1 = 30; t1 <= 150; t1 += 6){
          const phi1 = (2*t1 - 90) * R;
          for (let L = 90; L <= 340; L += 25){
            const p2 = { x: sx + Math.cos(phi1)*L, y: ry + Math.sin(phi1)*L };
            if (p2.x < 25 || p2.x > CONSTS.W-25 || p2.y < 25 || p2.y > CONSTS.H-90) continue;
            const phi2 = Math.atan2(tc.y - p2.y, tc.x - p2.x);
            const t2 = ((phi2 + phi1) / 2) * D;
            const cfg = [ramp(sx, ry, t1), ramp(p2.x, p2.y, t2, 100)];
            if (winRate(cfg, li) === 1) sols2.push({ ry, t1, L, t2 });
          }
        }
      // sample solutions spread across the whole list - taking the first 40
      // only measures long final legs and understates the real tolerance
      const stride = Math.max(1, Math.floor(sols2.length / 40));
      const picked = sols2.filter((_, i) => i % stride === 0).slice(0, 40);
      for (const s of picked){
        const phi1 = (2*s.t1 - 90) * R;
        const p2 = { x: sx + Math.cos(phi1)*s.L, y: s.ry + Math.sin(phi1)*s.L };
        let a = 0, b = 0;
        for (let d = 0.5; d <= 25; d += 0.5){
          if (winRate([ramp(sx,s.ry,s.t1), ramp(p2.x,p2.y,s.t2+d,100)], li) === 1) b = d; else break; }
        for (let d = 0.5; d <= 25; d += 0.5){
          if (winRate([ramp(sx,s.ry,s.t1), ramp(p2.x,p2.y,s.t2-d,100)], li) === 1) a = d; else break; }
        if (a + b > tol2){ tol2 = a + b; leg2 = s.L; }
      }
    }

    /* ---- blind placement: how often does a careless layout just work? ---- */
    let rnd = 20250903;
    const rand = () => (rnd = (rnd*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let blind = 0; const N = 500;
    for (let i = 0; i < N; i++){
      const cfg = [];
      for (let k = 0; k < lv.maxBlocks; k++)
        cfg.push(ramp(40 + rand()*(CONSTS.W-80), 110 + rand()*(CONSTS.H-260),
                      -85 + rand()*170, 70 + rand()*80));
      if (simulate(cfg, 1 + (i % 8), li).result === 'win') blind++;
    }

    out.push({ id: lv.id, name: lv.name, type: lv.targetType, max: lv.maxBlocks,
               obst: lv.obstacles.length, walls: lv.walls.length,
               sols1: sols1.length, tol1: tol1, tolRy: tolAt ? tolAt.ry : null,
               sols2: sols2.length, tol2: tol2, leg2: leg2, blind: blind / N });
  }
  return out;
}, [Number(process.argv[2] || 0), Number(process.argv[3] || 4)]);

await browser.close();

console.log('\n  #  name           type        blk ob wl   1-ramp        2-ramp      blind');
console.log('  ' + '-'.repeat(76));
for (const r of report){
  const s1 = r.sols1 ? `${String(r.sols1).padStart(3)} ±${r.tol1.toFixed(1)}°` : '  none  ';
  const s2 = r.max >= 2 ? (r.sols2 ? `${String(r.sols2).padStart(3)} ±${r.tol2.toFixed(1)}°` : '  none  ') : '    -   ';
  const leg = r.leg2 ? ` leg${r.leg2}` : '';
  console.log(`  ${String(r.id).padStart(2)}  ${r.name.padEnd(14)} ${r.type.padEnd(11)} ` +
    `${r.max}  ${r.obst}  ${String(r.walls).padStart(1)}  ${s1.padEnd(12)}  ${s2.padEnd(11)} ` +
    `${(r.blind*100).toFixed(1).padStart(5)}%`);
}
console.log('\n  1-ramp / 2-ramp = how many distinct working placements exist, and the');
console.log('  angular tolerance of the most forgiving one (wider = more forgiving).');
console.log('  blind = win rate of careless random placements (should stay low).\n');
