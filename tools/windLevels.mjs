/**
 * Windemere 41-56: Emberkeep's cities with wind on top.   node tools/windLevels.mjs
 *
 * Placed directly, not solver-verified - these boards are play-tested by
 * hand. Each city copies the Emberkeep city 20 below it (41 <- 21 ... 56 <- 36):
 *
 *   - the same fire / breakable / obstacle counts and radii, maxBlocks,
 *     targetType, wallSide, patrol and mystery box - the PATTERN, not the
 *     positions: flipped left-right half the time, and the drop, target
 *     and box each nudged up to 40px, so no board reads as a copy;
 *   - every hazard re-placed at random, spread as far apart as it will go
 *     (best-candidate), never closer than 2 * BALL_R edge to edge, and with
 *     fire given room for its glow exactly as genlevels' need() does;
 *   - WIND: one full-width zone on 41-48, two from 49, blowing opposite ways
 *     from 53. A zone never covers the spawn or the target's patrol, and
 *     blows AWAY from the target's side, so it pushes the ball off the easy
 *     line rather than delivering it.
 *
 * 57-60 are the pillar exam: tools/pillarLevels.mjs.
 * Levels 1-40 and 61+ are never touched.
 *
 * The same builder makes Stormhold (tools/stormLevels.mjs) with a
 * thunderstorm in place of the wind - see runWorld().
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { loadRaw, writeLevels } from './levelData.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { FIRE_GLOW, TARGET_GLOW, BOX_GLOW, GLOW_PAD, BALL_R, BOX_R, STORM_R, crabPathAt } = await (async () => {
  const out = await esbuild.build({ stdin: { contents: `export * from './src/render/glow';
                                                        export { BALL_R, BOX_R } from './src/physics/constants';
                                                        export { STORM_R } from './src/levels/storm';
                                                        export { crabPathAt } from './src/levels/crab';`,
                                             resolveDir: root, loader: 'ts' },
                                    bundle: true, write: false, format: 'esm', platform: 'node' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
})();
const W = 480, H = 800, MIN_GAP = 2 * BALL_R;

const NAMES = {
  41: 'Gustfire', 42: 'Ember Drift', 43: 'Crosswind', 44: 'Smoke Trail', 45: 'Squall Line',
  46: 'Firewind', 47: 'Headwind', 48: 'Tailwind Blaze', 49: 'Cinder Gust', 50: 'Whirlwind',
  51: 'Sirocco', 52: 'Ash Storm', 53: 'Crossdraught', 54: 'Hot Breeze', 55: 'Wildfire',
  56: 'Gale Force', 57: 'Firestorm', 58: 'Fire Whirl', 59: 'Dust Devil', 60: 'The Tempest',
};
export { NAMES, FIRE_GLOW, BOX_GLOW, BOX_R, GLOW_PAD, STORM_R, rng, rint, MIN_GAP };

/** A proper integer hash (murmur3's finaliser): neighbouring ids come out
    unrelated, which a plain LCG seeded with them does not. */
export function mix(n){
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed){ return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const rfl = (r, a, b) => Math.round((a + r() * (b - a)) * 100) / 100;

/* genlevels' spacing law: MIN_GAP between bodies always, and GLOW_PAD between
   visible edges when either one glows. */
const vis = o => o.kind === 'f' ? o.r * FIRE_GLOW : o.kind === 't' ? o.r * TARGET_GLOW
               : o.kind === 'x' ? o.r * BOX_GLOW : o.r;
function need(a, b, gap = MIN_GAP){
  const body = a.r + b.r + Math.max(gap, MIN_GAP);
  return (vis(a) > a.r || vis(b) > b.r) ? Math.max(body, vis(a) + vis(b) + GLOW_PAD) : body;
}
const apart = (a, b, gap) => Math.hypot(a.x - b.x, a.y - b.y) >= need(a, b, gap);

/* The same walls levels/walls.ts builds, so a hazard never sits in one. */
function targetWalls(tt, side, c){
  const d = c.r + 16, up = 112;
  const seg = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
  if (tt === 'SIDE_WALL') return side === 'left' ? [seg(c.x - d, c.y + d, c.x - d, c.y - up)]
                                                 : [seg(c.x + d, c.y + d, c.x + d, c.y - up)];
  if (tt === 'POCKET') return side === 'left'
    ? [seg(c.x - d, c.y + d, c.x - d, c.y - d), seg(c.x - d, c.y - d, c.x + d, c.y - d)]
    : [seg(c.x + d, c.y + d, c.x + d, c.y - d), seg(c.x - d, c.y - d, c.x + d, c.y - d)];
  return [];
}
function segDist(px, py, s){
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L));
  return Math.hypot(px - s.x1 - k * dx, py - s.y1 - k * dy);
}

