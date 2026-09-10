/* ============================================================
   ENGINE REGISTRY

   Both simulators, addressable by id. The engine is chosen once
   at boot and can be switched at runtime from the info panel or
   with ?engine=matter in the URL.

   The DEFAULT matters: the 30 shipped levels were proved
   winnable against the arcade engine by the solver sweep, and
   that proof does not transfer. See tests/engines.test.mjs for
   what each engine actually does to them.
   ============================================================ */
import type { EngineId, PhysicsEngine } from './PhysicsEngine';
import { ArcadeEngine } from './arcade/ArcadeEngine';
import { MatterEngine, MATTER_TUNED, MATTER_PURE } from './matter/MatterEngine';

export const ENGINES: Record<EngineId, () => PhysicsEngine> = {
  arcade: () => new ArcadeEngine(),
  matter: () => new MatterEngine(MATTER_TUNED),
};

/* Matter.js runs the game by default. tests/engines.test.mjs is the evidence
   this is safe: over all 30 boards there is no level solvable under one
   engine but not the other. What DOES differ is the exact path - the same
   layout lands a mean 35px/22px away - so solutions shift even though
   solvability does not. The arcade engine remains one tap away in the info
   panel, and is still the reference the solver sweep verifies against. */
export const DEFAULT_ENGINE: EngineId = 'matter';

const STORE_KEY = 'gtb.engine.v1';

/** ?engine=matter wins, then whatever was last chosen, then the default. */
export function preferredEngineId(): EngineId {
  try {
    const q = new URLSearchParams(location.search).get('engine');
    if (q === 'arcade' || q === 'matter') return q;
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'arcade' || saved === 'matter') return saved;
  } catch { /* no location / blocked storage */ }
  return DEFAULT_ENGINE;
}

export function rememberEngineId(id: EngineId): void {
  try { localStorage.setItem(STORE_KEY, id); } catch { /* blocked storage */ }
}

export function createEngine(id: EngineId): PhysicsEngine {
  return (ENGINES[id] ?? ENGINES[DEFAULT_ENGINE])();
}

export { ArcadeEngine, MatterEngine, MATTER_TUNED, MATTER_PURE };
export type { PhysicsEngine, EngineId };
