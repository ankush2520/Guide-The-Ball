/* ============================================================
   ENGINE FACTORY

   Matter.js runs the game. It used to share this seam with a
   hand-written arcade simulator, which has been removed - the
   PhysicsEngine interface survives it, because keeping the
   controller, the renderer and the solver sweep unable to name
   a concrete simulator is what keeps the simulation pure.
   ============================================================ */
import type { PhysicsEngine } from './PhysicsEngine';
import { MatterEngine, MATTER_TUNED, MATTER_PURE } from './matter/MatterEngine';

export function createEngine(): PhysicsEngine {
  return new MatterEngine(MATTER_TUNED);
}

export { MatterEngine, MATTER_TUNED, MATTER_PURE };
export type { PhysicsEngine };