/** A twin level's fields, as the builder reads them. */
function fromRaw(l){
  const c = list => (list || []).map(({ x, y, r }) => ({ x, y, r }));
  return { maxBlocks: l.maxBlocks, targetType: l.targetType, wallSide: l.wallSide,
           spawn: { ...l.spawn }, obstacles: c(l.obstacles), fires: c(l.fires), breakables: c(l.breakables),
           target: { ...l.target }, targetMove: l.targetMove ? { ...l.targetMove } : null,
           box: l.boxes && l.boxes[0] ? { ...l.boxes[0] } : null };
}

/** Full-width wind bands that stay clear of the spawn and of the target's
    whole patrol. `n` bands; `oppose` makes the second blow the other way. */
function windFor(r, n, oppose, spawnX, lo, hi){
  const away = spawnX < lo.x ? -1 : 1;            // blow back toward the spawn side, away from the target
  const keepOut = [lo.y - lo.r - 40, lo.y + lo.r + 40];
  const free = [[110, keepOut[0]], [keepOut[1], H - 60]].filter(([a, b]) => b - a >= 110);
  for (let tries = 0; tries < 400; tries++){
    const bands = [];
    for (let k = 0; k < n; k++){
      const [a, b] = free[rint(r, 0, free.length - 1)];
      const h = rint(r, 110, Math.min(220, b - a));
      const y = rint(r, a, b - h);
      const dir = oppose && k === 1 ? -away : away;
      bands.push({ x: 0, y, w: W, h, ax: Math.round(dir * rfl(r, 0.35, 0.8) * 100) / 100, ay: 0 });
    }
    /* two bands never overlap, and leave a still strip between them */
    if (n === 2 && !(bands[0].y + bands[0].h + 30 <= bands[1].y || bands[1].y + bands[1].h + 30 <= bands[0].y)) continue;
    return bands.sort((a, b) => a.y - b.y);
  }
  throw new Error('no room for the wind');
}

/** A THUNDERSTORM: `n` strike points spread over the board (best-candidate),
    each clear of the spawn and never reaching the target anywhere on its
    patrol, and a gap of 0.8s (48 steps) after each strike. `ok` can
    veto a point (e.g. to keep points out of a solid). */
const STRIKE_GAP = 48;
export function stormFor(r, n, spawn, lane, ok = () => true){
  const points = [];
  for (let k = 0; k < n; k++){
    let best = null, bestScore = -Infinity;
    for (let c = 0; c < 400; c++){
      const p = { x: rint(r, STORM_R, W - STORM_R), y: rint(r, 150, H - 80) };
      if (Math.hypot(p.x - spawn.x, p.y - spawn.y) < STORM_R + 80) continue;
      if (!lane.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= STORM_R + t.r + 20)) continue;
      if (!points.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= 2 * STORM_R + 30)) continue;
      if (!ok(p)) continue;
      let score = Infinity;
      for (const q of points) score = Math.min(score, Math.hypot(p.x - q.x, p.y - q.y));
      if (score > bestScore){ bestScore = score; best = p; }
    }
    if (!best) return null;
    points.push(best);
  }
  /* 0.8s (48 steps) between strikes. The old 1-1.8s gap is still DRAWN and
     thrown away, so the random sequence - and every layout built from it -
     stays exactly what it was. */
  return { points, gaps: points.map(() => (rint(r, 60, 108), STRIKE_GAP)) };
}

