import { physicsBundle } from './harness.mjs';
import vm from 'node:vm';
const ctx = vm.createContext({ window: {}, console, Math, performance, setTimeout, structuredClone });
ctx.window.window = ctx.window; ctx.globalThis = ctx;
vm.runInContext(await physicsBundle(null), ctx);
const g = ctx.window.__gtb;
const wins = [];
for (const id of g.LEVELS.map(l => l.id)) {
  const li = g.LEVELS.findIndex(l => l.id === id);
  const L = g.LEVELS[li];
  const r = g.simulate([], 1, li, null, 0), r2 = g.simulate([], 1, li, null, 97);
  if (r.result === 'win' || r2.result === 'win') wins.push(id);
}
console.log('levels that win with NO ramp:', wins.length ? wins.join(',') : 'none');
