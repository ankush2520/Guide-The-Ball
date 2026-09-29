/**
 * MAKE ONE-RAMP LEVELS NEED TWO.   node tools/fixOneRamp.mjs [--apply]
 *
 * Reads the easy list from tools/oneRamp.mjs (~/oneramp.done.json). For each
 * easy level it:
 *   1. finds REFERENCE two-ramp wins (proof the level stays solvable),
 *   2. finds the single ramps that win, traces where each ball goes,
 *   3. puts a red obstacle ON the final approach that kills those single
 *      ramps and leaves at least one reference alive (spacing law obeyed),
 *   4. repeats until a full one-ramp audit finds nothing.
 * State is kept in ~/oneramp.fix.json, so it resumes across calls; --apply
 * writes the finished levels into levels.data.ts.
 */
import { physicsBundle } from './harness.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';
import { audit } from './oneRamp.mjs';
import vm from 'node:vm';
import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const HOME = process.env.HOME, STATE = HOME + '/oneramp.fix.json';
const BUDGET_MS = Number(process.env.BUDGET_MS || 100000);
const LEN = 120, R = Math.PI / 180, W = 480, H = 800, GAP = 18, MAX_ADD = 6;
const T0S = [0, 37, 71, 113, 149, 191];
const SEEDS = [1, 2, 3, 4, 5, 6, 7];

async function makeGtb() {
  const ctx = vm.createContext({ window: {}, console, Math, performance, setTimeout, structuredClone });
  ctx.window.window = ctx.window; ctx.globalThis = ctx;
  vm.runInContext(await physicsBundle(null), ctx);
  return ctx.window.__gtb;
}
const ramp = (cx, cy, deg) => { const a = deg * R, hx = Math.cos(a) * LEN / 2, hy = Math.sin(a) * LEN / 2;
  return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
const segDist = (px, py, s) => { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)); };
const timedOf = L => !!(L.targetMove || L.storm || (L.crabs && L.crabs.length) || (L.blackholes && L.blackholes.length));

/** cfg wins on every seed at drop-moment t0 */
const winsAt = (g, li, cfg, t0) => SEEDS.every(s => g.simulate(cfg, s, li, null, t0).result === 'win');
/** first drop moment at which cfg wins, or null */
const winT0 = (g, li, cfg, t0s) => { for (const t0 of t0s) if (winsAt(g, li, cfg, t0)) return t0; return null; };

/** REFERENCE two-ramp wins on the level as it stands (up to n) */
function refsFor(g, li, n, deadline) {
  const L = g.LEVELS[li], sx = L.spawn.x, tc = L.target, out = [];
  const t0s = timedOf(L) ? T0S : [0], AIMS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
  for (let ry = L.spawn.y + 90; ry <= H - 170; ry += 24)
    for (let t1 = 28; t1 <= 152; t1 += 6) {
      const phi1 = (2 * t1 - 90) * R;
      for (let len = 80; len <= 440; len += 24) {
        const p2 = { x: sx + Math.cos(phi1) * len, y: ry + Math.sin(phi1) * len };
        if (p2.x < 25 || p2.x > W - 25 || p2.y < 25 || p2.y > H - 55) continue;
        const aim = ((Math.atan2(tc.y - p2.y, tc.x - p2.x) + phi1) / 2) / R;
        for (const A of AIMS) {
          const cfg = [ramp(sx, ry, t1), ramp(p2.x, p2.y, aim + A)];
          const t0 = winT0(g, li, cfg, t0s);
          if (t0 !== null) { out.push({ cfg, t0 }); if (out.length >= n) return out; break; }
        }
        if (Date.now() > deadline) return out;
      }
    }
  return out;
}

/** the single ramps that win (with their drop moment), from an audit() result */
const rampsOf = (g, li, found) => {
  const L = g.LEVELS[li], t0s = timedOf(L) ? T0S : [0], out = [];
  for (const f of found) {
    const cfg = [ramp(f.x, f.y, f.th)], t0 = winT0(g, li, cfg, t0s);
    if (t0 !== null) out.push({ cfg, t0 });
  }
  return out;
};

/** where the ball goes on a winning ramp: the whole path, final approach first,
    each point also nudged sideways so a blocker can sit beside the line too */
function approach(g, li, w) {
  const tr = g.trace(w.cfg, 1, li, null, w.t0);
  const s = tr.samples, T = g.LEVELS[li].target, pts = [];
  for (let i = s.length - 7; i >= 15; i -= 3) {
    const p = s[i];
    if (Math.hypot(p.x - T.x, p.y - T.y) <= T.r + 30) continue;
    const sp = Math.hypot(p.vx, p.vy) || 1, nx = -p.vy / sp, ny = p.vx / sp;
    for (const o of [0, 16, -16, 30, -30]) pts.push({ x: p.x + nx * o, y: p.y + ny * o });
  }
  return pts;
}

