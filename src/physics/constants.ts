/* ============================================================
   PHYSICS CONSTANTS

   Ported VERBATIM from the original engine. Every value here is
   load-bearing: all 30 levels were proved winnable against these
   exact numbers by the solver sweep in tools/genlevels.mjs, so a
   change to any of them invalidates that proof and must be
   followed by a regeneration.
   ============================================================ */

/* The DESIGN BOX. Every level in the game is authored in these coordinates,
   and the solver sweep proved all 30 winnable inside them - so this pair is
   frozen even when the board around it is not. See BOARD below. */
export const W = 480, H = 800;
export const BALL_R = 9;

/* ============================================================
   THE BOARD

   The design box is 480x800 (3:5), which is a phone. A tablet
   or a desktop is not, and on one the board was a narrow strip
   down the middle of the window.

   So the board may be WIDER than the box it is designed in. The
   level content stays exactly where it was authored - nothing
   is scaled or moved - and the board simply extends `pad` px
   past the box on each side, giving x the range [x0, x1]. At
   pad 60 that is 600x800, a 3:4 tablet.

   This cannot unmake a solved level. There are no side walls:
   leaving the board sideways is a LOSS (see isOutOfBounds), so
   a wider board is strictly more forgiving than a narrow one -
   every winning shot still wins, and the margins are new room
   to draw ramps in rather than new ways to fail.

   The pad is set once at boot by GameContext, from the viewport.
   It defaults to 0, which is what keeps the headless harness -
   the solver sweep and the mechanic tests - authoring and
   proving levels in the design box regardless of what window
   the browser happens to give them.
   ============================================================ */
export const PAD_TABLET = 60;        // 600x800 = 3:4

export const BOARD = {
  pad: 0,
  /** Full board width, design box plus both margins. */
  get w(): number { return W + this.pad * 2; },
  /** Left edge, at or left of the design box's 0. */
  get x0(): number { return -this.pad; },
  /** Right edge, at or right of the design box's W. */
  get x1(): number { return W + this.pad; },
};

/** Widen (or un-widen) the board. Everything that paints or hit-tests reads
    BOARD live, so this is the only thing a profile change has to set. */
export function setBoardPad(pad: number): void { BOARD.pad = Math.max(0, pad); }

/* ============================================================
   THE PLAY AREA

   The part of the board a ball may occupy and a player may draw
   in. It is the BOARD's own rect whenever the scene is painted
   at full size, and that is what the headless harness runs and
   what every level was proved against - `scale` starts at 1 and
   only the app moves it.

   It exists because the scene can be painted SMALLER than the
   surface it is on (see render/view.ts). The board's rect then
   covers only the middle of what the player can see, and the
   ring of sky around it was dead: a ramp could not be drawn out
   there, and a ball that reached it was already lost at a line
   nothing on screen marked. The play area is that whole visible
   rect - the board's, grown about its own centre by exactly the
   amount the scene was shrunk - so what looks like board IS
   board.

   Growing it cannot unmake a solved level, by the same argument
   the BOARD note above makes for the margins: there is nothing
   out there to hit, leaving is still a loss, and a shot that won
   inside the design box wins untouched. It is strictly more
   room and a later loss, never a different game.
   ============================================================ */
export const PLAY = {
  /** What fraction of the play area the board's own rect covers. 1 is the
      two being the same rect. */
  scale: 1,
  get cx(): number { return (BOARD.x0 + BOARD.x1) / 2; },
  get x0(): number { return this.cx + (BOARD.x0 - this.cx) / this.scale; },
  get x1(): number { return this.cx + (BOARD.x1 - this.cx) / this.scale; },
  get y0(): number { return H / 2 - (H / 2) / this.scale; },
  get y1(): number { return H / 2 + (H / 2) / this.scale; },
};

/** Set from the app's view scale at boot, beside setBoardPad. Out-of-range
    values are ignored rather than trusted: a zero here would be an infinite
    board, and the harness must keep the 1 it never sets. */
export function setPlayScale(scale: number): void {
  if (scale > 0.2 && scale <= 1) PLAY.scale = scale;
}

// Downward terminal velocity. 9 px/step = 540 px/s, which is what the board
// was tuned around back when the ball travelled at one fixed speed.
export const TERMINAL_VY = 9;

// Reaching terminal in ~24 steps (0.4s) gives a fall you can read: a visible
// acceleration off the spawn, then a steady rate for the rest of the board.
export const GRAVITY = TERMINAL_VY / 24;   // 0.375 px/step^2