/* ============================================================
   CRABS

   `n` crabs, each walking a looping pattern (levels/crab.ts -
   its shapes are read from there, never copied): an orbit, a
   figure-8, a three-petal flower or a side-to-side scuttle. An
   orbit is sometimes shared by TWO crabs half a lap apart, which
   reads as a little dance and can never collide.

   The WHOLE loop is held clear: MIN_GAP from every hazard and
   box in `blockers`, 40px from the target anywhere on its patrol,
   clear of the drop point and of every other crab's loop, and
   inside the board. `ok` can veto a point (e.g. to keep
   loops off the rock). Null if they cannot all fit.
   ============================================================ */
export function crabPath(c, n = 128){
  const out = [];
  for (let i = 0; i < n; i++){ const p = crabPathAt(c, i / n); out.push({ x: p.x, y: p.y, r: c.r }); }
  return out;
}
const PATTERNS = ['orbit', 'eight', 'flower', 'scuttle'];
/* `k` scales the loop down (1 = full size) when the board is tight. */
function crabShape(rr, pattern, k = 1){
  const r = rint(rr, 13, 16);
  const s = n => Math.max(12, Math.round(n * k));
  switch (pattern){
    case 'eight':   return { r, rx: s(rint(rr, 55, 100)), ry: s(rint(rr, 25, 45)), period: rint(rr, 260, 380) };
    case 'flower':  { const rx = s(rint(rr, 50, 80)); return { r, rx, ry: Math.round(rx * (0.8 + rr() * 0.2)), period: rint(rr, 300, 420) }; }
    case 'scuttle': return { r, rx: s(rint(rr, 60, 120)), ry: s(rint(rr, 18, 30)), period: rint(rr, 180, 260) };
    default:        return { r, rx: s(rint(rr, 45, 90)), ry: s(rint(rr, 30, 70)), period: rint(rr, 220, 340) };
  }
}
/* Variety first: a pattern this board does not have yet is tried before a
   repeat. Loops shrink as the tries go on, so a crowded board gets smaller
   loops rather than none; and if even the smallest will not fit, the board
   gets one crab fewer - never fewer than MIN_CRABS. */
const MIN_CRABS = 2, CRAB_TRIES = 900;
export function crabFor(rr, n, spawn, lane, blockers, ok = () => true){
  const crabs = [], loops = [];                    // loops: one sampled path per GROUP
  while (crabs.length < n){
    let got = null;
    const used = new Set(crabs.map(c => c.pattern));
    const fresh = PATTERNS.filter(p => !used.has(p));
    for (let c = 0; c < CRAB_TRIES && !got; c++){
      const pool = fresh.length && rr() < 0.75 ? fresh : PATTERNS;
      const pattern = pool[rint(rr, 0, pool.length - 1)];
      const pair = pattern === 'orbit' && n - crabs.length >= 2 && rr() < 0.5;
      const sh = crabShape(rr, pattern, 1 - 0.55 * (c / CRAB_TRIES));
      const cx = rint(rr, sh.rx + sh.r + 12, W - sh.rx - sh.r - 12);
      const cy = rint(rr, 170 + sh.ry + sh.r, H - 90 - sh.ry - sh.r);
      const base = { cx, cy, rx: rr() < 0.5 ? sh.rx : -sh.rx, ry: sh.ry, pattern, period: sh.period, r: sh.r };
      const pts = crabPath(base);
      if (!pts.every(p => p.y - p.r > 120 && p.y + p.r < H - 20 && p.x - p.r > 6 && p.x + p.r < W - 6)) continue;
      if (!pts.every(p => Math.hypot(p.x - spawn.x, p.y - spawn.y) >= p.r + 70)) continue;
      if (!pts.every(p => lane.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= p.r + t.r + 40))) continue;
      if (!pts.every(p => blockers.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + MIN_GAP))) continue;
      if (!loops.every(L => L.every(q => pts.every(p => Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + MIN_GAP)))) continue;
      if (!pts.every(ok)) continue;
      const phase = Math.round(rr() * 100) / 100;
      got = pair ? [{ ...base, phase }, { ...base, phase: Math.round(((phase + 0.5) % 1) * 100) / 100 }]
                 : [{ ...base, phase }];
      loops.push(pts);
    }
    if (!got) break;
    crabs.push(...got);
  }
  return crabs.length >= Math.min(MIN_CRABS, n) ? crabs : null;
}

