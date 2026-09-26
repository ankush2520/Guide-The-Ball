/* ============================================================
   EATER FISH - where each one is, right now

   An eater fish swims back and forth between x0 and x1 at a
   steady speed, bobbing on a wave as it goes: its height is a
   fixed function of where it is along its lane, so it traces the
   SAME wavy path out and back, forever. Touching the ball ends
   the run - it is eaten (see MatterEngine).

   Like the patrolling target and the lightning, it runs on the
   STEP clock (the ball's t0 + steps, the renderer's simT), so
   the fish the player watches is the fish the ball meets, and a
   board can be learned.
   ============================================================ */
import type { FishDef } from './types';

/** Every clock on a board, as periods in steps: the patrol, each fish, the
    storm's full cycle. A board looks the same at step t as at step t0 only
    when t matches t0 on ALL of them - which is what a hint's drop moment
    needs. Empty on a board with no clock at all. */
export function boardCycles(lv: { targetMove?: { period: number }; fish?: FishDef[];
                                  storm?: { gaps: number[] } }): number[] {
  const out: number[] = [];
  if (lv.targetMove && lv.targetMove.period > 0) out.push(lv.targetMove.period);
  if (lv.fish) for (const f of lv.fish) out.push(f.period);
  if (lv.storm) out.push(lv.storm.gaps.reduce((a, b) => a + b, 0));
  return out;
}

/** How many crests the wave has along a lane of this length. */
export function fishWaves(f: FishDef): number {
  return Math.max(1, Math.round(Math.abs(f.x1 - f.x0) / 110));
}

/** A point on the fish's path, at fraction `u` (0 = x0, 1 = x1). */
export function fishPathAt(f: FishDef, u: number): { x: number; y: number } {
  return { x: f.x0 + (f.x1 - f.x0) * u,
           y: f.y + f.amp * Math.sin(u * fishWaves(f) * Math.PI * 2) };
}

/** Where the fish is at step `t`, and which way it faces (+1 toward x1). */
export function fishAt(f: FishDef, t: number): { x: number; y: number; r: number; dir: number } {
  const p = f.period;
  const k = (((t % p) + p) % p) / p;
  const out = k < 0.5;
  const u = out ? k * 2 : 2 - k * 2;               // 0 -> 1 -> 0, steady speed
  const at = fishPathAt(f, u);
  const dir = (out ? 1 : -1) * Math.sign(f.x1 - f.x0 || 1);
  return { x: at.x, y: at.y, r: f.r, dir };
}
