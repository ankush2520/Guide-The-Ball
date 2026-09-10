/* ============================================================
   PHYSICS CONSTANTS

   Ported VERBATIM from the original engine. Every value here is
   load-bearing: all 30 levels were proved winnable against these
   exact numbers by the solver sweep in tools/genlevels.mjs, so a
   change to any of them invalidates that proof and must be
   followed by a regeneration.
   ============================================================ */

export const W = 480, H = 800;       // logical board size (portrait, 3:5)
export const BALL_R = 9;

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

export const SLIP_REST = 0.985;      // restitution inside a slippery zone

/* Substeps of immunity after a teleport. This alone is NOT enough: the ball
   arrives at the centre of the exit and is still well inside it when the
   count runs out, so a pair with any distance between them ping-pongs. The
   real guard is portalHold - the exit will not fire again until the ball has
   actually left it. The cooldown remains as a second line for a level that
   puts two ends close enough to touch. */
export const PORTAL_CD = 12;

export const STAR_R = 13;            // star collection radius (plus the ball's)
export const WIND_CAP = 1.2;         // hard ceiling on a level's wind accel

// Obstacle bounces mirror off the circle like a real bounce, then scatter by
// up to OB_JITTER. OB_MAX_DEV keeps the result pointing away from the circle
// so the ball can never bounce back into the thing it just hit.
export const OB_JITTER = 32 * Math.PI / 180;
export const OB_MAX_DEV = 78 * Math.PI / 180;
