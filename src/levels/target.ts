/* ============================================================
   WHERE THE TARGET IS, RIGHT NOW

   One function, and the only clock a moving target has.

   THE CLOCK IS THE STEP COUNT, not seconds since load. Every
   other animation in the game is a pure function of the wall
   clock, because nothing else on the board is allowed to touch
   the simulation - a mote drifting on the target's rim cannot
   change where the ball lands. This one can, so it reads the
   ball's own step counter instead. A target that patrolled on
   wall-clock time would be somewhere else in the solver than it
   is on screen, and the "plan then watch" contract dies the
   moment those two disagree.

   TRIANGLE, NOT SINE. The target crosses at a constant speed
   and turns around sharply, so the position a player has to
   predict is a straight line in time rather than something that
   loiters at both ends. A sine wave spends most of its life
   near the bounds, which reads as a target that is barely
   moving and then suddenly is.

   t = 0 puts it at x0, which is where it stands the moment its
   level is entered. It is ALREADY MOVING while the player plans
   (the controller runs the same step clock from level entry), and
   a drop starts partway through the patrol at t0 - see
   BallState.t0. Entering the level, or pressing Replay, always
   restarts it from a fixed phase, so the whole thing stays a
   pure function of integers the solver can sweep.
   ============================================================ */
import type { Circle, Level, RawLevel } from './types';

/** The target's centre at elapsed simulation time `t`, in steps. Fractional
    `t` is allowed and is what lets the renderer interpolate between physics
    states instead of snapping from one step to the next. */
export function targetAt(lv: Pick<RawLevel, 'target' | 'targetMove'>, t: number): Circle {
  const mv = lv.targetMove;
  if (!mv) return lv.target;
  const p = mv.period;
  if (!(p > 0)) return lv.target;
  /* Modulo first, so a long run cannot accumulate float error, and the extra
     +p handles a negative t rather than trusting callers not to pass one. */
  const k = (((t % p) + p) % p) / p;
  const tri = k < 0.5 ? k * 2 : 2 - k * 2;      // 0 -> 1 -> 0
  const y0 = mv.y0 ?? lv.target.y, y1 = mv.y1 ?? lv.target.y;
  return { x: mv.x0 + (mv.x1 - mv.x0) * tri, y: y0 + (y1 - y0) * tri, r: lv.target.r };
}

/** Whether this level's target patrols at all. Cheaper to read than the
    optional field at every call site, and says what it means. */
export function isMoving(lv: Pick<Level, 'targetMove'>): boolean {
  return !!lv.targetMove && lv.targetMove.period > 0;
}
