/**
 * FIX FREE WINS - a level must never be won by dropping with no ramp at all.
 * For every level where it is, slide the cup (and its patrol lane) sideways a
 * step at a time until the bare drop misses, re-checking on the real physics.
 *
 *   node tools/fixFreeWins.mjs
 */
import { physicsBundle } from './harness.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';
import vm from 'node:vm';

const T0S = [0, 37, 71, 113, 149, 191];   // the solver's drop moments; seed 1 (the drop the player sees)
async function freeWins() {
  const ctx = vm.createContext({ window: {}, console: { ...console, warn() {} }, Math, performance, setTimeout, structuredClone });
  ctx.window.window = ctx.window; ctx.globalThis = ctx;
  vm.runInContext(await physicsBundle({}), ctx);   // {} = never the cached bundle: the level file changes between checks
  const g = ctx.window.__gtb;
  return g.LEVELS.filter((L, li) => (process.env.ALL || !L.needsSpring) && T0S.some(t => g.simulate([], 1, li, null, t).result === 'win')).map(L => L.id);
}
const SHIFTS = [40, -40, 80, -80, 120, -120, 160, -160];
let bad = await freeWins(), tries = {}, base = {};
console.log('free wins:', bad.join(',') || 'none');
while (bad.length) {
  const raws = await loadRaw(), writes = [];
  for (const id of bad) {
    const k = (tries[id] = (tries[id] ?? -1) + 1);
    if (k >= SHIFTS.length) { console.log(`level ${id}: could not fix by moving the cup`); continue; }
    const lv = raws.find(l => l.id === id), d = SHIFTS[k];
    base[id] ??= lv.target.x;
    const nx = Math.max(lv.target.r + 20, Math.min(480 - lv.target.r - 20, base[id] + d));
    const dx = nx - lv.target.x;
    lv.target = { ...lv.target, x: nx };
    if (lv.targetMove) lv.targetMove = { ...lv.targetMove, x0: lv.targetMove.x0 + dx, x1: lv.targetMove.x1 + dx };
    console.log(`level ${id}: cup -> x ${nx}`);
    writes.push(lv);
  }
  if (!writes.length) break;
  writeLevels(writes);
  bad = (await freeWins()).filter(id => (tries[id] ?? 0) < SHIFTS.length);
}
console.log('done');
