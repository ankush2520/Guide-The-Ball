/**
 * Hand-shaped "long way round" levels.   node tools/ovalLevels.mjs
 *
 * Rewrites levels 17-20 and 37-40 in src/levels/levels.data.ts:
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
 * the bottom-right corner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(root, 'src/levels/levels.data.ts');
const W = 480, H = 800, GAP = 18;

function rng(seed){ return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const gapOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
const fmt = list => '[' + list.map(o => `{x:${o.x},y:${o.y},r:${o.r}}`).join(',') + ']';

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
function build(id, seed, fire){
  const r = rng(seed);
  for (let attempt = 0; attempt < 5000; attempt++){
    const L = tryBuild(r, fire);
    if (L) return L;
  }
  throw new Error(`level ${id}: no layout found`);
}

function tryBuild(r, fire){
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

  /* The gift box, somewhere open. */
  let box = null;
  for (let c = 0; c < 200 && !box; c++){
    const b = { x: rint(r, 40, W - 40), y: rint(r, 150, H - 40), r: 20 };
    if (ovalGap(pts, oval, b) >= GAP && laneGap(b) >= 30 && placed.every(q => gapOf(b, q) >= GAP)) box = b;
  }
  if (!box) return null;

  let L = { spawn, target, targetMove, oval, box: { x: box.x, y: box.y }, placed };
  if (r() < 0.5){                      // random side
    const m = o => ({ ...o, x: W - o.x });
    L = { spawn: m(spawn), target: m(target), box: m(L.box), placed: placed.map(m),
          oval: { ...oval, x: W - oval.x, angle: -oval.angle },
          targetMove: { ...targetMove, x0: W - tx, x1: W - tx } };
  }
  const strip = ({ x, y, r }) => ({ x, y, r });
  return { ...L,
           obstacles: L.placed.filter(o => o.kind === 'o').map(strip),
           fires: L.placed.filter(o => o.kind === 'f').map(strip),
           breakables: L.placed.filter(o => o.kind === 'b').map(strip) };
}

/** Replace level `id`'s whole block, keeping its name and gift flag. */
function writeLevel(parts, id, L){
  const i = parts.findIndex(p => p.startsWith(`{ id:${id},`));
  const old = parts[i];
  const name = old.match(/name:"([^"]*)"/)[1];
  const gift = /targetGift:true/.test(old);
  const at = old.indexOf('target:');
  const tail = old.slice(old.indexOf(' },', at) + 3);       // blank lines / next comment
  const m = L.targetMove;
  let s = `{ id:${id}, name:"${name}", maxBlocks:3, targetType:'OPEN', needsSpring:true,\n` +
          `    spawn:{x:${L.spawn.x},y:${L.spawn.y}},\n`;
  if (L.obstacles.length) s += `    obstacles:${fmt(L.obstacles)},\n`;
  if (L.breakables.length) s += `    breakables:${fmt(L.breakables)},\n`;
  if (L.fires.length) s += `    fires:${fmt(L.fires)},\n`;
  const v = L.oval;
  s += `    ovals:[{x:${v.x},y:${v.y},rx:${v.rx},ry:${v.ry},angle:${v.angle}}],\n`;
  s += `    boxes:[{x:${L.box.x},y:${L.box.y}}],\n` +
       `    target:{x:${L.target.x},y:${L.target.y},r:${L.target.r}},\n` +
       `    targetMove:{x0:${m.x0},x1:${m.x1},y0:${m.y0},y1:${m.y1},period:${m.period}}` +
       (gift ? ', targetGift:true' : '') + ' },' + tail;
  parts[i] = s;
}

/** Move a level's target into the bottom-right corner, and push anything in
    the way somewhere clear. */
function cornerTarget(parts, id, seed){
  const r = rng(seed);
  const i = parts.findIndex(p => p.startsWith(`{ id:${id},`));
  let p = parts[i];
  const tr = +p.match(/target:\{x:\d+,y:\d+,r:(\d+)\}/)[1];
  const tgt = { x: W - tr - 28, y: H - tr - 34, r: tr };
  p = p.replace(/target:\{x:\d+,y:\d+,r:\d+\}/, `target:{x:${tgt.x},y:${tgt.y},r:${tr}}`);
  /* spawn in the far top corner, so it is not a straight drop */
  p = p.replace(/spawn:\{x:\d+,/, `spawn:{x:${rint(r, 45, 70)},`);
  const lists = {};
  for (const k of ['obstacles', 'fires', 'breakables']){
    const m = p.match(new RegExp(`${k}:(\\[[^\\]]*\\])`));
    if (m) lists[k] = [...m[1].matchAll(/\{x:(-?\d+),y:(-?\d+),r:(\d+)\}/g)].map(a => ({ x:+a[1], y:+a[2], r:+a[3] }));
  }
  const every = () => Object.values(lists).flat();
  const clearOfTarget = o => gapOf(o, tgt) >= 50;
  for (const list of Object.values(lists))
    for (const o of list){
      if (clearOfTarget(o)) continue;
      for (let k = 0; k < 500; k++){
        const c = { x: rint(r, o.r + 20, W - o.r - 20), y: rint(r, 140, H - o.r - 20), r: o.r };
        if (clearOfTarget(c) && every().every(q => q === o || gapOf(c, q) >= GAP)){ o.x = c.x; o.y = c.y; break; }
      }
    }
  for (const [k, list] of Object.entries(lists)) p = p.replace(new RegExp(`${k}:\\[[^\\]]*\\]`), `${k}:${fmt(list)}`);
  /* the box: out of the corner too */
  p = p.replace(/boxes:\[\{x:(\d+),y:(\d+)\}\]/, (all, x, y) =>
    Math.hypot(+x - tgt.x, +y - tgt.y) < 90 ? `boxes:[{x:${W - +x},y:${Math.min(+y, 600)}}]` : all);
  parts[i] = p;
}

const parts = fs.readFileSync(FILE, 'utf8').split(/(?=\{ id:\d+,)/);
cornerTarget(parts, 15, 1501);
cornerTarget(parts, 16, 1601);
for (const id of [17, 18, 19, 20]) writeLevel(parts, id, build(id, id * 7919, false));
for (const id of [37, 38, 39, 40]) writeLevel(parts, id, build(id, id * 7919, true));
fs.writeFileSync(FILE, parts.join(''));
console.log('wrote levels 15-20 and 37-40');
