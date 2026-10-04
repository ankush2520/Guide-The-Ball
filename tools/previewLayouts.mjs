/** Contact sheet of level layouts: node tools/previewLayouts.mjs 6-16 > tools/out/preview.svg */
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [A, B] = (process.argv[2] || '6-16').split('-').map(Number);
const out = await esbuild.build({ stdin: { contents: `export { LEVELS } from './src/levels/index'; export { moverPathAt } from './src/levels/mover';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{"DEV":true}' } });
const { LEVELS, moverPathAt } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const ls = LEVELS.filter(l => l.id >= A && l.id <= B), S = 0.4, w = 480 * S, h = 800 * S, cols = 6;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * (w + 10)}" height="${Math.ceil(ls.length / cols) * (h + 30)}" font-family="sans-serif">`;
ls.forEach((L, i) => {
  const ox = (i % cols) * (w + 10), oy = Math.floor(i / cols) * (h + 30);
  svg += `<g transform="translate(${ox},${oy + 18})"><text y="-4" font-size="13">Level ${L.id}</text><rect width="${w}" height="${h}" fill="#e8f0ff" stroke="#999"/><g transform="scale(${S})">`;
  for (const s of L.walls) svg += `<line x1="${s.x1}" y1="${Math.max(0, s.y1)}" x2="${s.x2}" y2="${Math.max(0, s.y2)}" stroke="${s.ht ? '#8d5a2e' : '#555'}" stroke-width="${s.ht ? 16 : 7}" stroke-linecap="${s.ht ? 'square' : 'round'}"/>`;
  for (const q of L.quicksand) svg += `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="#e2c27a"/>`;
  for (const h of L.blackholes) svg += `<circle cx="${h.x}" cy="${h.y}" r="${h.reach}" fill="none" stroke="#333" stroke-dasharray="3 5"/><circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="#222"/>`;
  for (const c of L.crabs ?? []) svg += `<ellipse cx="${c.cx}" cy="${c.cy}" rx="${Math.abs(c.rx) + c.r}" ry="${c.ry + c.r}" fill="#7b3fc4" opacity=".25"/><circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="#7b3fc4"/>`;
  for (const st of L.stars) svg += `<circle cx="${st.x}" cy="${st.y}" r="9" fill="#f5c400"/>`;
  if (L.targetMove) svg += `<line x1="${L.targetMove.x0}" y1="${L.target.y}" x2="${L.targetMove.x1}" y2="${L.target.y}" stroke="#3c3" stroke-width="6" opacity=".5"/>`;
  for (const o of L.obstacles) svg += `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="#e0233f"/>`;
  for (const o of L.fires) svg += `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="#ff9000"/>`;
  for (const o of L.breakables) svg += `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="#a07040"/>`;
  for (const m of L.movers) { const p = [0, .25, .5, .75].map(u => moverPathAt(m, u)); svg += p.map(q => `<circle cx="${q.x}" cy="${q.y}" r="${m.r}" fill="none" stroke="#e0233f" stroke-dasharray="4 4"/>`).join('') + `<circle cx="${m.cx}" cy="${m.cy}" r="${m.r}" fill="#ff6070"/>`; }
  svg += `<circle cx="${L.target.x}" cy="${L.target.y}" r="${L.target.r}" fill="#3c3" opacity=".7"/><circle cx="${L.spawn.x}" cy="${L.spawn.y}" r="9" fill="#333"/></g></g>`;
});
console.log(svg + '</svg>');
