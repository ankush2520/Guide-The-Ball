/* ============================================================
   MOVING BUMPERS - where each one is, right now

   A red obstacle on a short track. It bounces the ball exactly as a
   still one does and NEVER ends the drop. Like the crab and the
   patrolling cup it runs on the STEP clock (the ball's t0 + steps,
   the renderer's simT), so the bumper the player watches is the
   bumper the ball meets.
   ============================================================ */
import type { MoverDef } from './types';

const TAU = Math.PI * 2;

/** The point at fraction `u` (0..1) of a lap of the track. */
export function moverPathAt(m: MoverDef, u: number): { x: number; y: number } {
  const t = u * TAU;
  switch (m.pattern) {
    case 'rise':  return { x: m.cx, y: m.cy + m.range * Math.sin(t) };
    case 'orbit': return { x: m.cx + m.range * Math.cos(t), y: m.cy + m.range * Math.sin(t) };
    case 'slide':
    default:      return { x: m.cx + m.range * Math.sin(t), y: m.cy };
  }
}

/** Where the bumper is at step `t`. */
export function moverAt(m: MoverDef, t: number): { x: number; y: number } {
  const u = ((((t / m.period) + (m.phase ?? 0)) % 1) + 1) % 1;
  return moverPathAt(m, u);
}
