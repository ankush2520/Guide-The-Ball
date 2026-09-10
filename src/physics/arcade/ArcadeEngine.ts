/* ============================================================
   ARCADE ENGINE

   The original hand-written simulator, behind the common
   interface. This is the reference implementation: every one of
   the 30 shipped levels was PROVED winnable against it by the
   solver sweep, and tests/parity.test.mjs holds it
   trajectory-identical to the pre-rewrite build.
   ============================================================ */
import type { Level, Segment } from '../../levels/types';
import type { SimulationResult } from '../types';
import type { BallState, PhysicsEngine } from '../PhysicsEngine';
import { Ball } from '../Ball';
import { stepBall, simulate } from '../simulate';

export class ArcadeEngine implements PhysicsEngine {
  readonly id = 'arcade' as const;
  readonly label = 'Arcade (original)';
  readonly blurb =
    'The hand-written deterministic simulator the levels were designed and ' +
    'verified against. Terminal velocity, a global speed cap, and a seeded ' +
    'bounce scatter - tuned for readability, not realism.';

  createBall(lv: Level, seed: number, broken?: boolean[] | null): BallState {
    return new Ball(lv, seed, broken);
  }

  step(ball: BallState, lv: Level, ramps: readonly Segment[]): void {
    stepBall(ball as Ball, lv, ramps as Segment[]);
  }

  simulate(lv: Level, ramps: readonly Segment[], seed: number,
           broken?: boolean[] | null): SimulationResult {
    return simulate(lv, ramps as Segment[], seed, broken);
  }
}
