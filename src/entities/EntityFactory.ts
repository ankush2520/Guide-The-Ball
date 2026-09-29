/* ============================================================
   ENTITY FACTORY

   One place that knows how to turn a level's plain data into
   drawable entities, and the only place that knows which class
   goes with which kind.

   It is registry-driven rather than a switch: adding a new country's
   new mechanic means writing the entity class and registering
   it here, and nothing else in the render path changes. The
   original had to touch render() in three places to add one.

   Entities WRAP the level's own definition objects by reference
   (see Entity), so the factory is a view over the level, never
   a copy of it.
   ============================================================ */
import type { Level } from '../levels/types';
import { Entity, type EntityKind } from './Entity';
import { Obstacle } from './Obstacle';
import { FireObstacle } from './FireObstacle';
import { Breakable } from './Breakable';
import { Booster } from './Booster';
import { WindZone } from './WindZone';
import { SlipperyZone } from './SlipperyZone';
import { StarPickup } from './StarPickup';
import { Target } from './Target';
import { MovingTarget } from './MovingTarget';
import { isMoving } from '../levels/target';
import { Wall } from './Wall';
import { Pillar } from './Pillar';
import { Rain } from './Rain';
import { Storm } from './Storm';
import { Crab } from './Crab';
import { Sea } from './Sea';
import { Volcano } from './Volcano';
import { Mountains } from './Mountains';
import { Meadow, Cliffs, Egypt, Space } from './Scenery';
import { Quicksand } from './Quicksand';
import { BlackHole } from './BlackHole';
import { countryOf } from '../levels';
import { PILLAR_SEGS } from '../levels/pillars';
import type { PillarLook } from '../levels/types';
import { MysteryBox } from './MysteryBox';
import { Ramp } from './Ramp';

/* The registry is inherently heterogeneous - every entry pairs a different
   def type with the class that draws it - so the constructor signature is
   erased here and re-established by the typed create() below. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = new (def: any, index: number) => Entity<any>;

/** The registry. `pick` says where on a level this kind's defs live, and
    `ctorFor`, when present, picks a variant class from the level itself. */
interface Spec {
  ctor: Ctor;
  pick: (lv: Level) => readonly unknown[];
  ctorFor?: (lv: Level) => Ctor;
}

const REGISTRY: Partial<Record<EntityKind, Spec>> = {
  slippery:  { ctor: SlipperyZone, pick: lv => lv.slippery },
  quicksand: { ctor: Quicksand,    pick: lv => lv.quicksand },
  blackhole: { ctor: BlackHole,    pick: lv => lv.blackholes },
  wind:      { ctor: WindZone,     pick: lv => lv.wind },
  rain:      { ctor: Rain,         pick: lv => (lv.storm ? [lv.storm] : []) },
  sea:       { ctor: Sea,          pick: lv => (lv.crabs && lv.crabs.length ? [lv.crabs] : []) },
  /* a world's painted backdrop, by the world it is in (Country.scene) */
  volcano:   { ctor: Volcano,      pick: lv => (countryOf(lv.id).scene === 'volcano' ? [lv] : []) },
  mountains: { ctor: Mountains,    pick: lv => (countryOf(lv.id).scene === 'mountains' ? [lv] : []) },
  meadow:    { ctor: Meadow,       pick: lv => (countryOf(lv.id).scene === 'meadow' ? [lv] : []) },
  cliffs:    { ctor: Cliffs,       pick: lv => (countryOf(lv.id).scene === 'cliffs' ? [lv] : []) },
  egypt:     { ctor: Egypt,        pick: lv => (countryOf(lv.id).scene === 'egypt' ? [lv] : []) },
  space:     { ctor: Space,        pick: lv => (countryOf(lv.id).scene === 'space' ? [lv] : []) },
  /* One target per level; a patrolling one is the same kind with its lane
     drawn under it - see MovingTarget. */
  target:    { ctor: Target,       pick: lv => [lv.target],
               ctorFor: lv => (isMoving(lv) ? MovingTarget : Target) },
  /* a pillar's segments are walls to the physics, but the Pillar entity
     paints the whole column, so the wall painter skips them */
  wall:      { ctor: Wall,         pick: lv => lv.walls.filter(s => !PILLAR_SEGS.has(s)) },
  /* dressed in the material of the world it stands in - see PILLAR_LOOK */
  pillar:    { ctor: Pillar,       pick: lv => (lv.pillars ?? []).map(p => ({ ...p, look: p.look ?? pillarLook(lv.id) })) },
  obstacle:  { ctor: Obstacle,     pick: lv => lv.obstacles },
  fire:      { ctor: FireObstacle, pick: lv => lv.fires },
  crab:      { ctor: Crab,         pick: lv => lv.crabs ?? [] },
  breakable: { ctor: Breakable,    pick: lv => lv.breakables },
  booster:   { ctor: Booster,      pick: lv => lv.boosters },
  star:      { ctor: StarPickup,   pick: lv => lv.stars },
  box:       { ctor: MysteryBox,   pick: lv => lv.boxes },
  storm:     { ctor: Storm,        pick: lv => (lv.storm ? [lv.storm] : []) },
  // 'ramp' is deliberately absent: it is player-made, not level data, and is
  // built one at a time by createRamp().
};

/* A pillar wears its WORLD, by country id: a tree trunk in the meadows,
   basalt by the volcano, wind-worn mint stone in the breezes, rain-dark
   slate in the storm, reef rock under the sea, carved sandstone in
   Egypt and a riveted metal strut in space. Any other world gets stone. */
const PILLAR_LOOK: Record<number, PillarLook> = { 1: 'tree', 6: 'basalt', 3: 'mint', 4: 'slate', 9: 'coral',
                                                  7: 'sandstone', 12: 'metal' };
const pillarLook = (id: number): PillarLook => PILLAR_LOOK[countryOf(id).id] ?? 'stone';

export class EntityFactory {
  /** Build one entity of a kind from an explicit def. */
  static create<T>(kind: EntityKind, def: T, index = 0): Entity<T> {
    const spec = REGISTRY[kind];
    if (!spec) throw new Error(`EntityFactory: no entity registered for "${kind}"`);
    return new spec.ctor(def, index) as Entity<T>;
  }

  /** Every entity a level contains, already sorted into paint order.
      A stable sort keeps same-layer kinds in registry order, which is what
      puts breakables under boosters under stars. */
  static createFromLevel(lv: Level): Entity[] {
    const out: Entity[] = [];
    for (const kind of Object.keys(REGISTRY) as EntityKind[]) {
      const spec = REGISTRY[kind]!;
      const defs = spec.pick(lv);
      const Cls = spec.ctorFor ? spec.ctorFor(lv) : spec.ctor;
      for (let i = 0; i < defs.length; i++) out.push(new Cls(defs[i], i));
    }
    return out.sort((a, b) => a.layer - b.layer);
  }

  /** The player's own entity. Kept off the registry because it has no level
      data to be built from - it is created by a drag. */
  static createRamp(seg: { x1: number; y1: number; x2: number; y2: number }, index = 0): Ramp {
    return new Ramp(seg, index);
  }

}

export { Entity };
export type { EntityKind };
