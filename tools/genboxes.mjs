/**
 * Mystery box placement, verified against the real simulator.
 *
 *   node tools/genboxes.mjs            # report, write nothing
 *   node tools/genboxes.mjs --write    # ...and splice into the level data
 *
 * ONE BOX PER LEVEL, on all 150, Verdholm's frozen twenty included. That is
 * only safe because a box is scenery to the physics - it is collected by
 * proximity and never touches the trajectory - so no level's proved solution
 * can change by gaining one. tests/play.test.mjs re-proves exactly that.
 *
 * REACHABILITY IS PROVED BY CONSTRUCTION, not argued. Every candidate spot is
 * a point the ball ACTUALLY VISITED in a traced drop under some ramp layout,
 * so "a player could collect this" is a replay of a run that happened rather
 * than a claim about geometry. Spots on the do-nothing drop line are then
 * rejected: a box the ball falls into whether or not you aim for it is not a
 * choice, and this is a game about choosing where things go.
 *
 * Deterministic: same levels in, same boxes out, so a re-run is a no-op and a
 * diff is always a real change.
 */
import { chromium } from 'playwright';
import { attachHarness } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
await attachHarness(page);

const placed = await page.evaluate(() => {
  const g = window.__gtb, { LEVELS, CONSTS, MECH } = g;
  const R = Math.PI / 180;
  /* READ FROM THE GAME, never copied: the box's collection radius is what
     decides how much room a spot needs, and a number typed in here goes stale
     the first time the box is resized. */
  const BOX_R = MECH.BOX_R;
  const ramp = (cx, cy, deg, len = 120) => {
    const a = deg * R, hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy };
  };
  const distToSeg = (px, py, s) => {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2)) : 0;
    return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
  };

  const out = [];
  /* Captured BEFORE the loop: the scratch board below appends to LEVELS, and
     a bound read each time round would walk into the scratch slots. */
  const N = LEVELS.length;
  for (let li = 0; li < N; li++) {
    const lv = LEVELS[li];
    const sx = lv.spawn.x;

    /* ---- every point the ball is known to reach on this board ----
       The do-nothing drop first, then a fan of single ramps under the spawn,
       which is the shape of almost every real solution. */
    const paths = [];
    const push = (ramps, tag) => {
      const t = g.trace(ramps, 1, li);
      if (t.samples.length) paths.push({ tag, pts: t.samples });
    };
    push([], 'bare');
    for (let ry = lv.spawn.y + 90; ry <= 620; ry += 70)
      for (let th = 30; th <= 150; th += 20) push([ramp(sx, ry, th)], 'r');

    /* The bare drop's own line, to be avoided: a box sitting on it is
       collected by doing nothing at all. */
    const bare = paths[0].pts;
    const onBareLine = (x, y) =>
      bare.some(p => Math.hypot(p.x - x, p.y - y) <= BOX_R + CONSTS.BALL_R + 14);

    /* ---- what a spot has to clear ---- */
    const circles = [
      ...lv.obstacles.map(o => ({ ...o, pad: 12 })),
      ...lv.fires.map(o => ({ ...o, pad: 16 })),
      ...lv.breakables.map(o => ({ ...o, pad: 12 })),
      ...lv.boosters.map(o => ({ ...o, pad: 14 })),
      { ...lv.target, pad: 34 },      // never on the target or its mouth
    ];
    const ok = (x, y) => {
      if (x < 46 || x > CONSTS.W - 46 || y < 150 || y > CONSTS.H - 130) return false;
      if (Math.hypot(x - sx, y - lv.spawn.y) < 90) return false;
      for (const c of circles) if (Math.hypot(x - c.x, y - c.y) < c.r + BOX_R + c.pad) return false;
      for (const w of lv.walls) if (distToSeg(x, y, w) < BOX_R + CONSTS.WALL_HT + 10) return false;
      /* A patrolling target sweeps a band, so the whole sweep is off limits,
         not just where it happens to start. */
      if (lv.targetMove) {
        const t = lv.target;
        if (y > t.y - t.r - BOX_R - 34 && y < t.y + t.r + BOX_R + 34 &&
            x > Math.min(lv.targetMove.x0, lv.targetMove.x1) - t.r - BOX_R - 34 &&
            x < Math.max(lv.targetMove.x0, lv.targetMove.x1) + t.r + BOX_R + 34) return false;
      }
      return !onBareLine(x, y);
    };

    /* ---- score the survivors ----
       Farther from the do-nothing line is better: that is the measure of how
       much the box is a DETOUR, which is the only thing that makes collecting
       one a decision. Ties break toward the middle of the board, where a spot
       is reachable from more layouts than a corner is. */
    const choose = () => {
    const cands = [];
    for (const path of paths) {
      if (path.tag === 'bare') continue;
      for (let i = 4; i < path.pts.length; i += 2) {
        const p = path.pts[i];
        const x = Math.round(p.x), y = Math.round(p.y);
        if (!ok(x, y)) continue;
        let near = Infinity;
        for (const q of bare) near = Math.min(near, Math.hypot(q.x - x, q.y - y));
        const mid = 1 - Math.abs(y - CONSTS.H * 0.5) / (CONSTS.H * 0.5);
        const score = Math.min(near, 220) + mid * 40;
        cands.push({ x, y, score, near: Math.round(near) });
      }
    }
    cands.sort((a, b) => b.score - a.score);

    /* ---- and PROVE the winner is not free ----
       onBareLine() above measures against the traced samples, which are
       points; the engine collects a box against the ball's swept path, which
       is the line THROUGH them. A spot can clear every sample and still be
       swept up by the drop between two of them - so the chosen spot is put on
       a scratch board and the do-nothing drop is actually run at it. Anything
       the bare drop collects is discarded and the next best taken. */
    let best = null;
    for (const c of cands.slice(0, 40)) {
      const probe = { ...lv, boxes: [{ x: c.x, y: c.y }] };
      if (g.simulate([], 1, g.scratch(probe, 1)).boxes === 0) { best = c; break; }
    }
    return best;
    };
    let best = choose();
    /* A FINER FAN, only when the coarse one found nowhere. The closing boards
       of a world can be packed so tight that the one open air left is the
       flight line just off the spawn ramp, which rows 70px apart step right
       over. Only as a fallback, so every level that already had a spot keeps
       exactly the box it had - a re-run must not move a single one of them. */
    if (!best) {
      for (let ry = lv.spawn.y + 70; ry <= lv.spawn.y + 230; ry += 12)
        for (let th = 18; th <= 162; th += 6) push([ramp(sx, ry, th)], 'r');
      best = choose();
    }
    out.push(best
      ? { id: lv.id, x: best.x, y: best.y, detour: best.near }
      : { id: lv.id, x: null, y: null, detour: 0 });
  }
  return out;
});

