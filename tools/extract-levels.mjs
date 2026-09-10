/* One-shot: pull LEVELS/WORLDS out of the legacy index.html into TS data
   files, so the port never risks a hand-transcription error. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto(pathToFileURL('/Users/ankush2520/Documents/Guide-The-Ball/index.html').href);
await p.waitForFunction(() => !!window.__gtb);
const { levels, worlds } = await p.evaluate(() => ({
  levels: window.__gtb.LEVELS.map(l => JSON.parse(JSON.stringify(l))),
  worlds: window.__gtb.WORLDS ? JSON.parse(JSON.stringify(window.__gtb.WORLDS)) : null,
}));
await b.close();

const keys = new Set();
levels.forEach(l => Object.keys(l).forEach(k => keys.add(k)));
console.error('level count:', levels.length);
console.error('keys union:', [...keys].join(', '));

const lit = o => JSON.stringify(o).replace(/"([a-zA-Z_$][\w$]*)":/g, '$1:');
// `walls` is derived from targetType by buildWalls() - never store it.
const ORDER = ['id','name','maxBlocks','targetType','wallSide','wallH','gapW','gapX',
               'spawn','obstacles','boosters','wind','slippery','portals',
               'breakables','stars','target'];

let out = `/* AUTO-EXTRACTED from the original index.html - do not hand-edit.
   Regenerate with: node tools/extract-levels.mjs
   \`walls\` is deliberately absent: it is derived from targetType by
   buildWalls() at load time, exactly as the original did. */
import type { RawLevel } from './types';

export const RAW_LEVELS: RawLevel[] = [
`;
let world = null;
for (const lv of levels) {
  const w = worlds.find(w => lv.id >= w.from && lv.id <= w.to);
  if (w && w !== world) { world = w; out += `\n  /* ---- World ${w.id}: ${w.name} ---- */\n`; }
  const o = {};
  for (const k of ORDER) {
    const v = lv[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;   // world 1 has no mechanics
    o[k] = v;
  }
  out += `  ${lit(o)},\n`;
}
out += '];\n';
fs.writeFileSync('src/levels/levels.data.ts', out);

let wout = `/* AUTO-EXTRACTED from the original index.html - do not hand-edit.
   A world recolours the BACKDROP and chrome accent only. The entity palette
   is the game's vocabulary and never changes. */
import type { World } from './types';

export const WORLDS: World[] = [
`;
for (const w of worlds) wout += `  ${lit(w)},\n`;
wout += '];\n';
fs.writeFileSync('src/levels/worlds.data.ts', wout);
console.error('wrote src/levels/levels.data.ts and src/levels/worlds.data.ts');
