/**
 * Coralis Deep 81-96: Emberkeep's cities, underwater, with eater fish.
 *
 *   node tools/fishLevels.mjs
 *
 * Built exactly like Windemere and Stormhold (tools/windLevels.mjs): each city
 * takes the PATTERN of the Emberkeep city at the same position (81 <- 21 ...
 * 96 <- 36) - hazard counts, mix, target type, patrol and ramps - flipped at
 * random with the drop, target and box nudged, and every hazard re-placed.
 * No fire under water: each fire becomes a red obstacle of the same size.
 * On top: EATER FISH (levels/fish.ts) - 1 on 81-88, 2 on 89-92, 3 on 93-96 -
 * each on a wavy lane kept clear of every hazard, the target and the drop.
 *
 * 97-100 are the oval exam: tools/ovalLevels.mjs --only=97-100.
 * Placed directly and play-tested by hand; nothing here runs the solver.
 */
import { fileURLToPath } from 'node:url';
import { runWorld } from './windLevels.mjs';

export const NAMES = {
  81: 'The Shallows', 82: 'Kelp Drift', 83: 'Bubble Run', 84: 'Tide Pool', 85: 'Reef Edge',
  86: 'Sunlit Bay', 87: 'Coral Maze', 88: 'Driftwood', 89: 'Seagrass', 90: 'Pearl Diver',
  91: 'Shipwreck', 92: 'Piranha Pass', 93: 'Undercurrent', 94: 'Deep Channel', 95: 'Anglerfish',
  96: 'Feeding Frenzy', 97: 'Leviathan', 98: 'The Abyss', 99: "Kraken's Den", 100: "Davy Jones' Locker",
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  await runWorld({ from: 81, names: NAMES, addOn: 'fish', noFire: true });
