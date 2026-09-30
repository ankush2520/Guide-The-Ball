/* ============================================================
   THE CUP - the target's real shape

   The goal is a cup, and a ball can only get in the way a ball
   gets into a real cup: over the rim, from above. Its two sides
   and its floor are SOLID - the ball bounces off the outside of
   the cup like off any wall - and the drop is won the moment the
   ball's centre is inside the cup, below the rim.

   One shape, shared by the physics (the three bars below) and the
   renderer (entities/Cup draws exactly this outline), so the cup
   you see is the cup you hit. Every number is a fraction of the
   target's radius r and the cup is centred on the target's
   centre, so it sits inside the circle the levels were laid out
   around.
   ============================================================ */
import type { Circle, Segment } from './types';
import { BALL_R } from '../physics/constants';

export const CUP = {
  mouthY: -0.42,   // the rim, above the centre
  mouthHX: 0.92,   // half-width at the rim
  baseY: 0.80,     // the floor
  baseHX: 0.64,    // half-width at the floor
} as const;

/** Half-thickness of the cup's walls in the physics. */
export const CUP_HT = 3.5;

/** The cup's three bars (left side, right side, floor), centreline, for a
    target circle c. */
export function cupSegments(c: Circle): Segment[] {
  const my = c.y + CUP.mouthY * c.r, by = c.y + CUP.baseY * c.r;
  const mx = CUP.mouthHX * c.r, bx = CUP.baseHX * c.r;
  return [
    { x1: c.x - mx, y1: my, x2: c.x - bx, y2: by },
    { x1: c.x + mx, y1: my, x2: c.x + bx, y2: by },
    { x1: c.x - bx, y1: by, x2: c.x + bx, y2: by },
  ];
}

/** Is the ball at (x, y) INSIDE the cup - below the rim and between the
    walls? The walls are solid, so the only way to get here is over the rim. */
export function inCup(c: Circle, x: number, y: number): boolean {
  const my = c.y + CUP.mouthY * c.r, by = c.y + CUP.baseY * c.r;
  if (y <= my || y >= by) return false;
  const t = (y - my) / (by - my);
  const half = (CUP.mouthHX + (CUP.baseHX - CUP.mouthHX) * t) * c.r - CUP_HT - BALL_R * 0.5;
  return Math.abs(x - c.x) < half;
}
