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
import { Oval } from './Oval';
import { Rain } from './Rain';
import { Storm } from './Storm';
import { Fish } from './Fish';
import { Sea } from './Sea';
import { OVAL_SEGS } from '../levels/ovals';
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
  wind:      { ctor: WindZone,     pick: lv => lv.wind },
  rain:      { ctor: Rain,         pick: lv => (lv.storm ? [lv.storm] : []) },
  sea:       { ctor: Sea,          pick: lv => (lv.fish && lv.fish.length ? [lv.fish] : []) },
  /* One target per level; a patrolling one is the same kind with its lane
     drawn under it - see MovingTarget. */
  target:    { ctor: Target,       pick: lv => [lv.target],
               ctorFor: lv => (isMoving(lv) ? MovingTarget : Target) },
  /* an oval's rim segments are walls to the physics, but the Oval entity
     paints the whole shape, so the wall painter skips them */
  wall:      { ctor: Wall,         pick: lv => lv.walls.filter(s => !OVAL_SEGS.has(s)) },
  oval:      { ctor: Oval,         pick: lv => lv.ovals ?? [] },
  obstacle:  { ctor: Obstacle,     pick: lv => lv.obstacles },
  fire:      { ctor: FireObstacle, pick: lv => lv.fires },
  fish:      { ctor: Fish,         pick: lv => lv.fish ?? [] },
  breakable: { ctor: Breakable,    pick: lv => lv.breakables },
  booster:   { ctor: Booster,      pick: lv => lv.boosters },
  star:      { ctor: StarPickup,   pick: lv => lv.stars },
  box:       { ctor: MysteryBox,   pick: lv => lv.boxes },
  storm:     { ctor: Storm,        pick: lv => (lv.storm ? [lv.storm] : []) },
  // 'ramp' is deliberately absent: it is player-made, not level data, and is
  // built one at a time by createRamp().
};

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
