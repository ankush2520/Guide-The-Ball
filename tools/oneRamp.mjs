/**
 * ONE-RAMP AUDIT - levels a single ramp can beat (they should need two).
 *
 *   node tools/oneRamp.mjs [from-to] [--json out.json]
 *
 * Runs the real simulator in Node (no browser). A level is EASY if ANY single
 * fixed-length ramp wins it on all seven seeds. Timed levels (moving target,
 * storm, crabs, black holes) are tried at several drop moments (t0): a level
 * is easy if one ramp wins at MOST of them - i.e. not a matter of timing.
 * Prints the winning ramps so a blocker can be placed on that line.
 */
import { physicsBundle } from './harness.mjs';
import vm from 'node:vm';
import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const LEN = 120, R = Math.PI / 180;
const args = process.argv.slice(2);
const range = (args.find(a => /^\d+-\d+$/.test(a)) || '1-140').split('-').map(Number);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

async function makeGtb() {
  const ctx = vm.createContext({ window: {}, console, Math, performance, setTimeout, structuredClone });
  ctx.window.window = ctx.window; ctx.globalThis = ctx;
  vm.runInContext(await physicsBundle(null), ctx);
  return ctx.window.__gtb;
}

export function audit(g, li, T0S) {
  const L = g.LEVELS[li];
  const ramp = (cx, cy, deg) => { const a = deg * R, hx = Math.cos(a) * LEN / 2, hy = Math.sin(a) * LEN / 2;
    return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy }; };
  const seeds = [1, 2, 3, 4, 5, 6, 7];
  const timed = !!(L.targetMove || L.storm || (L.crabs && L.crabs.length) || (L.blackholes && L.blackholes.length));
  const t0s = timed ? T0S : [0];
  const winsAt = (cfg, t0) => g.simulate(cfg, 1, li, null, t0).result === 'win' &&
                              seeds.slice(1).every(s => g.simulate(cfg, s, li, null, t0).result === 'win');
  const need = timed ? Math.ceil(t0s.length * 0.5) : 1;
  const found = [];
  const test = cfg => { let n = 0, f = 0; for (const t0 of t0s) { if (winsAt(cfg, t0)) n++; else if (++f > t0s.length - need) return false; } return n >= need; };
  const sx = L.spawn.x;
  for (let ry = L.spawn.y + 60; ry <= g.CONSTS.H - 110; ry += 30)
    for (let th = 20; th <= 160; th += 3) {
      const c = ramp(sx, ry, th);
      if (test([c])) { found.push({ x: Math.round(sx), y: ry, th, kind: 'under' }); if (found.length >= 3) return found; }
    }
  for (let rx = 40; rx <= 440; rx += 40)
    for (let ry = 130; ry <= 680; ry += 40)
      for (let th = 20; th <= 160; th += 6) {
        if (Math.abs(rx - sx) < 1) continue;
        if (test([ramp(rx, ry, th)])) { found.push({ x: rx, y: ry, th, kind: 'anywhere' }); if (found.length >= 3) return found; }
      }
  return found;
}

const DONE = process.env.HOME + '/oneramp.done.json';
const BUDGET_MS = Number(process.env.BUDGET_MS || 110000);
if (isMainThread && process.argv[1] && process.argv[1].endsWith("oneRamp.mjs")) {
  /* resumable: each call gets ~2 minutes; finished levels are kept in DONE */
  let res = {}; try { res = JSON.parse(fs.readFileSync(DONE, 'utf8')); } catch {}
  const ids = []; for (let id = range[0]; id <= range[1]; id++) if (((id - 1) % 20) + 1 >= 6 && !(id in res)) ids.push(id);
  const nW = 4, t0 = Date.now();
  await Promise.all(Array.from({ length: nW }, (_, w) => new Promise(done => {
    const mine = ids.filter((_, i) => i % nW === w);
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { mine, until: t0 + BUDGET_MS } });
    wk.on('message', m => { res[m.id] = m.found; fs.writeFileSync(DONE, JSON.stringify(res)); });
    wk.on('exit', done);
  })));
  const all = []; for (let id = range[0]; id <= range[1]; id++) if (((id - 1) % 20) + 1 >= 6) all.push(id);
  const left = all.filter(id => !(id in res));
  const easy = all.filter(id => id in res && res[id].length);
  console.log(`checked ${all.length - left.length}/${all.length}; left: ${left.length}`);
  console.log(`EASY so far (${easy.length}): ${easy.join(',')}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
} else if (!isMainThread && workerData && workerData.mine) {
  const g = await makeGtb();
  for (const id of workerData.mine) {
    if (Date.now() > workerData.until) break;
    const li = g.LEVELS.findIndex(l => l.id === id);
    parentPort.postMessage({ id, found: audit(g, li, [0, 37, 71, 113, 149, 191]) });
  }
}