/** may an obstacle of radius r sit at (x,y)? - spacing law and every keep-clear rule */
function legal(L, x, y, r, refs) {
  if (x < r + GAP || x > W - r - GAP || y < 110 || y > H - r - 30) return false;
  if (Math.hypot(x - L.spawn.x, y - L.spawn.y) < r + 70) return false;
  const T = L.target, tm = L.targetMove;
  const lane = tm ? [0, .25, .5, .75, 1].map(k => ({ x: tm.x0 + (tm.x1 - tm.x0) * k, y: tm.y0 !== undefined ? tm.y0 + ((tm.y1 ?? tm.y0) - tm.y0) * k : T.y })) : [T];
  if (!lane.every(p => Math.hypot(x - p.x, y - p.y) >= r + T.r + 40)) return false;
  for (const o of L.obstacles) if (Math.hypot(x - o.x, y - o.y) < r + o.r + GAP) return false;
  for (const o of L.breakables) if (Math.hypot(x - o.x, y - o.y) < r + o.r + GAP) return false;
  for (const o of L.fires) if (Math.hypot(x - o.x, y - o.y) < r + o.r * 1.6 + GAP) return false;
  for (const s of L.walls) if (segDist(x, y, s) < r + GAP + 6) return false;
  for (const b of L.boxes) if (Math.hypot(x - b.x, y - b.y) < r + 16 + 30) return false;
  for (const b of L.stars) if (Math.hypot(x - b.x, y - b.y) < r + 14 + 26) return false;
  for (const q of L.quicksand) if (Math.hypot(x - q.x, y - q.y) < r + q.r + 6) return false;
  for (const h of L.blackholes) if (Math.hypot(x - h.x, y - h.y) < r + h.reach + 10) return false;
  for (const c of L.crabs || []) if (Math.hypot(x - c.cx, y - c.cy) < Math.abs(c.rx) + Math.abs(c.ry) + c.r + r + 30) return false;
  if (L.storm) for (const p of L.storm.points) if (Math.hypot(x - p.x, y - p.y) < 45 + r + 25) return false;
  for (const w of refs) for (const rp of w.cfg) if (segDist(x, y, rp) < r + 8) return false;
  return true;
}