/** GOLD STARS (Ancient Egypt): optional pickups, scenery to the physics. Put
    in the open air a ball can pass through - clear of every hazard, the box,
    the target's lane and the drop - spread apart, and never low on the board
    where only a finished shot would reach them. */
export function starsFor(rr, n, spawn, lane, blockers, walls = [], extraOk = () => true){
  const out = [];
  for (let c = 0; c < 2000 && out.length < n; c++){
    const s = { x: rint(rr, 40, W - 40), y: rint(rr, 150, H - 170), r: 14 };
    if (Math.hypot(s.x - spawn.x, s.y - spawn.y) < 90) continue;
    if (!lane.every(t => Math.hypot(s.x - t.x, s.y - t.y) >= s.r + t.r + 40)) continue;
    if (!blockers.every(q => Math.hypot(s.x - q.x, s.y - q.y) >= s.r + q.r * 1.4 + MIN_GAP)) continue;
    if (walls.some(w => segDist(s.x, s.y, w) < s.r + MIN_GAP)) continue;
    if (!out.every(q => Math.hypot(s.x - q.x, s.y - q.y) >= 110)) continue;
    if (!extraOk(s)) continue;
    out.push(s);
  }
  return out.map(({ x, y }) => ({ x, y }));
}

/** QUICKSAND pits (Ancient Egypt): round, clear of the drop, the target's
    lane, every hazard and each other. At least one, or the board re-rolls. */
export function pitsFor(rr, n, spawn, lane, others, walls = []){
  const out = [];
  for (let c = 0; c < 1500 && out.length < n; c++){
    const q = { x: 0, y: 0, r: rint(rr, 36, 48) };
    q.x = rint(rr, q.r + 10, W - q.r - 10); q.y = rint(rr, 200, H - 140);
    if (Math.hypot(q.x - spawn.x, q.y - spawn.y) < q.r + 110) continue;
    if (!lane.every(t => Math.hypot(q.x - t.x, q.y - t.y) >= q.r + t.r + 30)) continue;
    if (!others.every(o => Math.hypot(q.x - o.x, q.y - o.y) >= q.r + o.r * (o.kind === 'f' ? 1.6 : 1) + MIN_GAP)) continue;
    if (walls.some(w => segDist(q.x, q.y, w) < q.r + 10)) continue;
    if (!out.every(o => Math.hypot(q.x - o.x, q.y - o.y) >= q.r + o.r + 40)) continue;
    out.push(q);
  }
  if (!out.length) throw new Error('no room for quicksand');
  return out;
}

/** BLACK HOLES (Outer Space): the core clear of every hazard, and the whole
    PULL kept off the drop and the target's lane - so a hole bends shots on
    the way, never the finish. At least one, or the board re-rolls. */
