/**
 * Outer Space 121-140: Lava Land's cities, DENSER, and nothing burns.
 *
 *   node tools/spaceLevels.mjs
 *
 * 121-136 are built like the other worlds (tools/windLevels.mjs runWorld):
 * each takes the PATTERN of the Lava Land city at the same position
 * (121 <- 21 ... 136 <- 36). No fire in space: each fire becomes a red
 * obstacle of the same size. On top: a CROWDED board - 2 extra small red
 * obstacles on 121-128, 3 on 129-132, 4 on 133-136 - and wind (drawn as
 * the space scene's drift) on some cities.
 *
 * 137-140 are the pillar exam: Windy Peaks' 57-60 (wind + the pillar), fire
 * turned to red obstacles (tools/examClone.mjs). Nothing here runs the solver.
 */
import { fileURLToPath } from 'node:url';
import { runWorld } from './windLevels.mjs';
import { cloneExam } from './examClone.mjs';
import { loadRaw, writeLevels } from './levelData.mjs';

export const NAMES = {
  121: 'Liftoff', 122: 'Moon Hop', 123: 'Low Orbit', 124: 'Star Dust', 125: 'Comet Tail',
  126: 'Crater Field', 127: 'Space Walk', 128: 'Asteroid Belt', 129: 'Nebula', 130: 'Red Planet',
  131: 'Ring World', 132: 'Solar Flare', 133: 'Meteor Shower', 134: 'Dark Side', 135: 'Gravity Well',
  136: 'Black Hole', 137: 'Supernova', 138: 'Galaxy Core', 139: 'Event Horizon', 140: 'The Final Frontier',
};

if (process.argv[1] === fileURLToPath(import.meta.url)){
  await runWorld({ from: 121, names: NAMES, addOn: 'dense', noFire: true, windChance: 0.35 });
  const raw = await loadRaw();
  const exams = [137, 138, 139, 140].map(id =>
    cloneExam(raw.find(l => l.id === id - 80), { id, name: NAMES[id], noFire: true }));
  writeLevels(exams);
  for (const L of exams) console.log(`${L.id} ${L.name.padEnd(18)} exam <- ${L.id - 80}, fire -> obstacles`);
}
