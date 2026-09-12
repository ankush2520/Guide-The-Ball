/* Normalise every level to the full entity set, so the simulation can loop
   over each list without a guard and Verdholm simply loops over nothing. */
import type { Level, RawLevel, Country } from './types';
import { RAW_LEVELS } from './levels.data';
import { COUNTRIES } from './countries.data';
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
    fires: raw.fires ?? [],
    walls: [],
  };
  /* A moving target may only be an OPEN one. Walls are collidable geometry
     built FROM the target's centre (see walls.ts), so a patrolling target
     with walls would sweep real bars through whatever the player drew - the
     exact failure that got this mechanic cut before. Thrown rather than
     quietly corrected: it is a mistake in authored data, the data is static,
     and the level harness loads LEVELS, so this surfaces the moment it is
     introduced instead of shipping as a board that eats ramps. */
  if (lv.targetMove && lv.targetType !== 'OPEN')
    throw new Error(
      `level ${lv.id}: a moving target must be OPEN, not ${lv.targetType} - ` +
      `walls are built from the target centre and would move with it`);
  /* The authored centre and the patrol's start are the same place, so the
     board a player plans against is the board at t=0 whichever field is read. */
  if (lv.targetMove) lv.target = { ...lv.target, x: lv.targetMove.x0 };
  // a level may never configure wind stronger than the ceiling
  for (const z of lv.wind) {
    z.ax = clamp(z.ax || 0, -WIND_CAP, WIND_CAP);
    z.ay = clamp(z.ay || 0, -WIND_CAP, WIND_CAP);
  }
  lv.walls = buildWalls(lv, lv.target);
  return lv;
}

export const LEVELS: Level[] = RAW_LEVELS.map(initLevel);

/* Which country a level belongs to. Every level id in the game falls inside
   exactly one country's range; the fallback is defensive only. */
export function countryOf(id: number): Country {
  for (const c of COUNTRIES) if (id >= c.from && id <= c.to) return c;
  return COUNTRIES[0];
}

/** Where a level sits within its country, 1-based. Level 23 is Solmesa's
    third city. */
export function cityIndex(id: number): number {
  return id - countryOf(id).from + 1;
}

const ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Roman numerals for the city ordinal. Countries run to twenty cities, so
    this only ever has to reach XX. */
export function roman(n: number): string {
  let out = '';
  for (const [v, sym] of ROMAN) while (n >= v) { out += sym; n -= v; }
  return out;
}

/* Each level is a CITY within its country, and its name is DERIVED - country
   name plus position - rather than written per level. That keeps every city
   named without a naming pass, and means flavour names can be layered in
   later one at a time: set `city` on the level and this returns it instead.
   Nothing else has to change when they are. */
export function cityOf(lv: Pick<Level, 'id' | 'city'>): string {
  if (lv.city) return lv.city;
  const c = countryOf(lv.id);
  return `${c.name} ${roman(lv.id - c.from + 1)}`;
}

export { COUNTRIES, buildWalls };
export { targetAt, isMoving } from './target';
export type { Level, RawLevel, Country };
