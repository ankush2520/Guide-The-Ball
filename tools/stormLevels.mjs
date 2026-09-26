/**
 * Stormhold 61-76: Emberkeep's cities with a thunderstorm on top.
 *
 *   node tools/stormLevels.mjs
 *
 * Built exactly like Windemere (tools/windLevels.mjs): each city takes the
 * PATTERN of the Emberkeep city at the same position (61 <- 21 ... 76 <- 36) -
 * the same hazard counts, mix, target type, patrol and ramps, flipped at
 * random with the drop, target and box nudged, and every hazard re-placed.
 * Instead of wind it gets a storm: 4 strike points on 61-68, 5 on 69-72 and
 * 6 on 73-76, each 0.8s after the one before (levels/storm.ts).
 * No fire - it does not belong in the rain: every fire the twin has becomes
 * a red obstacle of the same size in the same place.
 *
 * 77-80 are the oval exam: tools/ovalLevels.mjs --only=77-80.
 * Placed directly and play-tested by hand; nothing here runs the solver.
 */
import { fileURLToPath } from 'node:url';
import { runWorld } from './windLevels.mjs';

export const NAMES = {
  61: 'First Rain', 62: 'Cloudburst', 63: 'Static Line', 64: 'Downpour', 65: 'Flashflood',
  66: 'Thunderhead', 67: 'Spark Gap', 68: 'Rolling Thunder', 69: 'Storm Front', 70: 'Ball Lightning',
  71: 'Deluge', 72: 'Charged Air', 73: 'Forked Sky', 74: 'Monsoon', 75: 'Thunderclap',
  76: 'Eye of the Storm', 77: 'Lightning Rod', 78: 'Stormcaller', 79: 'Squall Wall', 80: 'The Maelstrom',
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runWorld({ from: 61, names: NAMES, addOn: 'storm', noFire: true });
