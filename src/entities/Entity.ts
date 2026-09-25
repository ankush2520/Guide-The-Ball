/* ============================================================
   ENTITY - the base of the factory's product line.

   An entity WRAPS the level's own definition object by
   reference; it never copies it. That matters: the physics
   reads lv.obstacles[i] directly, so if an entity held a copy
   the two could drift apart and the thing you see would stop
   being the thing you hit.

   An entity therefore owns exactly one responsibility the
   physics does not have: knowing how to draw itself, and in
   what order.
   ============================================================ */

import type { RawLevel } from '../levels/types';

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  /** The level being drawn. Only the target reads it: to resolve a patrol, and
      to know whether it is WRAPPED - an entity still never looks up its own
      def through this. */
  level: Pick<RawLevel, 'target' | 'targetMove' | 'targetGift'>;
  /** Seconds since load. Every animation is a pure function of this, so the
      board looks identical at the same clock on any device. */
  clock: number;
  /** Which breakables have been destroyed, and which stars taken. Live run
      state, read by the entities that have two appearances.
      An entity READS these and never writes them. */
  broken: readonly boolean[];
  got: readonly boolean[];
  /** Which mystery boxes have been opened THIS DROP. */
  gotBox: readonly boolean[];
  /** Whether this level's TARGET GIFT has already been taken - on a previous
      visit or a moment ago. A wrapped target that has been opened goes back to
      being an ordinary one, the same way a taken chest goes to an outline:
      the board must never promise a prize it can no longer pay. */
  giftTaken: boolean;
  /** The PATROL clock in steps, fractional: the planning clock while the
      player plans, the drop's start phase plus its steps during a drop. The
      one thing on the board that is not drawn off the wall clock: a patrolling target has to be painted where the physics says it
      is, or the board would show a different game than it plays. */
  simT: number;
}

export type EntityKind =
  | 'slippery' | 'wind'          // ground
  | 'target'
  | 'wall' | 'oval'
  | 'obstacle' | 'fire'
  | 'breakable' | 'booster' | 'star' | 'box'
  /* the two the PLAYER makes */
  | 'ramp';

/* Paint order, low to high. Zones are GROUND: they sit under everything so
   the ball, the ramps and the obstacles all read as being ON the board
   rather than behind it. */
export const LAYER: Record<EntityKind, number> = {
  slippery: 0, wind: 0,
  target: 1,
  wall: 2, oval: 2,
  /* Fire shares the obstacle's layer: they are the same class of furniture
     and are read against each other, so neither may cover the other. */
  obstacle: 3, fire: 3,
  breakable: 4, booster: 4, star: 4,
  /* A mystery box rides with the other pickups, and after the star in
     registry order so two that overlap read box-over-star - the box is the
     rarer thing and the one worth noticing. */
  box: 4,
  /* What the player placed paints ON TOP of the board's own furniture, so a
     booster dropped over an obstacle is visibly in front of it. */
  ramp: 5,};

export abstract class Entity<TDef = unknown> {
  abstract readonly kind: EntityKind;

  constructor(readonly def: TDef, readonly index: number) {}

  get layer(): number { return LAYER[this.kind]; }

  abstract draw(g: DrawContext): void;
}
