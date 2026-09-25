/* ============================================================
   SPREAD - what the first two worlds LOOK like

   Levels 1-40 are generated to read as a field, not a pile
   (tools/genlevels.mjs, covers() and need()). This holds the
   shipped data to the two promises that are about the eye
   rather than the physics:

     1. no clustering: a board of six or more pieces reaches
        every third of the play area and leaves no square hole
        wider than MAX_EMPTY;
     2. no glow crosses another glow, or a body: fire haze,
        the target's halo along its whole patrol, and the
        mystery box bloom, at the multiples they are DRAWN at
        (src/render/glow.ts).

   Headless and server-free: it reads the data, nothing runs.
   ============================================================ */
import { LEVELS, measure, MAX_EMPTY } from '../tools/spread-metrics.mjs';

let fails = 0;
const ok  = (n, x = '') => console.log(`  ✓ ${n}${x ? '  ' + x : ''}`);
const bad = (n, x = '') => { fails++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); };
const chk = (c, n, x = '') => (c ? ok(n, x) : bad(n, x));

console.log('\nSPREAD — levels 1-40\n');
const rows = LEVELS.filter(l => l.id <= 40).map(measure);
chk(rows.length === 40, 'all forty levels are measured', `${rows.length}`);

const clustered = rows.filter(m => m.flags.includes('CLUSTERED'));
chk(clustered.length === 0,
  `no board of 6+ pieces leaves a third empty or a hole wider than ${MAX_EMPTY}px`,
  clustered.map(m => `L${m.id} (${m.cols}c/${m.rows}r, ${m.empty}px)`).join(', ') ||
  `widest hole ${Math.max(...rows.filter(m => m.pieces >= 6).map(m => m.empty))}px`);

const glowing = rows.filter(m => m.flags.includes('GLOW OVERLAP'));
chk(glowing.length === 0, 'no glow visibly crosses another glow or a body',
  glowing.map(m => `L${m.id} ${m.glow.pair} ${m.glow.gap.toFixed(0)}px`).join(', ') ||
  `tightest ${Math.min(...rows.map(m => m.glow.gap)).toFixed(0)}px of air`);

console.log(fails ? `\n${fails} check(s) FAILED.\n` : '\nEvery board reads as a field.\n');
process.exitCode = fails ? 1 : 0;
