/**
 * Hand-shaped "long way round" levels.   node tools/ovalLevels.mjs
 *
 * Rewrites levels 17-20, 37-40 and 57-60 in src/levels/levels.data.ts:
 *
 *   - the ball drops in one top corner;
 *   - one big solid OVAL (levels/ovals.ts), tilted, runs off the far edge,
 *     so the far side is closed from above;
 *   - the target rides UP AND DOWN in the cave under the oval's high end,
 *     always above the oval's lowest point,
 *
 * so the route is down the near side, under the oval, and SPRUNG back up
 * into the cave - the levels are flagged needsSpring. A few loose hazards
 * sit on the route (fire and breakables in Emberkeep). Every pair of hazards is
 * at least 2 * BALL_R apart, edge to edge. Nothing is solver-checked: these
 * are play-tested by hand. Also moves the targets of levels 15 and 16 into
 * the bottom-right corner. Emberkeep (37-40) and Windemere (57-60) add 8 red
 * obstacles on top, and Windemere one wind zone on the near-side lane.
 *
 *   node tools/ovalLevels.mjs --only=57-60     # just those ids
 *
 * Stormhold (77-80) gets a six-point thunderstorm instead of the wind, and
 * Coralis Deep (97-100) two eater fish.
 */
import { NAMES as WIND_NAMES, FIRE_GLOW, BOX_GLOW, BOX_R, GLOW_PAD, STORM_R, stormFor, fishFor, fishPath, mix } from './windLevels.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';
import { NAMES as STORM_NAMES } from './stormLevels.mjs';
import { NAMES as FISH_NAMES } from './fishLevels.mjs';
const W = 480, H = 800, GAP = 18;