// Sideways is capped at the same magnitude. Nothing accelerates vx, but a
// steep reflection can convert a lot of vy into it, and the cap is what keeps
// the substep count (and therefore tunnelling) bounded.
export const MAX_VX = TERMINAL_VY;

// How much of the impact speed survives a bounce. Below ~0.85 the ball dies
// on contact; above ~0.92 it never settles.
export const RESTITUTION = 0.9;

// Floor on the speed a bounce leaves behind, so a glancing contact cannot
// stop the ball dead on a ramp. It does not stop a ball settling into an
// ever-smaller patter - the stall watch in stepBall handles that.
export const MIN_BOUNCE = 1.6;

export const RAMP_HT = 4.5;          // player ramp half-thickness
export const WALL_HT = 5;            // static wall half-thickness

// Enough substeps that the ball never advances more than ~1.5px at a time,
// however fast it is going - otherwise it tunnels through thin segments.
export const MAX_SPEED = Math.hypot(MAX_VX, TERMINAL_VY);
export const SUBSTEPS = Math.max(5, Math.ceil(MAX_SPEED / 1.5));

export const MAX_STEPS = 60 * 14;    // 14s of bouncing, then it's a loss
// ...or sooner, if it has visibly stopped travelling (see stepBall)
export const REST_STEPS = 30, REST_PX = 4;
export const MIN_RAMP = 28, MAX_RAMP = 160;

/* ---- mechanic constants (countries 2+) ---- */

/* The universal speed clamp. Set at exactly the speed the base game can
   already reach - hypot(MAX_VX, TERMINAL_VY) - which makes it a PROVABLE
   no-op for Verdholm: a bounce is lossy, so nothing there ever exceeds it.
   Boosters and wind can stack, and without this they would compound into
   speeds that both tunnel through thin ramps and destroy the constant-feel
   trajectory model the whole game is built on. */
export const SPEED_CAP = MAX_SPEED;

/* What a booster multiplies its authored exit speed by. The levels store the
   speed each booster was DESIGNED around; this is the one dial that scales
   every one of them at once, so the tuning rig can sweep it (see
   tools/harness.mjs) without rewriting thirty levels.

   Note what it collides with: SPEED_CAP above is hypot(MAX_VX, TERMINAL_VY) =
   12.73, and every authored booster speed is already 9.98-12.21. Any gain
   above ~1.05 is therefore swallowed by the cap unless the cap moves with it -
   and the cap is the tunnelling guard, so moving it has a price the comment on
   SPEED_CAP spells out. BOOST_CAP below is what actually decides whether a
   gain reaches the ball. */
export const BOOST_GAIN = 2;

/* The ceiling a BOOSTED ball is held to, as distinct from the one the rest of
   the board lives under. A booster is a deliberate, authored kick, so it is
   allowed to outrun the general cap - but not past the speed at which the
   ball stops colliding at all. Matter runs one 1/60s step with no continuous
   collision detection, so a ball moving more than a ramp's full 9px thickness
   per frame can pass clean through one. 13 keeps every boosted frame inside
   that thickness with a margin. */
export const BOOST_CAP = 13;

/* How long the kick is allowed to outlive the step that applied it. Long
   enough to be a launch the player can see and plan around; short enough that
   the ball is back under the board's normal rules well before it crosses it. */
export const BOOST_STEPS = 18;       // 0.3s

/* ============================================================
   THE PLAYER'S BOOST RAMP

   The item out of the bag is a BAR now, not a pad: the ramp's
   silhouette, and the ramp's physics - the ball mirrors off it
   exactly as it does off one the player drew. The one difference
   is what leaves: the exit speed is MULTIPLIED, where a ramp
   only redirects.

   None of this touches the authored pads above. Twenty-three
   shipped levels were proved winnable against BOOST_GAIN and
   BOOST_CAP, so those two numbers - and the path that reads them
   - are frozen, and everything here is a second, independent
   mechanism that only a bar out of the bag can arm.
   ============================================================ */

/* Half-thickness, and it is what the body is built at as well as what is
   painted: thicker than a drawn ramp's 4.5, because this one is a machine
   rather than a line, and because a fat bar is a fatter thing for a ball
   moving several times normal speed to find. */
export const BOOST_HT = 7;

