/* Normalise every level to the full entity set, so the simulation can loop
   over each list without a guard and Verdholm simply loops over nothing. */
import type { Level, RawLevel, Country } from './types';
import { RAW_LEVELS } from './levels.data';
import { COUNTRIES } from './countries.data';
import { buildWalls } from './walls';
import { validatePatrol } from './patrol';
import { WIND_CAP } from '../physics/constants';
import { clamp } from '../physics/math';

export function initLevel(raw: RawLevel): Level {
  const lv: Level = {
    ...raw,
    obstacles: raw.obstacles ?? [],
    boosters: raw.boosters ?? [],
    wind: raw.wind ?? [],
    slippery: raw.slippery ?? [],
    breakables: raw.breakables ?? [],
    stars: raw.stars ?? [],
    fires: raw.fires ?? [],
    boxes: raw.boxes ?? [],
    walls: [],
  };
  /* A patrol that breaks the moving target's authoring rules - walled, off
     the board, or going nowhere - is a mistake in static data, so it throws
     the moment the level loads rather than shipping a board that eats ramps.
     The rules themselves, and why a walled target may not patrol, are in
     patrol.ts. */
  const bad = validatePatrol(lv);
  if (bad) throw new Error(bad);
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

/** Where a level sits within its country, 1-based. Level 23 is Emberkeep's
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
export { patrolPath, patrolLane, rampAllowed, layoutAllowed, validatePatrol, LANE_GAP } from './patrol';
export type { Level, RawLevel, Country };
