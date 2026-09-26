/**
 * Read and write src/levels/levels.data.ts by LEVEL, whatever it is formatted
 * like. The level tools (windLevels, stormLevels, ovalLevels) used to find a
 * level with regexes written for one layout, and a format-on-save broke them;
 * this reads the data through esbuild - exactly what the game loads - and
 * writes a level back by locating its object with brace matching.
 *
 * Levels are written back in the Prettier style the file uses: one field per
 * line, and a list or object on one line when it fits in 80 columns.
 */
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = path.join(root, 'src/levels/levels.data.ts');

/** Every authored level, as plain objects (a deep copy - safe to edit). */
export async function loadRaw(){
  const out = await esbuild.build({
    stdin: { contents: `export { RAW_LEVELS } from './src/levels/levels.data';`, resolveDir: root, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  const { RAW_LEVELS } = await import('data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64') + `#${Date.now()}`);
  return structuredClone(RAW_LEVELS);
}

const key = k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function inline(v){
  if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
  if (v && typeof v === 'object'){
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return e.length ? `{ ${e.map(([k, x]) => `${key(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}
function pretty(v, ind){
  const one = inline(v);
  /* Prettier: a list of two or more objects always breaks, one per line */
  const objList = Array.isArray(v) && v.length > 1 && v.every(x => x && typeof x === 'object');
  if (typeof v !== 'object' || v === null || (!objList && ind.length + one.length <= 78)) return one;
  const inner = ind + '  ';
  if (Array.isArray(v)) return `[\n${v.map(x => inner + pretty(x, inner) + ',').join('\n')}\n${ind}]`;
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${e.map(([k, x]) => `${inner}${key(k)}: ${pretty(x, inner)},`).join('\n')}\n${ind}}`;
}
/** One level as it sits in the RAW_LEVELS array (two-space indent). */
export function formatLevel(lv){
  const e = Object.entries(lv).filter(([, x]) => x !== undefined);
  return `{\n${e.map(([k, x]) => `    ${key(k)}: ${pretty(x, '    ')},`).join('\n')}\n  }`;
}

/** Replace each given level's object in the file, in place. Comments and
    every other level are left exactly as they are. */
export function writeLevels(levels){
  let src = fs.readFileSync(FILE, 'utf8');
  for (const lv of levels){
    const m = new RegExp(`\\bid\\s*:\\s*${lv.id}\\s*,`).exec(src);
    if (!m) throw new Error(`level ${lv.id} not found in levels.data.ts`);
    const open = src.lastIndexOf('{', m.index);
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++){
      const c = src[i];
      if (c === '"' || c === "'"){ i = src.indexOf(c, i + 1); continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0){ close = i; break; }
    }
    if (close < 0) throw new Error(`level ${lv.id}: unbalanced braces`);
    src = src.slice(0, open) + formatLevel(lv) + src.slice(close + 1);
  }
  fs.writeFileSync(FILE, src);
}