export function holesFor(rr, n, spawn, lane, others, walls = []){
  const out = [];
  for (let c = 0; c < 1500 && out.length < n; c++){
    const h = { x: 0, y: 0, r: rint(rr, 13, 16), reach: rint(rr, 85, 110), pull: rfl(rr, 0.38, 0.5) };
    h.x = rint(rr, 50, W - 50); h.y = rint(rr, 220, H - 180);
    if (Math.hypot(h.x - spawn.x, h.y - spawn.y) < h.reach + 40) continue;
    if (!lane.every(t => Math.hypot(h.x - t.x, h.y - t.y) >= h.reach + t.r + 10)) continue;
    if (!others.every(o => Math.hypot(h.x - o.x, h.y - o.y) >= h.r + o.r + MIN_GAP + 24)) continue;
    if (walls.some(w => segDist(h.x, h.y, w) < h.reach * 0.5)) continue;
    if (!out.every(o => Math.hypot(h.x - o.x, h.y - o.y) >= h.reach + o.reach)) continue;
    out.push(h);
  }
  if (!out.length) throw new Error('no room for a black hole');
  return out;
}

/** Re-rolls a city until the spread audit (tools/spread-metrics.mjs) has
    nothing to flag: no clustering, no glow overlap. */
async function buildSpread(id, tpl, oldGift, world){
  const { measure } = await import('./spread-metrics.mjs');
  let last;
  for (let attempt = 0; attempt < 200; attempt++){
    try { last = build(id, tpl, oldGift, attempt, world); } catch (e) { continue; }
    const m = measure({ ...last, boxes: last.box ? [last.box] : [], stars: last.stars || [] });
    if (!m.flags.length) return last;
  }
  if (!last) throw new Error(`level ${id}: template problem - nothing placed`);
  console.log(`  ! level ${id}: kept a layout the spread audit still flags`);
  return last;
}

