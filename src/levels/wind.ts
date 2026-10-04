/* ============================================================
   FANS SWITCH ON AND OFF

   A fan blows for `on` steps out of every `period`, shifted by
   `offset`, and is still for the rest - so a gust can be timed,
   like a crab or a black hole. Runs on the STEP clock (the ball's
   t0 + steps, the renderer's simT), so the fan the player sees
   blowing is the fan that pushes the ball.
   ============================================================ */
import type { WindDef } from './types';

/** The default cycle every zone gets when the level does not author one. */
export const WIND_PERIOD = 300, WIND_ON = 170;
/** Steps the gusts take to spin up / die away on screen (drawing only). */
const RAMP = 18;

const phaseOf = (z: WindDef, t: number): number => {
  const p = z.period ?? 0;
  return p > 0 ? ((((t + (z.offset ?? 0)) % p) + p) % p) : 0;
};

/** Is the fan blowing at step t? A zone with no cycle always blows. */
export function windOn(z: WindDef, t: number): boolean {
  if (!z.period) return true;
  return phaseOf(z, t) < (z.on ?? WIND_ON);
}

/** 0..1 for drawing: how hard it looks like it is blowing (eased in and out). */
export function windLook(z: WindDef, t: number): number {
  if (!z.period) return 1;
  const ph = phaseOf(z, t), on = z.on ?? WIND_ON;
  if (ph < on) return Math.min(1, ph / RAMP, (on - ph) / RAMP + 0.35);
  return Math.max(0, 1 - (ph - on) / RAMP) * 0.35;
}

/** Total steps the fan has been ON up to step t - its blades turn only then. */
export function windOnSteps(z: WindDef, t: number): number {
  if (!z.period) return t;
  const p = z.period, on = z.on ?? WIND_ON, tt = t + (z.offset ?? 0);
  const laps = Math.floor(tt / p);
  return laps * on + Math.min(on, tt - laps * p);
}
