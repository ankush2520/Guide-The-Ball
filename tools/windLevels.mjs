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
 * 57-60 are the oval exam: tools/ovalLevels.mjs --only=57-60.
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
const { FIRE_GLOW, TARGET_GLOW, BOX_GLOW, GLOW_PAD, BALL_R, BOX_R, STORM_R } = await (async () => {
  const out = await esbuild.build({ stdin: { contents: `export * from './src/render/glow';
                                                        export { BALL_R, BOX_R } from './src/physics/constants';
                                                        export { STORM_R } from './src/levels/storm';`,
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
export { NAMES, FIRE_GLOW, BOX_GLOW, BOX_R, GLOW_PAD, STORM_R, rng, rint };

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
    veto a point (the oval levels keep points out of the oval). */
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

/** EATER FISH: `n` fish, each on a wavy lane (levels/fish.ts) whose WHOLE
    path stays MIN_GAP clear of every hazard and box in `blockers`, 40px clear
    of the target anywhere on its patrol, clear of the drop point, and of
    every other fish's path. `ok` can veto a point of a path (the oval). */
export function fishPath(f){
  const waves = Math.max(1, Math.round(Math.abs(f.x1 - f.x0) / 110)), out = [];
  for (let i = 0; i <= 40; i++){
    const u = i / 40;
    out.push({ x: f.x0 + (f.x1 - f.x0) * u, y: f.y + f.amp * Math.sin(u * waves * Math.PI * 2), r: f.r });
  }
  return out;
}
export function fishFor(rr, n, spawn, lane, blockers, ok = () => true){
  const fish = [];
  for (let k = 0; k < n; k++){
    let got = null;
    for (let c = 0; c < 500 && !got; c++){
      const fr = rint(rr, 16, 20), len = rint(rr, 130, 260), amp = rint(rr, 14, 30);
      const x0 = rint(rr, fr + 10, W - fr - 10 - len), y = rint(rr, 170, H - 90);
      const f = { x0, x1: x0 + len, y, amp, period: rint(rr, 160, 260), r: fr };
      if (rr() < 0.5) [f.x0, f.x1] = [f.x1, f.x0];
      const pts = fishPath(f);
      if (!pts.every(p => p.y - p.r > 120 && p.y + p.r < H - 20)) continue;
      if (!pts.every(p => Math.hypot(p.x - spawn.x, p.y - spawn.y) >= p.r + 70)) continue;
      if (!pts.every(p => lane.every(t => Math.hypot(p.x - t.x, p.y - t.y) >= p.r + t.r + 40))) continue;
      if (!pts.every(p => blockers.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + MIN_GAP))) continue;
      if (!fish.every(g => fishPath(g).every(q => pts.every(p => Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + MIN_GAP)))) continue;
      if (!pts.every(ok)) continue;
      got = f;
    }
    if (!got) return null;
    fish.push(got);
  }
  return fish;
}

/** Re-rolls a city until the spread audit (tools/spread-metrics.mjs) has
    nothing to flag: no clustering, no glow overlap. */
async function buildSpread(id, tpl, oldGift, world){
  const { measure } = await import('./spread-metrics.mjs');
  let last;
  for (let attempt = 0; attempt < 200; attempt++){
    try { last = build(id, tpl, oldGift, attempt, world); } catch (e) { continue; }
    const m = measure({ ...last, boxes: last.box ? [last.box] : [], stars: [] });
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
  let wind, storm, fish;
  if (world.addOn === 'wind'){
    const lo = targetMove ? { ...target, x: (x0 + x1) / 2 } : target;
    wind = windFor(r, pos <= 8 ? 1 : 2, pos >= 13, spawn.x, lo, lo);
  } else if (world.addOn === 'storm'){
    storm = stormFor(r, pos <= 8 ? 4 : pos <= 12 ? 5 : 6, spawn, lane);
    if (!storm) throw new Error('no room for the storm');
  } else if (world.addOn === 'fish'){
    fish = fishFor(r, pos <= 8 ? 1 : pos <= 12 ? 2 : 3, spawn, lane, [...placed, ...(box ? [box] : [])]);
    if (!fish) throw new Error('no room for the fish');
  }

  const pick = k => placed.filter(o => o.kind === k).map(({ x, y, r }) => ({ x, y, r }));
  return { id, name: world.names[id], maxBlocks: tpl.maxBlocks, targetType: tpl.targetType, wallSide,
           spawn, obstacles: pick('o'), breakables: pick('b'), fires: pick('f'), wind, storm, fish,
           box: box && { x: box.x, y: box.y }, target, targetMove, gift: oldGift };
}

/** The level as it is stored, fields in the file's usual order. */
function toRaw(L){
  return { id: L.id, name: L.name, maxBlocks: L.maxBlocks, targetType: L.targetType,
           wallSide: L.targetType !== 'OPEN' ? L.wallSide : undefined,
           spawn: L.spawn, obstacles: L.obstacles,
           breakables: L.breakables.length ? L.breakables : undefined,
           fires: L.fires.length ? L.fires : undefined,
           wind: L.wind, storm: L.storm, fish: L.fish,
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
    const extra = [L.storm && `storm ${L.storm.points.length} points`, L.fish && `${L.fish.length} eater fish`,
                   L.wind && 'wind ' + L.wind.map(z => (z.ax > 0 ? '+' : '') + z.ax).join(' ')]
                  .filter(Boolean).join(', ');
    console.log(`${id} ${L.name.padEnd(15)} ${String(n).padStart(2)} hazards (f${L.fires.length} b${L.breakables.length} o${L.obstacles.length})` +
                `  ${extra}  ${L.targetType}${L.targetMove ? ' moving' : ''}  blocks ${L.maxBlocks}${L.gift ? '  gift' : ''}`);
  }
  writeLevels(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runWorld({ from: 41, names: NAMES, addOn: 'wind' });