function build(id, tpl, oldGift, attempt, world){
  const r = rng(id * 104729 + attempt * 7);
  /* The twin's PATTERN, not its positions: flipped left-right half the time,
     and the drop, target and box each nudged a little, so no board can be
     recognised as a copy of the one twenty levels back. */
  const flip = r() < 0.5;
  const m = x => flip ? W - x : x;
  const nudge = (v, d, lo, hi) => Math.max(lo, Math.min(hi, v + rint(r, -d, d)));
  const spawn = { x: nudge(m(tpl.spawn.x), 40, 40, W - 40), y: tpl.spawn.y };
  const tr = tpl.target.r;
  const dx = rint(r, -40, 40), dy = rint(r, -40, 40);
  const tpm = tpl.targetMove;
  /* a patrol moves as one piece, so both waypoints stay on the board */
  const xs = tpm ? [m(tpm.x0), m(tpm.x1)] : [m(tpl.target.x)];
  const sx = Math.max(tr + 12 - Math.min(...xs), Math.min(W - tr - 12 - Math.max(...xs), dx));
  const target = { x: xs[0] + sx, y: Math.max(tr + 150, Math.min(H - tr - 20, tpl.target.y + dy)), r: tr };
  const targetMove = tpm ? { x0: xs[0] + sx, x1: xs[1] + sx, period: tpm.period + rint(r, -15, 15) } : null;
  const wallSide = tpl.wallSide ? (flip === (tpl.wallSide === 'left') ? 'right' : 'left') : undefined;
  const box = tpl.box ? { x: nudge(m(tpl.box.x), 40, 40, W - 40), y: nudge(tpl.box.y, 40, 130, H - 40), r: BOX_R, kind: 'x' } : null;
  if (box && Math.hypot(box.x - target.x, box.y - target.y) < tr + BOX_R + 60) throw new Error('box on target');
  const walls = targetWalls(tpl.targetType, wallSide, target);

  /* the target along its whole patrol, as glowing circles */
  const lane = [];
  const [x0, x1] = targetMove ? [targetMove.x0, targetMove.x1] : [target.x, target.x];
  for (let k = 0; k <= 8; k++) lane.push({ x: x0 + (x1 - x0) * k / 8, y: target.y, r: target.r, kind: 't' });

  /* kinds and radii exactly as the twin has them, fires first so each is
     placed while there is still room for its glow */
  const pieces = [...tpl.fires.map(o => ({ r: o.r, kind: 'f' })),
                  ...tpl.breakables.map(o => ({ r: o.r, kind: 'b' })),
                  ...tpl.obstacles.map(o => ({ r: o.r, kind: 'o' }))];
  /* DENSE worlds (Outer Space) crowd the board: extra small red obstacles
     on top of the twin's own, more of them the later the city */
  if (world.addOn === 'dense'){
    const p = id - world.from + 1;
    for (let k = 0, n = p <= 8 ? 2 : p <= 12 ? 3 : 4; k < n; k++) pieces.push({ r: rint(r, 16, 20), kind: 'o' });
  }
  const placed = [];
  for (const pc of pieces){
    let best = null, bestScore = -Infinity;
    for (let c = 0; c < 400; c++){
      const o = { x: rint(r, pc.r + MIN_GAP, W - pc.r - MIN_GAP), y: rint(r, 110, H - pc.r - 30), r: pc.r, kind: pc.kind };
      if (!lane.every(t => apart(o, t, 40))) continue;             // room round the target and its patrol
      if (walls.some(s => segDist(o.x, o.y, s) < o.r + MIN_GAP + 5)) continue;
      if (Math.hypot(o.x - spawn.x, o.y - spawn.y) < o.r + 70) continue;
      if (box && !apart(o, box)) continue;
      if (!placed.every(q => apart(o, q))) continue;
      let score = Math.min(o.x - o.r, W - o.x - o.r);
      for (const q of [...placed, ...lane, ...(box ? [box] : [])])
        score = Math.min(score, Math.hypot(q.x - o.x, q.y - o.y) - need(o, q));
      if (score > bestScore){ bestScore = score; best = o; }
    }
    if (!best) throw new Error(`level ${id}: no room for a ${pc.kind} of r${pc.r} - template problem`);
    placed.push(best);
  }

  /* the world's own mechanic, on top of the twin's layout */
  const pos = id - world.from + 1;                      // 1..16
  let wind, storm, crabs, stars;
  if (world.addOn === 'wind'){
    const lo = targetMove ? { ...target, x: (x0 + x1) / 2 } : target;
    wind = windFor(r, pos <= 8 ? 1 : 2, pos >= 13, spawn.x, lo, lo);
  } else if (world.addOn === 'storm'){
    storm = stormFor(r, pos <= 8 ? 4 : pos <= 12 ? 5 : 6, spawn, lane);
    if (!storm) throw new Error('no room for the storm');
  } else if (world.addOn === 'stars'){
    stars = starsFor(r, pos <= 8 ? 2 : pos <= 12 ? 3 : 4, spawn, lane, [...placed, ...(box ? [box] : [])], walls);
  } else if (world.addOn === 'crabs'){
    crabs = crabFor(r, pos <= 8 ? 2 : pos <= 12 ? 3 : 4, spawn, lane, [...placed, ...(box ? [box] : [])]);
    if (!crabs) throw new Error('no room for the crabs');
  }

  /* the world's own HAZARD ZONE, last, around everything already placed */
  let quicksand, blackholes;
  const others = [...placed, ...(box ? [box] : []), ...(stars || []).map(p => ({ ...p, r: 14 }))];
  if (world.hazard === 'quicksand') quicksand = pitsFor(r, pos <= 8 ? 1 : 2, spawn, lane, others, walls);
  if (world.hazard === 'blackholes'){
    blackholes = holesFor(r, pos <= 8 ? 1 : 2, spawn, lane, others, walls);
    /* THE RHYTHM - every hole switches its gravity on and off (levels/blackhole):
       a long quiet gap early, shorter and busier later; a second hole on its
       own period, so the player hunts for the moment both are quiet. */
    const tr = rng(mix(id + 5000));
    const [period, on] = pos <= 8 ? [270, 80] : pos <= 12 ? [230, 90] : [200, 95];
    blackholes = blackholes.map((h, k) => {
      const p = period + k * 50;
      return { ...h, period: p, on, offset: rint(tr, 0, p - 1) };
    });
  }

  const pick = k => placed.filter(o => o.kind === k).map(({ x, y, r }) => ({ x, y, r }));
  return { id, name: world.names[id], quicksand, blackholes, maxBlocks: tpl.maxBlocks, targetType: tpl.targetType, wallSide,
           spawn, obstacles: pick('o'), breakables: pick('b'), fires: pick('f'), wind, storm, crabs, stars,
           box: box && { x: box.x, y: box.y }, target, targetMove, gift: oldGift };
}

