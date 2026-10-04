/**
 * ALL WORLDS - rebuild every non-exam level of worlds 2-7 (21-140) on the same
 * principles as world one:
 *
 *   1. SPACIOUS: every piece at least SPACE px (edge to edge) from every other.
 *   2. The cup is the LOWEST thing on the board - nothing below it. (The spring
 *      exams, which have a big pillar, are left exactly as they are.)
 *   3. Each world rotates through the hand-designed layouts in layoutTemplates.mjs,
 *      so neighbouring levels - and the same position in two worlds - differ.
 *   4. The world's own mechanics stay: its fires / breakables fill some of the
 *      layout's slots, its wind, quicksand, black holes, stars, crabs and storm are
 *      kept and moved to a clear spot above the cup. Moving obstacles are added.
 *
 *   node tools/allWorlds.mjs [from-to] [--apply]          (default 21-140)
 *
 * Does NOT prove solvability - playtest.
 */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRaw, writeLevels } from './levelData.mjs';
import { T, INTRO } from './layoutTemplates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), APPLY = args.includes('--apply');
const [A, B] = (args.find(a => /^\d+-\d+$/.test(a)) || '21-140').split('-').map(Number);
const W = 480, H = 800, R = 19, SPACE = 34, POST = 8, CUP_Y = 726, BALL_LANE = 24;
const out = await esbuild.build({
  stdin: { contents: `export { moverPathAt } from './src/levels/mover'; export { crabPathAt } from './src/levels/crab';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node' });
const { moverPathAt, crabPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const KEYS = Object.keys(T).map(Number);
const segDist = (px, py, s) => {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
};

function build(raw) {
  const id = raw.id, pos = ((id - 1) % 20) + 1, world = Math.floor((id - 1) / 20);
  const sx = raw.spawn.x, flip = sx < W / 2, fx = x => (flip ? W - x : x);
  const intro = pos <= 5;
  /* the last board before the exams is always the GAUNTLET - the hardest plain board;
     the rest rotate through the other layouts, a different order in every world */
  const ROT = KEYS.filter(k => k !== 16);
  const t = intro ? null : pos === 16 ? T[16] : T[ROT[((pos - 6) + world * 4) % ROT.length]];
  const cr = Math.max(30, raw.target.r);
  let cupX = fx(intro ? 110 + (pos % 3) * 25 : t.cup);
  const log = [];

  // the patrol, if the level had one: a short lane on the cup's side, never under the drop
  let lane = null;
  if (raw.targetMove) {
    let x0 = Math.max(cr + 20, cupX - 55), x1 = Math.min(W - cr - 20, cupX + 55);
    if (sx > x0 - cr - 60 && sx < x1 + cr + 60) { const sh = sx < W / 2 ? 1 : -1; x0 += sh * 80; x1 += sh * 80; }
    lane = { x0: Math.round(x0), x1: Math.round(x1), period: raw.targetMove.period };
    cupX = lane.x0;
  }
  const cupSpots = lane ? [0, .25, .5, .75, 1].map(k => lane.x0 + (lane.x1 - lane.x0) * k) : [cupX];
  const mouthY = CUP_Y - 1.0 * cr;
  const posts = intro ? [] : t.b.map(([x1, y1, x2, y2]) => ({ x1: fx(x1), y1, x2: fx(x2), y2 }));
  const placed = [];
  const legal = (x, y, r, extra = 0) => {
    if (x < r + 16 || x > W - r - 16 || y < r + 16) return false;
    if (y + r > mouthY - 14) return false;                                        // nothing at or below the cup
    if (Math.hypot(x - sx, y - raw.spawn.y) < 120 + extra) return false;
    if (Math.abs(x - sx) < r + BALL_LANE) return false;           // the bare drop falls straight through, untouched
    for (const cx of cupSpots) if (Math.abs(x - cx) < 0.736 * cr + r + 24 && y > mouthY - 110) return false;
    for (const s of posts) if (segDist(x, y, s) < r + POST + SPACE + extra) return false;
    for (const p of placed) if (Math.hypot(x - p.x, y - p.y) < r + p.r + SPACE + Math.max(extra, p.extra ?? 0)) return false;
    return true;
  };
  const nudge = (x, y, ok, far = 120) => {
    if (ok(x, y)) return [Math.round(x), Math.round(y)];
    for (let d = 10; d <= far; d += 10) for (let a = 0; a < 16; a++) {
      const nx = Math.round(x + d * Math.cos(a * Math.PI / 8)), ny = Math.round(y + d * Math.sin(a * Math.PI / 8));
      if (ok(nx, ny)) return [nx, ny];
    }
    return null;
  };
  const lv = { id, name: raw.name, maxBlocks: raw.maxBlocks, targetType: 'OPEN', spawn: raw.spawn,
               target: { x: cupX, y: CUP_Y, r: cr } };
  if (lane) lv.targetMove = lane;
  if (posts.length) lv.bars = posts;

  /* zones and big pieces first - they need the most room */
  const bh = (raw.blackholes ?? []).slice(0, intro ? 1 : 2), holes = [];
  bh.forEach((h, i) => {
    const want = [fx(i ? 150 : 330), i ? 470 : 330];
    const clr = Math.max(h.r + 30, h.reach * 0.6) - R;
    const at = nudge(want[0], want[1], (x, y) => legal(x, y, R, clr), 200);
    if (!at) { log.push('dropped a black hole'); return; }
    holes.push({ ...h, x: at[0], y: at[1] }); placed.push({ x: at[0], y: at[1], r: R, extra: clr });
  });
  if (holes.length) lv.blackholes = holes;
  const qs = (raw.quicksand ?? []).slice(0, 2), sands = [];
  qs.forEach((q, i) => {
    const at = nudge(fx(i ? 330 : 160), i ? 330 : 560, (x, y) => legal(x, y, q.r), 200);
    if (!at) { log.push('dropped quicksand'); return; }
    sands.push({ ...q, x: at[0], y: at[1] }); placed.push({ x: at[0], y: at[1], r: q.r });
  });
  if (sands.length) lv.quicksand = sands;

  /* crabs keep their dance but move to clear water; each one replaces a moving obstacle */
  const crabs = [];
  for (const c of (raw.crabs ?? []).slice(0, intro ? 1 : 2)) {
    const sweep = (cx, cy) => Array.from({ length: 32 }, (_, i) => crabPathAt({ ...c, cx, cy }, i / 32));
    const want = [fx(crabs.length ? 150 : 320), crabs.length ? 330 : 470];
    const at = nudge(want[0], want[1], (x, y) => sweep(x, y).every(p => legal(p.x, p.y, c.r)), 200);
    if (!at) { log.push('dropped a crab'); continue; }
    crabs.push({ ...c, cx: at[0], cy: at[1] });
    for (const p of sweep(...at)) placed.push({ ...p, r: c.r });
  }
  if (crabs.length) lv.crabs = crabs;

  /* moving obstacles from the layout (fewer where crabs already move) */
  const movers = [];
  if (!intro) for (const [pattern, cx0, cy0, range, phase] of t.m.slice(0, Math.max(0, t.m.length - crabs.length))) {
    const mk = (cx, cy) => ({ cx, cy, r: R, pattern, range, period: 300 + (id % 4) * 30, phase });
    const sweep = m => Array.from({ length: 24 }, (_, i) => moverPathAt(m, i / 24));
    const at = nudge(fx(cx0), cy0, (x, y) => sweep(mk(x, y)).every(p => legal(p.x, p.y, R)));
    if (!at) { log.push(`dropped mover ${pattern}`); continue; }
    const m = mk(...at); movers.push(m);
    for (const p of sweep(m)) placed.push({ ...p, r: R });
  }
  if (movers.length) lv.movers = movers;

  /* the layout's slots, filled with the world's hazards */
  const slots = intro ? INTRO.slice(0, Math.max(1, Math.min(4, (raw.obstacles?.length ?? 0) + (raw.fires?.length ?? 0) + (raw.breakables?.length ?? 0)))) : t.o;
  let fires = Math.min(raw.fires?.length ?? 0, Math.ceil(slots.length / 3));
  let brk = Math.min(raw.breakables?.length ?? 0, 2);
  const fr = raw.fires?.[0]?.r ?? 20, br = raw.breakables?.[0]?.r ?? 20;
  const obstacles = [], fireL = [], brkL = [];
  slots.forEach(([x0, y0], i) => {
    let kind = 'o';
    if (fires && (i % 3 === 1 || slots.length - i <= fires + brk)) kind = 'f';
    else if (brk && (i % 3 === 2 || slots.length - i <= brk)) kind = 'b';
    if (intro && !raw.obstacles?.length) kind = fires ? 'f' : brk ? 'b' : 'o';
    const r = kind === 'f' ? fr : kind === 'b' ? br : R;
    const at = nudge(fx(x0), y0, (x, y) => legal(x, y, kind === 'f' ? r * 1.4 : r));
    if (!at) { log.push(`dropped a ${kind} slot`); return; }
    const c = { x: at[0], y: at[1], r };
    if (kind === 'f') { fireL.push(c); fires--; } else if (kind === 'b') { brkL.push(c); brk--; } else obstacles.push(c);
    placed.push({ x: c.x, y: c.y, r: kind === 'f' ? r * 1.4 : r });
  });
  lv.obstacles = obstacles;
  if (fireL.length) lv.fires = fireL;
  if (brkL.length) lv.breakables = brkL;

  /* pickups and zones that do not take up room */
  const stars = [];
  (raw.stars ?? []).slice(0, 3).forEach((s, i) => {
    const at = nudge(fx([200, 300, 120][i]), [420, 220, 600][i], (x, y) => legal(x, y, 12));
    if (at) { stars.push({ x: at[0], y: at[1] }); placed.push({ x: at[0], y: at[1], r: 12 }); }
  });
  if (stars.length) lv.stars = stars;
  if (raw.wind?.length) lv.wind = raw.wind;
  if (raw.slippery?.length) lv.slippery = raw.slippery;
  if (raw.boosters?.length) lv.boosters = raw.boosters;
  if (raw.storm) lv.storm = raw.storm;
  const b0 = raw.boxes?.[0];
  const boxAt = nudge(b0?.x ?? W / 2, Math.min(b0?.y ?? 400, mouthY - 80), (x, y) => legal(x, y, 16), 200);
  if (boxAt) lv.boxes = [{ x: boxAt[0], y: boxAt[1] }];
  if (raw.targetGift) lv.targetGift = raw.targetGift;
  return { lv, log, idea: intro ? 'intro' : t.idea };
}

const raws = await loadRaw(), writes = [];
for (const raw of raws.filter(l => l.id >= A && l.id <= B && !l.needsSpring)) {
  const { lv, log, idea } = build(raw);
  const n = k => (lv[k] ?? []).length;
  console.log(`level ${lv.id} (${idea}): ${n('obstacles')} red, ${n('fires')} fire, ${n('breakables')} brk, ${n('movers')} moving, ${n('crabs')} crab, ${n('bars')} posts${lv.targetMove ? ', patrol' : ''}` +
              (log.length ? `  [${log.join('; ')}]` : ''));
  writes.push(lv);
}
if (APPLY) { writeLevels(writes); console.log('written'); } else console.log('dry run - add --apply to write.');
