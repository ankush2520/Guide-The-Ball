/**
 * EXAM TIDY - the spring exams (positions 17-20 of every world).
 *
 *   node tools/examTidy.mjs [--apply]
 *
 * An exam is a big pillar: the ball goes down the drop lane, round the
 * pillar's FOOT and back up the other lane to the cup. This tool
 *   - clears the LOOP under the foot (nothing may block the ball's U-turn),
 *   - keeps every hazard SPACE px from every other piece and from the pillar,
 *   - moves anything that broke a rule to the roomiest legal spot in the drop
 *     lane (a spot as far as possible from everything else),
 *   - adds moving obstacles in the drop lane, more as the exam number rises
 *     (17: 1, 18: 1, 19: 2, 20: 2), so the exams are the hardest boards of a world.
 * Does NOT re-prove the spring route - playtest.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaw, writeLevels } from './levelData.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const W = 480, H = 800, R = 19, SPACE = 34, LANE = 24;
const out = await esbuild.build({
  stdin: { contents: `export { moverPathAt } from './src/levels/mover'; export { crabPathAt } from './src/levels/crab';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node' });
const { moverPathAt, crabPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const MOVERS = { 17: 1, 18: 1, 19: 2, 20: 2 };

function tidy(raw) {
  const pos = ((raw.id - 1) % 20) + 1, p = raw.pillars[0], hw = p.w / 2, footY = p.bottom - hw;
  const sx = raw.spawn.x, dropRight = sx > p.x;
  const T = raw.target, tm = raw.targetMove;
  const cups = tm ? [0, .5, 1].map(k => ({ x: tm.x0 + (tm.x1 - tm.x0) * k, y: (tm.y0 ?? T.y) + ((tm.y1 ?? T.y) - (tm.y0 ?? T.y)) * k })) : [T];
  const cr = T.r, log = [];
  const placed = [];
  const pillarGap = (x, y) => Math.hypot(x - p.x, y < footY ? 0 : y - footY) - hw;
  const legal = (x, y, r) => {
    if (x < r + 14 || x > W - r - 14 || y < r + 16 || y > H - r - 14) return false;
    // the loop under the foot: the U-turn must be free
    if (y > p.bottom - 40 && Math.abs(x - p.x) < hw + 150) return false;
    if (pillarGap(x, y) < r + SPACE) return false;
    if (Math.abs(x - sx) < r + LANE && y < p.bottom) return false;             // the drop line is clear
    for (const c of cups) {
      if (Math.hypot(x - c.x, y - c.y) < cr + r + 30) return false;
      if (Math.abs(x - c.x) < 0.736 * cr + r + 24 && y > c.y - 1.0 * cr - 110 && y < c.y + cr + r) return false;
    }
    for (const q of placed) if (Math.hypot(x - q.x, y - q.y) < r + q.r + SPACE) return false;
    return true;
  };
  // fixed pieces first
  for (const c of raw.crabs ?? []) for (let i = 0; i < 32; i++) placed.push({ ...crabPathAt(c, i / 32), r: c.r });
  for (const h of raw.blackholes ?? []) placed.push({ x: h.x, y: h.y, r: Math.max(h.r + 30, h.reach * 0.6) });
  for (const q of raw.quicksand ?? []) placed.push({ x: q.x, y: q.y, r: q.r });

  // the drop lane: where new things go
  const laneX0 = dropRight ? p.x + hw + 30 : 30, laneX1 = dropRight ? W - 30 : p.x - hw - 30;
  const roomiest = (r, test = legal) => {
    let best = null;
    for (let y = 130; y < p.bottom - 60; y += 10) for (let x = laneX0; x <= laneX1; x += 10) {
      if (!test(x, y, r)) continue;
      const d = Math.min(...placed.map(q => Math.hypot(x - q.x, y - q.y) - q.r), pillarGap(x, y), 999);
      if (!best || d > best.d) best = { x, y, d };
    }
    return best;
  };

  // moving obstacles in the drop lane
  const movers = [], want = MOVERS[pos] ?? 1;
  const range = Math.max(18, Math.min(55, (laneX1 - laneX0) / 2 - R - 10));
  for (let k = 0; k < want; k++) {
    const mk = (x, y) => ({ cx: x, cy: y, r: R, pattern: 'slide', range, period: 260 + k * 70 + (raw.id % 3) * 20, phase: k * 0.5 });
    const sweepOk = (x, y) => Array.from({ length: 20 }, (_, i) => moverPathAt(mk(x, y), i / 20)).every(q => legal(q.x, q.y, R));
    const at = roomiest(R, (x, y) => sweepOk(x, y));
    if (!at) { log.push('no room for a mover'); continue; }
    const m = mk(at.x, at.y); movers.push(m);
    for (let i = 0; i < 20; i++) placed.push({ ...moverPathAt(m, i / 20), r: R });
  }

  // hazards: keep the ones that are fine, move the rest to the roomiest legal spot
  const redo = (list, kind, rad = o => o.r) => (list ?? []).map(o => {
    if (legal(o.x, o.y, rad(o))) { placed.push({ x: o.x, y: o.y, r: rad(o) }); return o; }
    const at = roomiest(rad(o));
    if (!at) { log.push(`dropped ${kind} ${o.x},${o.y}`); return null; }
    log.push(`moved ${kind} ${o.x},${o.y} -> ${at.x},${at.y}`);
    placed.push({ x: at.x, y: at.y, r: rad(o) });
    return { ...o, x: at.x, y: at.y };
  }).filter(Boolean);
  const lv = structuredClone(raw);
  lv.fires = redo(raw.fires, 'fire', o => o.r * 1.4);
  lv.obstacles = redo(raw.obstacles, 'obstacle');
  lv.breakables = redo(raw.breakables, 'breakable');
  for (const k of ['fires', 'breakables']) if (!lv[k].length) delete lv[k];
  if (movers.length) lv.movers = movers;
  // boxes / stars: just keep them out of the loop
  const pick = (o, r) => legal(o.x, o.y, r) ? o : (roomiest(r) ?? o);
  if (lv.boxes) lv.boxes = lv.boxes.map(b => { const q = pick(b, 16); placed.push({ x: q.x, y: q.y, r: 16 }); return { x: q.x, y: q.y }; });
  if (lv.stars) lv.stars = lv.stars.map(s => { const q = pick(s, 12); placed.push({ x: q.x, y: q.y, r: 12 }); return { x: q.x, y: q.y }; });
  return { lv, log };
}

const raws = await loadRaw(), writes = [];
for (const raw of raws.filter(l => l.needsSpring && l.pillars?.length)) {
  const { lv, log } = tidy(raw);
  console.log(`level ${lv.id}: ${lv.obstacles.length} red, ${(lv.fires ?? []).length} fire, ${(lv.breakables ?? []).length} brk, ${(lv.movers ?? []).length} moving` + (log.length ? `\n    ${log.join('\n    ')}` : ''));
  writes.push(lv);
}
if (APPLY) { writeLevels(writes); console.log('written'); } else console.log('dry run - add --apply to write.');
