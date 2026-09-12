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

   t = 0 puts it at x0, which is where the board sits while the
   player is still planning.
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
  return { x: mv.x0 + (mv.x1 - mv.x0) * tri, y: lv.target.y, r: lv.target.r };
}

/** Whether this level's target patrols at all. Cheaper to read than the
    optional field at every call site, and says what it means. */
export function isMoving(lv: Pick<Level, 'targetMove'>): boolean {
  return !!lv.targetMove && lv.targetMove.period > 0;
}
