/**
 * Ancient Egypt 101-120: Lava Land's cities, with GOLD STARS.
 *
 *   node tools/egyptLevels.mjs
 *
 * 101-116 are built exactly like Windy Peaks, Thunder Sky and Coral Reef
 * (tools/windLevels.mjs runWorld): each city takes the PATTERN of the Lava
 * Land city at the same position (101 <- 21 ... 116 <- 36), flipped and
 * nudged, every hazard re-placed. Fire stays (torch-lit tombs). On top: gold
 * stars, optional pickups - 2 on 101-108, 3 on 109-112, 4 on 113-116.
 *
 * 117-120 are the pillar exam: Lava Land's 37-40, MIRRORED, with 3 stars
 * each (tools/examClone.mjs). Nothing here runs the solver.
 */
import { fileURLToPath } from 'node:url';
import { runWorld } from './windLevels.mjs';
import { cloneExam } from './examClone.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';

export const NAMES = {
  101: 'Sand Gate', 102: 'Dune Walk', 103: 'Oasis', 104: 'Palm Grove', 105: 'Nile Bend',
  106: 'Reed Marsh', 107: 'Sun Temple', 108: 'Scarab Hall', 109: 'The Obelisk', 110: 'Camel Trail',
  111: 'Golden Mask', 112: 'Hidden Tomb', 113: 'Sphinx Watch', 114: "Pharaoh's Road", 115: 'Burial Chamber',
  116: 'Mummy Maze', 117: 'The Great Pyramid', 118: 'Valley of Kings', 119: 'Temple of Ra', 120: "Pharaoh's Treasure",
};

if (process.argv[1] === fileURLToPath(import.meta.url)){
  await runWorld({ from: 101, names: NAMES, addOn: 'stars', hazard: 'quicksand' });
  const raw = await loadRaw();
  const exams = [117, 118, 119, 120].map(id =>
    cloneExam(raw.find(l => l.id === id - 80), { id, name: NAMES[id], mirror: true, stars: 3 }));
  writeLevels(exams);
  for (const L of exams) console.log(`${L.id} ${L.name.padEnd(18)} exam <- ${L.id - 80} mirrored, ${L.stars.length} stars`);
}
