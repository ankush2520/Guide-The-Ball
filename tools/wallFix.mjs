/**
 * Give a crowded one-ramp level a small WALL round its target.
 *   node tools/wallFix.mjs <levelId>      (writes ~/wallfix.<id>.json)   ;   --apply
 * Tries SIDE_WALL / POCKET on each side, removes the 1-2 obstacles the wall
 * would touch (spacing law), and keeps the first variant where no single
 * ramp wins AND a two-ramp route still does.
 */
import { physicsBundle } from './harness.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';
import vm from 'node:vm';
import fs from 'node:fs';
const HOME = process.env.HOME, GAP = 18, R = Math.PI / 180, W = 480, H = 800;
const T0S = [0, 37, 71, 113, 149, 191], SEEDS = [1, 2, 3, 4, 5, 6, 7];
const ramp = (cx, cy, deg) => { const a = deg * R, hx = Math.cos(a) * 60, hy = Math.sin(a) * 60;
  return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
const segDist = (px, py, s) => { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)); };
if (process.argv.includes('--apply')) {
  const raw = await loadRaw(), out = [];
  for (const id of [89, 115, 135]) { try { out.push(JSON.parse(fs.readFileSync(`${HOME}/wallfix.${id}.json`, 'utf8')).raw); } catch {} }
  writeLevels(out); console.log('applied', out.map(l => l.id).join(','), '(', raw.length, 'levels )'); process.exit(0);
}
const id = Number(process.argv[2]);
const ctx = vm.createContext({ window: {}, console, Math, performance, setTimeout, structuredClone });
ctx.window.window = ctx.window; ctx.globalThis = ctx;
vm.runInContext(await physicsBundle(null), ctx);
const g = ctx.window.__gtb;
const base = (await loadRaw()).find(l => l.id === id);
const timed = L => !!(L.targetMove || L.storm || (L.crabs && L.crabs.length) || (L.blackholes && L.blackholes.length));
const wins = (cfg, li, t0) => SEEDS.every(s => g.simulate(cfg, s, li, null, t0).result === 'win');
function refs(li) {
  const dl = Date.now() + 45000;
  const L = g.LEVELS[li], sx = L.spawn.x, tc = L.target, t0s = timed(L) ? T0S : [0];
  for (let ry = L.spawn.y + 90; ry <= H - 170; ry += 24) for (let t1 = 28; t1 <= 152; t1 += 6) {
    const phi = (2 * t1 - 90) * R;
    for (let len = 80; len <= 440; len += 24) {
      const p2 = { x: sx + Math.cos(phi) * len, y: ry + Math.sin(phi) * len };
      if (p2.x < 25 || p2.x > W - 25 || p2.y < 25 || p2.y > H - 55) continue;
      const aim = ((Math.atan2(tc.y - p2.y, tc.x - p2.x) + phi) / 2) / R;
      for (const A of [-24, -12, 0, 12, 24]) { const cfg = [ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + A)];
        if (t0s.some(t0 => wins(cfg, li, t0))) return true; }
      if (Date.now() > dl) return false;
    }
  }
  return false;
}
/* a QUICK one-ramp screen (coarse grid); the full audit is run afterwards */
function audit(g, li, t0s) {
  const L = g.LEVELS[li], t = timed(L) ? t0s : [0], need = timed(L) ? Math.ceil(t.length / 2) : 1, sx = L.spawn.x;
  const test = cfg => { let n = 0, f = 0; for (const t0 of t) { if (wins(cfg, li, t0)) n++; else if (++f > t.length - need) return false; } return n >= need; };
  for (let ry = L.spawn.y + 60; ry <= H - 110; ry += 30) for (let th = 20; th <= 160; th += 4) if (test([ramp(sx, ry, th)])) return [1];
  for (let rx = 40; rx <= 440; rx += 40) for (let ry = 130; ry <= 680; ry += 40) for (let th = 20; th <= 160; th += 8) if (test([ramp(rx, ry, th)])) return [1];
  return [];
}
const variants = [];
for (const tt of ['POCKET', 'SIDE_WALL']) for (const side of ['left', 'right']) variants.push({ tt, side });
const out = `${HOME}/wallfix.${id}.json`, tag = `${id}/${process.argv[3] ?? 'all'}`;
for (const [vi, v] of variants.entries()) {
  if (process.argv[3] !== undefined && Number(process.argv[3]) !== vi) continue;
  const raw = structuredClone(base);
  raw.targetType = v.tt; raw.wallSide = v.side;
  let li = g.scratch(structuredClone(raw), 0);
  const walls = g.LEVELS[li].walls;
  // remove the obstacles the new wall touches (spacing law), fewest first
  const hit = raw.obstacles.map((o, i) => ({ i, d: Math.min(...walls.map(s => segDist(o.x, o.y, s))) - o.r })).filter(x => x.d < GAP + 5);
  if (hit.length > 2) { console.log(tag, v.tt, v.side, 'skip: would remove', hit.length); continue; }
  raw.obstacles = raw.obstacles.filter((_, i) => !hit.some(h => h.i === i));
  const bad = [...(raw.fires || []), ...(raw.breakables || [])].some(o => Math.min(...walls.map(s => segDist(o.x, o.y, s))) < o.r + GAP);
  if (bad) { console.log(tag, v.tt, v.side, 'skip: fire/breakable in the way'); continue; }
  li = g.scratch(structuredClone(raw), 0);
  const easy = audit(g, li, T0S);
  console.log(tag, v.tt, v.side, 'removed', hit.length, easy.length ? 'still easy' : 'no single ramp wins', easy.length ? '' : (refs(li) ? '-> two-ramp route exists: KEEP' : '-> NO two-ramp route'));
  if (!easy.length && refs(li)) { fs.writeFileSync(out.replace('.json', '.v' + vi + '.json'), JSON.stringify({ raw, v, removed: hit.length })); process.exit(0); }
}
console.log(tag, 'no variant worked');
