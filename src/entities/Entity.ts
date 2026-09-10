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

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  /** Seconds since load. Every animation is a pure function of this, so the
      board looks identical at the same clock on any device. */
  clock: number;
  /** Which breakables have been destroyed, and which stars taken. Live run
      state, read by the entities that have two appearances. */
  broken: boolean[];
  got: boolean[];
}

export type EntityKind =
  | 'slippery' | 'wind'          // ground
  | 'target'
  | 'wall'
  | 'obstacle'
  | 'breakable' | 'booster' | 'portal' | 'star'
  | 'ramp';

/* Paint order, low to high. Zones are GROUND: they sit under everything so
   the ball, the ramps and the obstacles all read as being ON the board
   rather than behind it. */
export const LAYER: Record<EntityKind, number> = {
  slippery: 0, wind: 0,
  target: 1,
  wall: 2,
  obstacle: 3,
  breakable: 4, booster: 4, portal: 4, star: 4,
  ramp: 5,
};

export abstract class Entity<TDef = unknown> {
  abstract readonly kind: EntityKind;

  constructor(readonly def: TDef, readonly index: number) {}

  get layer(): number { return LAYER[this.kind]; }

  abstract draw(g: DrawContext): void;
}