await browser.close();

const misses = placed.filter(p => p.x === null);
console.log(`\n  Mystery boxes: ${placed.length - misses.length}/${placed.length} placed`);
if (misses.length)
  console.log(`  ! no legal spot on: ${misses.map(m => m.id).join(', ')}`);
const det = placed.filter(p => p.x !== null).map(p => p.detour).sort((a, b) => a - b);
console.log(`  detour from the do-nothing line: min ${det[0]}px, ` +
            `median ${det[det.length >> 1]}px, max ${det[det.length - 1]}px\n`);

if (!WRITE) {
  console.log('  (dry run - pass --write to splice these into src/levels/levels.data.ts)\n');
  process.exit(misses.length ? 2 : 0);
}

const file = path.join(root, 'src/levels/levels.data.ts');
let src = fs.readFileSync(file, 'utf8');
let wrote = 0;
for (const p of placed) {
  if (p.x === null) continue;
  /* One level object at a time, matched from its id to its target line, so a
     box is written into the right block whatever else that block carries. */
  const re = new RegExp(`(\\{ id:${p.id},[\\s\\S]*?)(\\n    target:)`);
  const m = src.match(re);
  if (!m) { console.log(`  ! level ${p.id}: could not find its block`); continue; }
  const body = m[1].replace(/\n    boxes:\[[^\]]*\],/g, '');   // re-runnable
  src = src.slice(0, m.index) + body + `\n    boxes:[{x:${p.x},y:${p.y}}],` + m[2] +
        src.slice(m.index + m[0].length);
  wrote++;
}
fs.writeFileSync(file, src);
console.log(`  Written into src/levels/levels.data.ts (${wrote} levels).\n`);
