/* ============================================================
   CRABS - where each one is, right now

   A crab walks a CLOSED path over and over, forever, one lap
   every `period` steps - so the board repeats and can be
   learned. The path is one of a few shapes, chosen to be nice
   to watch:

     orbit   - an ellipse round (cx, cy)
     eight   - a figure-8 (lemniscate) through (cx, cy)
     flower  - a loop with three petals (an epicycle)
     scuttle - side to side, with little hops, as crabs do

   `phase` (0..1) offsets where on the lap it starts, which is
   how two crabs share one orbit and dance opposite each other.

   Touching the ball PINCHES it: the run ends, like fire (see
   MatterEngine). Like every clock on the board it runs on the
   STEP clock - the ball's t0 + steps, the renderer's simT - so
   the crab the player watches is the crab the ball meets.
   ============================================================ */
import type { CrabDef } from './types';

const TAU = Math.PI * 2;

/** The point at fraction `u` (0..1) of a lap of the crab's path. */
export function crabPathAt(c: CrabDef, u: number): { x: number; y: number } {
  const t = u * TAU;
  switch (c.pattern) {
    case 'eight':
      return { x: c.cx + c.rx * Math.sin(t), y: c.cy + c.ry * Math.sin(2 * t) };
    case 'flower': {
      // a circle with a faster small circle riding on it: three soft petals
      const k = 0.28;
      return { x: c.cx + c.rx * (Math.cos(t) + k * Math.cos(4 * t)) / (1 + k),
               y: c.cy + c.ry * (Math.sin(t) - k * Math.sin(4 * t)) / (1 + k) };
    }
    case 'scuttle':
      return { x: c.cx + c.rx * Math.sin(t), y: c.cy - c.ry * Math.abs(Math.sin(3 * t)) };
    case 'orbit':
    default:
      return { x: c.cx + c.rx * Math.cos(t), y: c.cy + c.ry * Math.sin(t) };
  }
}

/** Where the crab is at step `t`, and which way it is heading in x. */
export function crabAt(c: CrabDef, t: number): { x: number; y: number; r: number; dir: number } {
  const p = c.period;
  const u = ((((t / p) + (c.phase ?? 0)) % 1) + 1) % 1;
  const a = crabPathAt(c, u), b = crabPathAt(c, u + 0.002);
  return { x: a.x, y: a.y, r: c.r, dir: b.x >= a.x ? 1 : -1 };
}

/** Every clock on a board, as periods in steps: the patrol, each crab, the
    storm's full cycle. A board looks the same at step t as at step t0 only
    when t matches t0 on ALL of them - which is what a hint's drop moment
    needs. Empty on a board with no clock at all. */
export function boardCycles(lv: { targetMove?: { period: number }; crabs?: CrabDef[]; movers?: { period: number }[]; wind?: { period?: number }[];
                                  storm?: { gaps: number[] } }): number[] {
  const out: number[] = [];
  if (lv.targetMove && lv.targetMove.period > 0) out.push(lv.targetMove.period);
  if (lv.crabs) for (const c of lv.crabs) out.push(c.period);
  if (lv.movers) for (const m of lv.movers) out.push(m.period);
  if (lv.wind) for (const z of lv.wind) if (z.period) out.push(z.period);
  if (lv.storm) out.push(lv.storm.gaps.reduce((a, b) => a + b, 0));
  return out;
}