function rng(seed){ return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const gapOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;

/* ---- oval geometry, matching src/levels/ovals.ts ---- */
const WALL_HT = 5;
function ovalPts(o, n = 360){
  const a = o.angle * Math.PI / 180, pts = [];
  for (let i = 0; i < n; i++){
    const t = i / n * Math.PI * 2, ex = o.rx * Math.cos(t), ey = o.ry * Math.sin(t);
    pts.push({ x: o.x + ex * Math.cos(a) - ey * Math.sin(a), y: o.y + ex * Math.sin(a) + ey * Math.cos(a) });
  }
  return pts;
}
function insideOval(o, x, y){
  const a = -o.angle * Math.PI / 180, dx = x - o.x, dy = y - o.y;
  const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
  return (u / o.rx) ** 2 + (v / o.ry) ** 2 <= 1;
}
/** Clear air between a circle and the oval's collidable surface. */
function ovalGap(pts, o, c){
  if (insideOval(o, c.x, c.y)) return -1;
  let d = Infinity;
  for (const p of pts) d = Math.min(d, Math.hypot(p.x - c.x, p.y - c.y));
  return d - c.r - WALL_HT;
}

/** One level, drawn spawn-left / cave-right, mirrored at the end if asked.
    Retries its own random draw until the cave has room for a real patrol. */
function build(id, seed, fire, opts = {}){
  const r = rng(seed);
  for (let attempt = 0; attempt < 5000; attempt++){
    const L = tryBuild(r, fire, opts);
    if (L) return L;
  }
  throw new Error(`level ${id}: no layout found`);
}

function tryBuild(r, fire, { extraRed = 0, wind = false, storm = false, fish = false } = {}){
  const spawn = { x: rint(r, 40, 65), y: 40 };

  /* THE OVAL: long, tilted up toward the far side, and running off the far
     edge - so the far side is closed from above, and what lands on it rolls
     back toward the near side. "Off the edge" means off the PLAY area, which
     is wider than the 480 design box (constants.ts PLAY: up to x = 625 on a
     tablet), so the far tip goes past 650. */
  const tilt = rint(r, 20, 34);
  const tipX = rint(r, 125, 170), farX = rint(r, 655, 700);
  const cos = Math.cos(tilt * Math.PI / 180);
  const oval = { x: Math.round((tipX + farX) / 2), y: rint(r, 330, 430),
                 rx: Math.round((farX - tipX) / (2 * cos)), ry: rint(r, 55, 90), angle: -tilt };
  const pts = ovalPts(oval);
  const minX = Math.min(...pts.map(p => p.x)), yLow = Math.max(...pts.map(p => p.y));
  if (minX - WALL_HT < 95) return null;                 // room to fall down the near side
  if (yLow < 520 || yLow > 620) return null;            // room to pass under it

  /* THE TARGET, in the cave under the high end. Its lowest point stays ABOVE
     the oval's lowest point by more than a ball, so a ball that passed under
     the oval - and is falling - can never roll into it: it has to go UP. */
  const tr = rint(r, 22, 25);
  const tx = rint(r, 400, W - tr - 14);
  const yMax = Math.floor(yLow + WALL_HT - tr - 16);
  let yMin = null;
  for (let y = 100; y <= yMax; y++)
    if (ovalGap(pts, oval, { x: tx, y, r: tr }) >= 14 && !insideOval(oval, tx, y)
        && pts.some(p => Math.abs(p.x - tx) < 4 && p.y < y)){ yMin = y; break; }
  if (yMin === null || yMax - yMin < 55) return null;
  const y0 = yMin + rint(r, 0, 6), y1 = yMax - rint(r, 0, 6);
  const target = { x: tx, y: y0, r: tr };
  const targetMove = { x0: tx, x1: tx, y0, y1, period: rint(r, 110, 170) };

  /* A FEW HAZARDS on the route, spread out: never in the oval, never in the
     target's lane, never on the drop point, and 2 * BALL_R apart. */
  const kinds = fire ? ['f', 'f', 'b', 'b', 'o'] : ['o', 'o', 'o', 'o', 'o'].slice(0, rint(r, 4, 5));
  const placed = [];
  const laneGap = c => {
    const k = Math.max(0, Math.min(1, (c.y - y0) / (y1 - y0)));
    return Math.hypot(c.x - tx, c.y - (y0 + k * (y1 - y0))) - c.r - tr;
  };
  for (const kind of kinds){
    let best = null, bestScore = -Infinity;
    for (let c = 0; c < 120; c++){
      const rad = rint(r, 17, 22);
      const o = { x: rint(r, rad + GAP, W - rad - GAP), y: rint(r, 130, H - rad - 24), r: rad, kind };
      if (ovalGap(pts, oval, o) < GAP) continue;
      if (laneGap(o) < 55) continue;
      if (Math.hypot(o.x - spawn.x, o.y - spawn.y) < o.r + 90) continue;
      if (!placed.every(q => gapOf(o, q) >= GAP)) continue;
      let score = Math.min(o.x - o.r, W - o.x - o.r, ovalGap(pts, oval, o));
      for (const q of placed) score = Math.min(score, gapOf(o, q));
      if (score > bestScore){ bestScore = score; best = o; }
    }
    if (!best) return null;
    placed.push(best);
  }

  /* EATER FISH (Coralis Deep): two, placed BEFORE the extra red and the
     box so they get the room first - wavy lanes clear of the oval, every
     hazard so far, the drop and the target's cave. Everything placed after
     keeps MIN_GAP from their whole paths. */
  let fishes, fishPts = [];
  if (fish){
    const lane = [];
    for (let k = 0; k <= 6; k++) lane.push({ x: tx, y: y0 + (y1 - y0) * k / 6, r: tr });
    fishes = fishFor(r, 2, spawn, lane, placed, p => ovalGap(pts, oval, p) >= GAP);
    if (!fishes) return null;
    fishPts = fishes.flatMap(fishPath);
  }
  const fishClear = o => fishPts.every(p => gapOf(o, p) >= GAP);

  /* EXTRA RED, so the board does not read empty: the same rules, plus the
     column under the cave stays open - it is where the spring goes. */
  const lowY = Math.max(y0, y1);
  for (let n = 0; n < extraRed; n++){
    let best = null, bestScore = -Infinity;
    for (let c = 0; c < 300; c++){
      const o = { x: rint(r, 35, W - 35), y: rint(r, 120, H - 40), r: rint(r, 16, 22), kind: 'o' };
      if (o.x - o.r < GAP || o.x + o.r > W - GAP) continue;
      if (laneGap(o) < 55) continue;
      if (o.y > lowY && Math.abs(o.x - tx) < tr + o.r + 45) continue;
      if (ovalGap(pts, oval, o) < GAP) continue;
      if (Math.hypot(o.x - spawn.x, o.y - spawn.y) < o.r + 90) continue;
      if (!placed.every(q => gapOf(o, q) >= GAP)) continue;
      if (!fishClear(o)) continue;
      let score = Math.min(o.x - o.r, W - o.x - o.r, ovalGap(pts, oval, o));
      for (const q of placed) score = Math.min(score, gapOf(o, q));
      if (score > bestScore){ bestScore = score; best = o; }
    }
    if (!best) return null;
    placed.push(best);
  }

  /* WIND (Windemere): one zone on the near-side drop lane, blowing toward
     the oval - never over the spawn, and nowhere near the far-side cave. */
  let zones = [];
  if (wind){
    const zw = Math.floor(minX - WALL_HT - 12);
    const zy = rint(r, 140, 200), zh = Math.min(rint(r, 180, 280), Math.floor(yLow) - 30 - zy);
    if (zw < 60 || zh < 120) return null;
    zones = [{ x: 0, y: zy, w: zw, h: zh, ax: rint(r, 35, 70) / 100, ay: 0 }];
  }

  /* THUNDERSTORM (Stormhold): six strike points spread over the open board -
     never inside the oval, never reaching the target on its patrol. */
  let st;
  if (storm){
    const lane = [];
    for (let k = 0; k <= 6; k++) lane.push({ x: tx, y: y0 + (y1 - y0) * k / 6, r: tr });
    st = stormFor(r, 6, spawn, lane, p => ovalGap(pts, oval, { ...p, r: 0 }) >= 10);
    if (!st) return null;
  }

  /* The gift box, somewhere open. */
  let box = null;
  for (let c = 0; c < 200 && !box; c++){
    const b = { x: rint(r, 40, W - 40), y: rint(r, 150, H - 40), r: BOX_R };
    /* its glow stays clear of every visible edge, fire's glow included */
    const glowClear = q => Math.hypot(q.x - b.x, q.y - b.y) >=
      BOX_R * BOX_GLOW + (q.kind === 'f' ? q.r * FIRE_GLOW : q.r) + GLOW_PAD;
    if (ovalGap(pts, oval, b) >= GAP && laneGap(b) >= 30 && placed.every(q => gapOf(b, q) >= GAP && glowClear(q)) && fishClear(b)) box = b;
  }
  if (!box) return null;

  let L = { spawn, target, targetMove, oval, box: { x: box.x, y: box.y }, placed, zones, storm: st, fish: fishes };
  if (r() < 0.5){                      // random side
    const m = o => ({ ...o, x: W - o.x });
    L = { spawn: m(spawn), target: m(target), box: m(L.box), placed: placed.map(m),
          oval: { ...oval, x: W - oval.x, angle: -oval.angle },
          targetMove: { ...targetMove, x0: W - tx, x1: W - tx },
          zones: zones.map(z => ({ ...z, x: W - z.x - z.w, ax: -z.ax })),
          storm: st && { points: st.points.map(m), gaps: st.gaps },
          fish: fishes && fishes.map(f => ({ ...f, x0: W - f.x0, x1: W - f.x1 })) };
  }
  const strip = ({ x, y, r }) => ({ x, y, r });
  return { ...L,
           obstacles: L.placed.filter(o => o.kind === 'o').map(strip),
           fires: L.placed.filter(o => o.kind === 'f').map(strip),
           breakables: L.placed.filter(o => o.kind === 'b').map(strip) };
}

/** The oval level as it is stored, keeping the old level's name (unless a
    new one is given) and its gift flag. */
function ovalLevel(old, L, newName){
  const m = L.targetMove;
  return { id: old.id, name: newName || old.name, maxBlocks: 3, targetType: 'OPEN', needsSpring: true,
           spawn: L.spawn,
           obstacles: L.obstacles.length ? L.obstacles : undefined,
           breakables: L.breakables.length ? L.breakables : undefined,
           fires: L.fires.length ? L.fires : undefined,
           wind: L.zones && L.zones.length ? L.zones : undefined,
           storm: L.storm || undefined,
           fish: L.fish || undefined,
           ovals: [L.oval], boxes: [L.box], target: L.target,
           targetMove: { x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, period: m.period },
           targetGift: old.targetGift || undefined };
}

/** Move a level's target into the bottom-right corner, and push anything in
    the way somewhere clear. */
function cornerTarget(lv, seed){
  const r = rng(seed);
  const tr = lv.target.r;
  const tgt = { x: W - tr - 28, y: H - tr - 34, r: tr };
  lv.target = { x: tgt.x, y: tgt.y, r: tr };
  /* spawn in the far top corner, so it is not a straight drop */
  lv.spawn = { ...lv.spawn, x: rint(r, 45, 70) };
  const every = () => [...(lv.obstacles || []), ...(lv.fires || []), ...(lv.breakables || [])];
  const clearOfTarget = o => gapOf(o, tgt) >= 50;
  for (const o of every()){
    if (clearOfTarget(o)) continue;
    for (let k = 0; k < 500; k++){
      const c = { x: rint(r, o.r + 20, W - o.r - 20), y: rint(r, 140, H - o.r - 20), r: o.r };
      if (clearOfTarget(c) && every().every(q => q === o || gapOf(c, q) >= GAP)){ o.x = c.x; o.y = c.y; break; }
    }
  }
  /* the box: out of the corner too */
  const b = lv.boxes && lv.boxes[0];
  if (b && Math.hypot(b.x - tgt.x, b.y - tgt.y) < 90) lv.boxes = [{ x: W - b.x, y: Math.min(b.y, 600) }];
  return lv;
}

/** OCCASIONAL WIND for an exam level: with chance `p` (its own random draw,
    so the layout never moves), one zone on the NEAR-side drop lane - the
    spawn's side of the oval - blowing toward the oval, like 57-60's. */
function maybeWind(L, id, p){
  const wr = rng(mix(id));
  if (mix(id + 1000) / 4294967296 >= p) return;
  const pts = ovalPts(L.oval);
  const yLow = Math.max(...pts.map(q => q.y));
  const leftSpawn = L.spawn.x < W / 2;
  const edge = leftSpawn ? Math.min(...pts.map(q => q.x)) - WALL_HT - 12
                         : Math.max(...pts.map(q => q.x)) + WALL_HT + 12;
  const zw = Math.floor(leftSpawn ? edge : W - edge);
  const zy = rint(wr, 140, 200), zh = Math.min(rint(wr, 180, 280), Math.floor(yLow) - 30 - zy);
  if (zw < 60 || zh < 120) return;
  L.zones = [{ x: leftSpawn ? 0 : W - zw, y: zy, w: zw, h: zh,
               ax: (leftSpawn ? 1 : -1) * rint(wr, 35, 70) / 100, ay: 0 }];
}

/* --only=57-60 writes just those ids, so re-running for one country never
   rewrites another's. Without it, every oval level is rebuilt. */
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split('-').map(Number);
const want = id => !ONLY[0] || (id >= ONLY[0] && id <= (ONLY[1] || ONLY[0]));

const raw = await loadRaw();
const byId = id => raw.find(l => l.id === id);
const out = [];
if (want(15)) out.push(cornerTarget(byId(15), 1501));
if (want(16)) out.push(cornerTarget(byId(16), 1601));
for (const id of [17, 18, 19, 20]) if (want(id)) out.push(ovalLevel(byId(id), build(id, id * 7919, false)));
for (const id of [37, 38, 39, 40]) if (want(id)) out.push(ovalLevel(byId(id), build(id, id * 7919, true, { extraRed: 8 })));
/* Windemere's exam: Emberkeep's, with one wind zone on the near-side lane */
for (const id of [57, 58, 59, 60]) if (want(id))
  out.push(ovalLevel(byId(id), build(id, id * 7919, true, { extraRed: 8, wind: true }), WIND_NAMES[id]));
/* Stormhold's exam: Emberkeep's, with a six-point thunderstorm - and no
   fire in the rain: each fire becomes a red obstacle in the same place */
for (const id of [77, 78, 79, 80]) if (want(id)){
  const L = build(id, id * 7919, true, { extraRed: 8, storm: true });
  L.obstacles = [...L.obstacles, ...L.fires]; L.fires = [];
  maybeWind(L, id, 0.4);
  out.push(ovalLevel(byId(id), L, STORM_NAMES[id]));
}
/* Coralis Deep's exam: Emberkeep's, under water - two eater fish, and no
   fire: each fire becomes a red obstacle in the same place */
for (const id of [97, 98, 99, 100]) if (want(id)){
  const L = build(id, id * 7919, true, { extraRed: 8, fish: true });
  L.obstacles = [...L.obstacles, ...L.fires]; L.fires = [];
  maybeWind(L, id, 0.4);
  out.push(ovalLevel(byId(id), L, FISH_NAMES[id]));
}
writeLevels(out);
console.log(`wrote levels ${out.map(l => l.id).join(', ')}`);
