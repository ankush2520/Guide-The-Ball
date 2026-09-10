/* ============================================================
   ENGINE COMPARISON

   Both simulators over the same 30 boards, so the cost of
   switching is a measured number rather than an argument.

   The question that matters: the solver sweep proved every
   shipped level winnable against the ARCADE engine. How much of
   that proof survives under Matter?
   ============================================================ */
import { chromium } from 'playwright';
import { attachHarness } from '../tools/harness.mjs';

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
await attachHarness(page);

console.log('\nENGINE COMPARISON — arcade vs Matter.js over all 30 levels\n');

const report = await page.evaluate(() => {
  const g = window.__gtb;
  const R = Math.PI / 180;
  const ramp = (cx, cy, deg, len = 120) => {
    const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
  };
  const seeds = [1, 2, 3, 4, 5];

  /* Sweep the board for a ramp that wins on EVERY seed. This is the same
     question the level generator asks; here it is asked of both engines. */
  const solvable = (engineId, ix) => {
    for (let rx = 60; rx <= 420; rx += 36)
      for (let ry = 150; ry <= 660; ry += 30)
        for (let th = 25; th <= 155; th += 6) {
          const cfg = [ramp(rx, ry, th)];
          if (seeds.every(s => g.simulateWith(engineId, cfg, s, ix).result === 'win'))
            return { rx, ry, th };
        }
    return null;
  };

  /* Some boards need more than one ramp - level 12 wants two, 19 wants three.
     A single-ramp sweep failing there says nothing about the ENGINE, so those
     get a coarse two-ramp pass before being called unsolvable. */
  const solvable2 = (engineId, ix) => {
    for (let ax = 60; ax <= 420; ax += 60)
      for (let ay = 160; ay <= 420; ay += 45)
        for (let at = 25; at <= 155; at += 15)
          for (let bx = 60; bx <= 420; bx += 60)
            for (let by = 430; by <= 680; by += 45)
              for (let bt = 25; bt <= 155; bt += 15) {
                const cfg = [ramp(ax, ay, at), ramp(bx, by, bt)];
                if (seeds.every(s => g.simulateWith(engineId, cfg, s, ix).result === 'win'))
                  return true;
              }
    return false;
  };

  const rows = [];
  for (let ix = 0; ix < g.LEVELS.length; ix++) {
    const lv = g.LEVELS[ix];
    let a = !!solvable('arcade', ix), m = !!solvable('matter', ix);
    let ramps = 1;
    if (!a || !m) {
      ramps = 2;
      if (!a) a = solvable2('arcade', ix);
      if (!m) m = solvable2('matter', ix);
    }
    rows.push({ id: lv.id, name: lv.name, arcade: a, matter: m,
                maxBlocks: lv.maxBlocks, ramps });
  }

  /* How far apart are the two engines on the SAME layout? */
  const drift = [];
  for (let ix = 0; ix < g.LEVELS.length; ix++) {
    const cfg = [ramp(240, 400, 60)];
    const A = g.simulateWith('arcade', cfg, 1, ix);
    const M = g.simulateWith('matter', cfg, 1, ix);
    drift.push({ id: g.LEVELS[ix].id, a: A.result, m: M.result,
                 dx: Math.abs(A.x - M.x), dy: Math.abs(A.y - M.y),
                 aSteps: A.steps, mSteps: M.steps });
  }

  /* And what does UNGUARDED Matter do - no speed cap, so no tunnelling
     guard at all? */
  let tunnelled = 0;
  for (let ix = 0; ix < g.LEVELS.length; ix++) {
    const cfg = [ramp(240, 400, 60)];
    const P = g.simulatePureMatter(cfg, 1, ix);
    if (P.spdMax > g.CONSTS.MAX_SPEED * 1.5) tunnelled++;
  }

  return { rows, drift, tunnelled };
});

const { rows, drift, tunnelled } = report;
const both = rows.filter(r => r.arcade && r.matter).length;
const arcadeOnly = rows.filter(r => r.arcade && !r.matter);
const matterOnly = rows.filter(r => !r.arcade && r.matter);
const neither = rows.filter(r => !r.arcade && !r.matter);

console.log('  id  level              arcade   matter');
console.log('  ' + '-'.repeat(44));
for (const r of rows)
  console.log(`  ${String(r.id).padStart(2)}  ${r.name.padEnd(18)} ` +
              `${(r.arcade ? '  ✓' : '  ✗').padEnd(8)} ${r.matter ? '✓' : '✗'}`);

console.log(`\n  solvable under both engines : ${both}/${rows.length}`);
console.log(`  arcade only                 : ${arcadeOnly.length}` +
            (arcadeOnly.length ? `  (${arcadeOnly.map(r => r.id).join(', ')})` : ''));
console.log(`  matter only                 : ${matterOnly.length}` +
            (matterOnly.length ? `  (${matterOnly.map(r => r.id).join(', ')})` : ''));
console.log(`  neither (this sweep)        : ${neither.length}` +
            (neither.length ? `  (${neither.map(r => r.id).join(', ')})` : ''));

/* The gate that actually matters. A level the sweep cannot solve under EITHER
   engine is a limit of the sweep - it only ever tries one or two ramps, and
   some boards are budgeted for three. A level solvable under one engine but
   not the other is a real regression. */
const asymmetric = [...arcadeOnly, ...matterOnly];
if (asymmetric.length) {
  console.log(`\n  FAIL: ${asymmetric.length} level(s) behave differently between engines`);
  process.exitCode = 1;
} else {
  console.log(`\n  PASS: no level is solvable under one engine but not the other.`);
  if (neither.length)
    console.log(`  (${neither.map(r => `level ${r.id} is budgeted for ${r.maxBlocks} ramps; ` +
                `this sweep tries at most ${r.ramps}`).join('; ')})`);
}

const agree = drift.filter(d => d.a === d.m).length;
const avgDx = drift.reduce((n, d) => n + d.dx, 0) / drift.length;
const avgDy = drift.reduce((n, d) => n + d.dy, 0) / drift.length;
console.log(`\n  same fixed layout, same seed:`);
console.log(`    same outcome on            : ${agree}/${drift.length} boards`);
console.log(`    mean landing difference    : ${avgDx.toFixed(0)}px x, ${avgDy.toFixed(0)}px y`);
console.log(`\n  unguarded Matter (no speed cap) exceeded 1.5x the arcade`);
console.log(`  speed ceiling on ${tunnelled}/${rows.length} boards - that is the tunnelling risk`);
console.log('');

await browser.close();