function fixLevel(g, id, st, deadline) {
  const li = g.LEVELS.findIndex(l => l.id === id);
  const raw = st.raw;                                   // the RAW level being edited
  const put = () => g.scratch(structuredClone(raw), 0);
  const L0 = () => g.LEVELS[put()];
  let idx = put();
  if (!st.refs) {
    st.refs = refsFor(g, idx, 5, deadline);
    if (!st.refs.length) { st.status = 'manual: no two-ramp reference'; return; }
    return;                                              // save progress, continue next slice
  }
  let found = audit(g, idx, T0S);
  if (!found.length) { st.status = 'done'; return; }
  if ((raw.obstacles?.length ?? 0) - st.baseObs >= MAX_ADD) { st.status = 'manual: still easy after ' + MAX_ADD + ' blockers'; return; }
  const ones = rampsOf(g, idx, found);
  const paths = ones.map(w => approach(g, idx, w));
  const L = g.LEVELS[idx];
  let best = null;
  for (const r of [21, 18, 16, 24]) {
    for (const pts of paths) for (const p of pts) {
      if (!legal(L, p.x, p.y, r, st.refs)) continue;
      // try it: does it kill the single ramps, and keep a reference?
      raw.obstacles = [...(raw.obstacles ?? []), { x: Math.round(p.x), y: Math.round(p.y), r }];
      const i2 = put();
      const killed = ones.filter(w => winT0(g, i2, w.cfg, [w.t0]) === null).length;
      const alive = st.refs.filter(w => winT0(g, i2, w.cfg, [w.t0]) !== null).length;
      raw.obstacles.pop();
      if (killed && alive && (!best || killed > best.killed || (killed === best.killed && alive > best.alive)))
        best = { x: Math.round(p.x), y: Math.round(p.y), r, killed, alive };
      if (best && best.killed === ones.length && best.alive === st.refs.length) break;
    }
    if (best) break;
  }
  /* nothing fits in the free space: MOVE an existing obstacle onto the line instead */
  let mv = null;
  if (!best) {
    const orig = raw.obstacles ?? [];
    for (let i = 0; i < orig.length; i++) {
      const o = orig[i], L2 = { ...L, obstacles: L.obstacles.filter((_, j) => j !== i) };
      for (const pts of paths) for (const p of pts) {
        if (!legal(L2, p.x, p.y, o.r, st.refs)) continue;
        raw.obstacles = orig.map((q, j) => j === i ? { x: Math.round(p.x), y: Math.round(p.y), r: o.r } : q);
        const i2 = put();
        const killed = ones.filter(w => winT0(g, i2, w.cfg, [w.t0]) === null).length;
        const alive = st.refs.filter(w => winT0(g, i2, w.cfg, [w.t0]) !== null).length;
        raw.obstacles = orig;
        if (killed && alive && (!mv || killed > mv.killed || (killed === mv.killed && alive > mv.alive)))
          mv = { i, x: Math.round(p.x), y: Math.round(p.y), r: o.r, killed, alive };
      }
    }
    if (mv) { raw.obstacles = orig.map((q, j) => j === mv.i ? { x: mv.x, y: mv.y, r: mv.r } : q); st.added.push({ moved: mv.i }); return; }
  }
  /* last resort: a blocker that kills every OLD reference is fine if a FRESH
     two-ramp route can still be found around it */
  if (!best) {
    const cands = [];
    for (const r of [21, 18, 16]) for (const pts of paths) for (const p of pts) {
      if (!legal(L, p.x, p.y, r, [])) continue;
      raw.obstacles = [...(raw.obstacles ?? []), { x: Math.round(p.x), y: Math.round(p.y), r }];
      const i2 = put();
      const killed = ones.filter(w => winT0(g, i2, w.cfg, [w.t0]) === null).length;
      raw.obstacles.pop();
      if (killed === ones.length) cands.push({ x: Math.round(p.x), y: Math.round(p.y), r, d: Math.hypot(p.x - L.target.x, p.y - L.target.y) });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 6)) {
      raw.obstacles = [...(raw.obstacles ?? []), { x: c.x, y: c.y, r: c.r }];
      const i2 = put();
      const fresh = refsFor(g, i2, 3, Date.now() + 12000);
      if (fresh.length) { st.refs = fresh; st.added.push({ x: c.x, y: c.y, r: c.r }); return; }
      raw.obstacles.pop();
    }
  }
  if (!best) { st.status = 'manual: no legal blocker keeps a two-ramp route'; return; }
  raw.obstacles = [...(raw.obstacles ?? []), { x: best.x, y: best.y, r: best.r }];
  st.added.push({ x: best.x, y: best.y, r: best.r });
}

if (isMainThread) {
  const apply = process.argv.includes('--apply');
  const done = JSON.parse(fs.readFileSync(HOME + '/oneramp.done.json', 'utf8'));
  const easy = Object.keys(done).filter(k => done[k].length).map(Number);
  let state = {}; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  const rawAll = await loadRaw();
  for (const id of easy) if (!state[id]) {
    const raw = structuredClone(rawAll.find(l => l.id === id));
    state[id] = { raw, refs: null, added: [], baseObs: raw.obstacles?.length ?? 0, status: 'todo' };
  }
  if (apply) {
    const out = easy.filter(id => state[id].added.length).map(id => state[id].raw);
    writeLevels(out);
    const by = s => easy.filter(id => state[id].status.startsWith(s));
    console.log(`applied ${out.length} levels. done: ${by('done').length}  manual: ${by('manual').join(',')}`);
    process.exit(0);
  }
  const t0 = Date.now(), nW = 4;
  const todo = easy.filter(id => state[id].status === 'todo');
  await Promise.all(Array.from({ length: nW }, (_, w) => new Promise(res => {
    const mine = todo.filter((_, i) => i % nW === w);
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { st: Object.fromEntries(mine.map(id => [id, state[id]])), until: t0 + BUDGET_MS } });
    wk.on('message', m => { state[m.id] = m.st; fs.writeFileSync(STATE, JSON.stringify(state)); });
    wk.on('exit', res);
  })));
  const c = s => easy.filter(id => state[id].status.startsWith(s));
  console.log(`easy ${easy.length}: done ${c('done').length}, manual ${c('manual').length} [${c('manual').join(',')}], todo ${c('todo').length}`);
} else {
  const g = await makeGtb();
  for (const [ids, st] of Object.entries(workerData.st)) {
    const id = Number(ids);
    while (st.status === 'todo' && Date.now() < workerData.until) {
      fixLevel(g, id, st, workerData.until);
      parentPort.postMessage({ id, st });
    }
  }
}
