/* The level schema, shared by the data files, the factory and the simulation. */

export interface Vec { x: number; y: number; }

/** A circle: obstacles, breakables, the target, and both portal ends. */
export interface Circle extends Vec { r: number; }

/** A line segment. Player ramps and level walls are both this, and they are
    run through IDENTICAL physics - only the half-thickness differs. */
export interface Segment { x1: number; y1: number; x2: number; y2: number; }

/** An axis-aligned rectangle. Zones NEVER move: a region that slides through
    the space a player just drew a ramp in is the bug that got moving targets
    deleted from the design. */
export interface Rect { x: number; y: number; w: number; h: number; }

export interface BoosterDef extends Circle { angle: number; speed: number; }
export interface WindDef extends Rect { ax?: number; ay?: number; }
export type SlipperyDef = Rect;
export interface PortalEnd extends Circle { facing?: number | null; }
/** `id` is written by the generator to label a pair; the sim ignores it. */
export interface PortalDef { id?: string; a: PortalEnd; b: PortalEnd; }
export type BreakableDef = Circle;
export type StarDef = Vec;

export type TargetType = 'OPEN' | 'SIDE_WALL' | 'POCKET' | 'NARROW_GAP' | 'ENCLOSED';
export type WallSide = 'left' | 'right';

/** A level exactly as authored. Optional entity lists are absent on world 1. */
export interface RawLevel {
  id: number;
  name: string;
  maxBlocks: number;
  targetType: TargetType;
  wallSide?: WallSide;
  wallH?: number;
  gapW?: number;
  gapX?: number;
  spawn: Vec;
  obstacles?: Circle[];
  boosters?: BoosterDef[];
  wind?: WindDef[];
  slippery?: SlipperyDef[];
  portals?: PortalDef[];
  breakables?: BreakableDef[];
  stars?: StarDef[];
  target: Circle;
}

/** A level after normalisation: every list present, walls built. The
    simulation loops over each list with no guard, and world 1 simply loops
    over nothing. */
export interface Level extends RawLevel {
  obstacles: Circle[];
  boosters: BoosterDef[];
  wind: WindDef[];
  slippery: SlipperyDef[];
  portals: PortalDef[];
  breakables: BreakableDef[];
  stars: StarDef[];
  walls: Segment[];
}

export interface World {
  id: number;
  name: string;
  from: number;
  to: number;
  sky: [string, string, string];
  wash: string;
  accent: string;
}
