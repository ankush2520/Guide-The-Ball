/* ============================================================
   THE THUNDERSTORM - its clock

   A level with a `storm` has a fixed set of strike POINTS and a
   fixed GAP (in simulation steps) after each one. Lightning hits
   point 0, then point 1 a gap later, and so on round the list,
   and then back to point 0 - forever, the same every time.

   Like the patrolling target, it runs on the STEP clock, never
   the wall clock: the physics reads it at the ball's own step
   (t0 + steps) and the renderer at DrawContext.simT, so the
   bolt the player sees is the bolt that hits the ball, and a
   board can be learned.

   A strike that catches the ball ENDS the run, exactly like
   fire - see MatterEngine.
   ============================================================ */
import type { RawLevel, Vec } from './types';

/** Reach of a strike, from its centre. */
export const STORM_R = 45;
/** How long a strike is live, in steps (0.6s). */
export const STRIKE_STEPS = 36;
/** How long a point flickers before it is struck (0.5s). */
export const WARN_STEPS = 30;

type StormLevel = Pick<RawLevel, 'storm'>;

function schedule(lv: StormLevel): { starts: number[]; cycle: number } | null {
  const s = lv.storm;
  if (!s || !s.points.length || s.gaps.length !== s.points.length) return null;
  const starts: number[] = [];
  let t = 0;
  for (const g of s.gaps) { starts.push(t); t += g; }
  return t > 0 ? { starts, cycle: t } : null;
}

export interface Strike {
  /** Which point is being struck. */
  index: number;
  /** A number unique to THIS strike (point and lap). */
  key: number;
  p: Vec;
  /** Steps since it hit, 0..STRIKE_STEPS. */
  age: number;
}

/** The live strike at step `t`, or null. */
export function strikeAt(lv: StormLevel, t: number): Strike | null {
  const sc = schedule(lv);
  if (!sc) return null;
  const lap = Math.floor(t / sc.cycle);
  const tm = t - lap * sc.cycle;
  for (let i = 0; i < sc.starts.length; i++) {
    const age = tm - sc.starts[i];
    if (age >= 0 && age < STRIKE_STEPS)
      return { index: i, key: lap * sc.starts.length + i, p: lv.storm!.points[i], age };
  }
  return null;
}

/** Steps until point `i` is next struck (0 while it is being struck). */
export function stepsUntil(lv: StormLevel, i: number, t: number): number {
  const sc = schedule(lv);
  if (!sc) return Infinity;
  const tm = ((t % sc.cycle) + sc.cycle) % sc.cycle;
  return (sc.starts[i] - tm + sc.cycle) % sc.cycle;
}
