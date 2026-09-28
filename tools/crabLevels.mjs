/**
 * Coralis Deep 81-96: Emberkeep's cities, underwater, with crabs.
 *
 *   node tools/crabLevels.mjs
 *
 * Built exactly like Windemere and Stormhold (tools/windLevels.mjs): each city
 * takes the PATTERN of the Emberkeep city at the same position (81 <- 21 ...
 * 96 <- 36) - hazard counts, mix, target type, patrol and ramps - flipped at
 * random with the drop, target and box nudged, and every hazard re-placed.
 * No fire under water: each fire becomes a red obstacle of the same size.
 * On top: CRABS (levels/crab.ts) - 2 on 81-88, 3 on 89-92, 4 on 93-96 - each
 * walking a looping pattern (orbit, figure-8, flower, scuttle; some orbits
 * shared by a dancing pair) whose whole loop is kept clear of every hazard,
 * the target and the drop.
 *
 * 97-100 are the pillar exam: tools/pillarLevels.mjs.
 * Placed directly and play-tested by hand; nothing here runs the solver.
 */
import { fileURLToPath } from 'node:url';
import { runWorld } from './windLevels.mjs';

export const NAMES = {
  81: 'The Shallows', 82: 'Kelp Drift', 83: 'Bubble Run', 84: 'Tide Pool', 85: 'Reef Edge',
  86: 'Sunlit Bay', 87: 'Coral Maze', 88: 'Driftwood', 89: 'Seagrass', 90: 'Pearl Diver',
  91: 'Shipwreck', 92: 'Pincer Pass', 93: 'Undercurrent', 94: 'Deep Channel', 95: 'Anglerfish',
  96: 'Feeding Frenzy', 97: 'Leviathan', 98: 'The Abyss', 99: "Kraken's Den", 100: "Davy Jones' Locker",
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runWorld({ from: 81, names: NAMES, addOn: 'crabs', noFire: true, windChance: 0.4 });
