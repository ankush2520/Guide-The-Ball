/* Normalise every level to the full entity set, so the simulation can loop
   over each list without a guard and world 1 simply loops over nothing. */
import type { Level, RawLevel, World } from './types';
import { RAW_LEVELS } from './levels.data';
import { WORLDS } from './worlds.data';
import { buildWalls } from './walls';
import { WIND_CAP } from '../physics/constants';
import { clamp } from '../physics/math';

export function initLevel(raw: RawLevel): Level {
  const lv: Level = {
    ...raw,
    obstacles: raw.obstacles ?? [],
    boosters: raw.boosters ?? [],
    wind: raw.wind ?? [],
    slippery: raw.slippery ?? [],
    portals: raw.portals ?? [],
    breakables: raw.breakables ?? [],
    stars: raw.stars ?? [],
    walls: [],
  };
  // a level may never configure wind stronger than the ceiling
  for (const z of lv.wind) {
    z.ax = clamp(z.ax || 0, -WIND_CAP, WIND_CAP);
    z.ay = clamp(z.ay || 0, -WIND_CAP, WIND_CAP);
  }
  lv.walls = buildWalls(lv, lv.target);
  return lv;
}

export const LEVELS: Level[] = RAW_LEVELS.map(initLevel);

/* A world recolours the BACKDROP and the chrome accent only. The entity
   palette - red obstacle, green target, blue ramp - is the game's vocabulary
   and never changes: a player who has learned that red hurts must not have to
   relearn it in world 6. */
export function worldOf(id: number): World {
  for (const w of WORLDS) if (id >= w.from && id <= w.to) return w;
  return WORLDS[0];
}

export { WORLDS, buildWalls };
export type { Level, RawLevel, World };
