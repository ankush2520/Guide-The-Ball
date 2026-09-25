/* The level schema, shared by the data files, the factory and the simulation. */

export interface Vec { x: number; y: number; }

/** A circle: obstacles, breakables and the target. */
export interface Circle extends Vec { r: number; }

/** A line segment. Player ramps and level walls are both this, and they are
    run through IDENTICAL physics - only the half-thickness differs. */
export interface Segment {
  x1: number; y1: number; x2: number; y2: number;
  /* ---- the player's SPRING, on a ramp the player drew ----

     `spring` is physics: a sprung ramp bounces exactly as it always did, and
     then multiplies what leaves by SPRING_GAIN. It rides on the segment
     rather than in a list beside it because a ramp can be moved, reshaped and
     deleted, and a parallel array would have to be spliced in step with all
     three - a spring must never end up fitted to a different ramp than the
     one the player put it on.

     `springPaid` is bookkeeping and the simulator never reads it: a spring is
     on loan until a drop that actually fired it wins (see GameController),
     and this is what stops a second win charging for the same one twice.

     Both are absent on every authored segment and on everything the solver
     builds, so an ordinary ramp is exactly the object it always was. */
  spring?: boolean;
  springPaid?: boolean;
}

/** An axis-aligned rectangle. Zones NEVER move: a region that slides through
    the space a player just drew a ramp in is the bug that got moving targets
    deleted from the design. */
export interface Rect { x: number; y: number; w: number; h: number; }

export interface BoosterDef extends Circle { angle: number; speed: number; }

export interface WindDef extends Rect { ax?: number; ay?: number; }
export type SlipperyDef = Rect;
/** `id` is written by the generator to label a pair; the sim ignores it. */
export type BreakableDef = Circle;
export type StarDef = Vec;

/** A MYSTERY BOX: a position, and nothing else.

    What it pays is deliberately NOT authored. The reward is rolled when the
    ball touches it (see RewardManager.rollBoxPrize), so the same field can be
    dropped onto any level - the frozen Verdholm twenty included - without
    anyone having to decide what that level's box is worth, and without a
    level's data having to change when the prize table is retuned. */
export type BoxDef = Vec;

/** A big solid OVAL. Centre, the two semi-axes, and a tilt in degrees
    (clockwise on screen). It collides as a closed ring of wall segments -
    see levels/ovals.ts - so it is a wall the ball goes round, not a red
    obstacle that scatters it. */
export interface OvalDef extends Vec { rx: number; ry: number; angle?: number; }

/** A FIRE obstacle. Geometrically a circle like the red one, and deliberately
    the same shape of data - what differs is entirely what contact means. The
    red obstacle deflects; this ends the drop. */
export type FireDef = Circle;

/** A patrol for a target: side to side, or up and down with y0/y1.

    `x0`/`x1` bound the target CENTRE, and `period` is the full round trip in
    simulation STEPS - steps rather than seconds because the step count is the
    simulation's own clock, and a target that moved on wall-clock time would
    land somewhere different in the solver than it does on screen.

    Horizontal only, and no vertical twin, on purpose: see the note on Rect
    above. A target that moved in y would drag its walls through the space the
    player drew a ramp in, which is precisely the bug that got moving targets
    cut the first time. This mechanic is therefore confined to OPEN targets,
    which have no walls to drag - initLevel() enforces it. */
export interface TargetMove {
  x0: number; x1: number;
  /** Optional vertical waypoints. When set, the target travels the straight
      line from (x0, y0) to (x1, y1), so x0 === x1 gives an up-and-down patrol. */
  y0?: number; y1?: number;
  period: number;
}

export type TargetType = 'OPEN' | 'SIDE_WALL' | 'POCKET' | 'NARROW_GAP' | 'ENCLOSED';
export type WallSide = 'left' | 'right';

/** A level exactly as authored. Optional entity lists are absent in Verdholm. */
export interface RawLevel {
  id: number;
  name: string;
  maxBlocks: number;
  targetType: TargetType;
  wallSide?: WallSide;
  wallH?: number;
  gapW?: number;
  gapX?: number;
  /** Overrides the derived city name (country + ordinal). Left unset for
      now, so every city is named from its position - see cityOf(). Flavour
      names layer in later as a pure data change, one field at a time. */
  city?: string;
  spawn: Vec;
  obstacles?: Circle[];
  boosters?: BoosterDef[];
  /** Boost ramps the LEVEL carries. Empty in every shipped level today: the
      bar is the player's item, and the composed play level is where theirs
      are merged in - see LevelManager.composeLevel(). */
  wind?: WindDef[];
  slippery?: SlipperyDef[];
  breakables?: BreakableDef[];
  stars?: StarDef[];
  fires?: FireDef[];
  ovals?: OvalDef[];
  /** Optional bonus pickups. Scenery to the physics, like stars: a box can
      never change where the ball goes, which is what makes it safe to add to
      a level whose solution is already proved. */
  boxes?: BoxDef[];
  target: Circle;
  /** Absent on every level that came before it, which is what keeps a static
      target a zero-migration default. */
  targetMove?: TargetMove;
  /** This board cannot be solved with a plain ramp: it needs a SPRING out of
      the player's own bag on one of them. A capstone marker, and a CLAIM - the solver sweep
      proves both halves of it (see tests/items.test.mjs), so it may only be
      set on a level that has been through that gate. */
  needsSpring?: boolean;
  /* ============================================================
     A GIFT INSIDE THE TARGET

     The second flavour of mystery box, and the one that is not
     ON the board at all: the target itself is wrapped, and
     clearing the level opens it.

     A FLAG, not a prize. What it pays is rolled from the same
     table the physical chest rolls from, at the moment it is
     opened (see RewardManager.rollBoxPrize), so a designer marks
     a board as special without deciding what special is worth -
     and retuning the prize table never touches level data.

     Absent from almost every level on purpose. It is the beat a
     designer spends on a milestone, and a game where every
     target is wrapped has no milestones.
     ============================================================ */
  targetGift?: boolean;
}

/** A level after normalisation: every list present, walls built. The
    simulation loops over each list with no guard, and Verdholm simply loops
    over nothing. */
export interface Level extends RawLevel {
  obstacles: Circle[];
  boosters: BoosterDef[];
  wind: WindDef[];
  slippery: SlipperyDef[];
  breakables: BreakableDef[];
  stars: StarDef[];
  fires: FireDef[];
  boxes: BoxDef[];
  ovals: OvalDef[];
  walls: Segment[];
}

/** A COUNTRY is a run of levels sharing a mechanic and a palette. It
    recolours the BACKDROP and the chrome accent only - the entity palette
    (red obstacle, green target, blue ramp) is the game's vocabulary and never
    changes: a player who has learned that red hurts must not have to relearn
    it in Neonaka. */
export interface Country {
  id: number;
  name: string;
  from: number;
  to: number;
  /** Backdrop gradient, top to bottom. */
  sky: [string, string, string];
  /** "r,g,b" for the overhead wash and the grid - alpha is applied per use. */
  wash: string;
  accent: string;
  /** What this country teaches. Documentation only; nothing reads it. */
  mechanic: string;
}
