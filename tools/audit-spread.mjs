/**
 * Obstacle-distribution audit: is any board clustered in one region with a
 * large empty area elsewhere, or do any two glows visibly cross?
 *
 *   node tools/audit-spread.mjs            # levels 1-40
 *   node tools/audit-spread.mjs 1-20
 *
 * Read-only. Per level: the hazard count (a patrol counts as one), how many
 * of the 3x3 cells of the play field hold a hazard, the tightest rim-to-rim
 * gap between two hazards, the largest empty square left in the field, and
 * `glowGap` - the tightest edge-to-edge air between any pair where one glows
 * (fire, target along its whole patrol, mystery box). The measurements live
 * in tools/spread-metrics.mjs, which tests/spread.test.mjs gates on.
 */
import { LEVELS, measure } from './spread-metrics.mjs';

const [A, B] = (process.argv[2] || '1-40').split('-').map(Number);
console.log(' id  haz  cells  cols rows  minGap  emptiest  glowGap              flag');
for (const L of LEVELS.filter(l => l.id >= A && l.id <= B)){
  const m = measure(L);
  console.log(`${String(m.id).padStart(3)}  ${String(m.hazards).padStart(3)}  ${String(m.cells).padStart(3)}/9  ` +
    `${m.cols}    ${m.rows}    ${(isFinite(m.gap) ? m.gap.toFixed(0) : '-').padStart(5)}   ` +
    `${String(m.empty).padStart(5)}px   ${(isFinite(m.glow.gap) ? m.glow.gap.toFixed(0) : '-').padStart(4)} ` +
    `${m.glow.pair.padEnd(16)} ${m.flags.join(' ')}`);
}