/** The level as it is stored, fields in the file's usual order. */
function toRaw(L){
  return { id: L.id, name: L.name, maxBlocks: L.maxBlocks, targetType: L.targetType,
           wallSide: L.targetType !== 'OPEN' ? L.wallSide : undefined,
           spawn: L.spawn, obstacles: L.obstacles,
           breakables: L.breakables.length ? L.breakables : undefined,
           fires: L.fires.length ? L.fires : undefined,
           wind: L.wind, storm: L.storm, crabs: L.crabs,
           stars: L.stars && L.stars.length ? L.stars : undefined,
           quicksand: L.quicksand && L.quicksand.length ? L.quicksand : undefined,
           blackholes: L.blackholes && L.blackholes.length ? L.blackholes : undefined,
           boxes: L.box ? [L.box] : undefined,
           target: L.target, targetMove: L.targetMove || undefined,
           targetGift: L.gift || undefined };
}

/** Build a twenty-city world's first sixteen cities from Emberkeep's
    (`twin` is the id of Emberkeep's city at the same position). */
export async function runWorld(world){
  const raw = await loadRaw();
  const byId = id => raw.find(l => l.id === id);
  const out = [];
  for (let id = world.from; id < world.from + 16; id++){
    const twin = byId(21 + id - world.from);
    const L = await buildSpread(id, fromRaw(twin), !!byId(id).targetGift, world);
    /* a world can swap its fire for red obstacles, same size, same spot
       (Stormhold: fire does not belong in the rain) */
    if (world.noFire){ L.obstacles.push(...L.fires); L.fires = []; }
    /* OCCASIONAL WIND: some cities also get Windemere's wind, picked by a
       random draw of their own - separate from the layout's, so adding it
       never moves anything already on the board. */
    if (world.windChance && !L.wind){
      const wr = rng(mix(id));
      if (mix(id + 1000) / 4294967296 < world.windChance){
        const pos = id - world.from + 1;
        const lo = L.targetMove ? { ...L.target, x: (L.targetMove.x0 + L.targetMove.x1) / 2 } : L.target;
        L.wind = windFor(wr, pos <= 8 ? 1 : 2, pos >= 13, L.spawn.x, lo, lo);
      }
    }
    out.push(toRaw(L));
    const n = L.fires.length + L.breakables.length + L.obstacles.length;
    const extra = [L.quicksand && `${L.quicksand.length} quicksand`, L.blackholes && `${L.blackholes.length} black hole(s)`,
                   L.stars && L.stars.length && `${L.stars.length} stars`, L.storm && `storm ${L.storm.points.length} points`, L.crabs && `${L.crabs.length} crabs (${L.crabs.map(c => c.pattern).join(', ')})`,
                   L.wind && 'wind ' + L.wind.map(z => (z.ax > 0 ? '+' : '') + z.ax).join(' ')]
                  .filter(Boolean).join(', ');
    console.log(`${id} ${L.name.padEnd(15)} ${String(n).padStart(2)} hazards (f${L.fires.length} b${L.breakables.length} o${L.obstacles.length})` +
                `  ${extra}  ${L.targetType}${L.targetMove ? ' moving' : ''}  blocks ${L.maxBlocks}${L.gift ? '  gift' : ''}`);
  }
  writeLevels(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runWorld({ from: 41, names: NAMES, addOn: 'wind' });