/* THE FIXED LENGTH. A ramp is whatever length the drag made it; an item has
   one shape, and choosing where it goes and which way it lies is the whole
   move. Shorter than the solver's 120-unit ramp so the two never read as the
   same object at a glance. */
export const BOOST_LEN = 96;

/* THE MULTIPLIER, applied to the speed the ball came IN with.

   It shipped at 10 and came down to 3.5 - 0.35x of that - after the board was
   played at it: a ten-times launch crossed the whole board in eight frames,
   which is a ball that has teleported rather than one you watched go. At 3.5
   a ball arriving at terminal (9) leaves at 31, still nearly three times
   anything the rest of the board can reach and far past what any bounce can
   give back, and it stays on screen long enough to read.

   See tests/mechanics.mjs for the measured curve and tests/items.test.mjs for
   the proof that level 30 is still solvable with one of these - and still not
   solvable without. */
export const BOOST_RAMP_GAIN = 3.5;

/* The ceiling on a launch. Not a tunnelling guard - the substepping below is
   what keeps a fast ball colliding honestly - but a sanity limit, so two bars
   in a row cannot compound into a number that eats the step budget in
   substeps for no visible gain. Kept at the gain's own scale: the fastest
   single launch is 3.5 x the general cap, and this is a shade over it, so one
   bar is never clipped and a chain of them still settles somewhere sane. */
export const BOOST_RAMP_CAP = 46;

/* How the launch comes back DOWN to the board's own rules. A hard window that
   ended at the general cap snapped the ball from 90 to 12.7 in one frame,
   which reads as a stutter rather than as a landing; this bleeds the ceiling
   off geometrically instead, so the ball visibly settles. At 0.86 a 90-unit
   launch is back under the general cap in about 13 steps (~0.2s), which is
   roughly the time it takes to cross the board. */
export const BOOST_DECAY = 0.86;

/* Steps before the same bar may fire again. A bar is two-sided and a turbo
   ball can come back through it within a frame or two of leaving; without
   this, one bar and one unlucky angle is a ball multiplying itself every
   other step. Long enough to have left, short enough that a genuine second
   pass across the board still gets its kick. */
export const BOOST_RAMP_CD = 12;

/* ---- how a turbo ball is kept colliding ----

   Matter runs one 1/60s step with no continuous collision detection, so a
   ball moving further than a bar is thick passes clean THROUGH it. BOOST_CAP
   above is that limit for the authored pads: 13 units a frame, inside a
   ramp's 9-unit thickness.

   A boost ramp deliberately exceeds it, so the frame is SUBDIVIDED instead:
   the engine runs as many Matter steps as it takes to keep each one under
   BOOST_SUB_PX. Matter's own time correction rescales the Verlet velocity
   when the delta changes, and gravity integrates to the same total over the
   subdivided frame as over the whole one - so a ball that is not flying is
   not affected at all. Which is the point of the gate: the subdivision only
   ever happens above BOOST_CAP, a speed nothing in the base game and no
   authored pad can reach, so every proved level still runs the identical
   single step it was proved with. */
export const BOOST_SUB_PX = 3;
export const BOOST_SUBSTEPS_MAX = 48;

export const SLIP_REST = 0.985;      // restitution inside a slippery zone

/* Substeps of immunity after a teleport. This alone is NOT enough: the ball
   arrives at the centre of the exit and is still well inside it when the
   count runs out, so a pair with any distance between them ping-pongs. The
   real guard is portalHold - the exit will not fire again until the ball has
   actually left it. The cooldown remains as a second line for a level that
   puts two ends close enough to touch. */
export const PORTAL_CD = 12;

export const STAR_R = 13;            // star collection radius (plus the ball's)
/* A mystery box is a PRESENT, and a present has to be big enough to read as
   one on a 270px-wide phone board - the ribbon and the bow are what say what
   it is, and neither survives being drawn at star size. It is still the same
   KIND of thing to the simulation as a star: scenery the ball passes through,
   never geometry it hits, so its size can be chosen for legibility alone. */
export const BOX_R = 20;             // box collection radius (plus the ball's)
export const WIND_CAP = 1.2;         // hard ceiling on a level's wind accel

// Obstacle bounces mirror off the circle like a real bounce, then scatter by
// up to OB_JITTER. OB_MAX_DEV keeps the result pointing away from the circle
// so the ball can never bounce back into the thing it just hit.
export const OB_JITTER = 32 * Math.PI / 180;
export const OB_MAX_DEV = 78 * Math.PI / 180;
