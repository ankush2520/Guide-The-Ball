/* ============================================================
   PHYSICS ENGINE - the seam between the game and its simulator.

   The game reads a BallState and calls step() once per 1/60s.
   It does not care what is behind that: the original hand-written
   arcade simulator, or Matter.js.

   Everything outside this folder - the controller, the renderer,
   the solver sweep - talks to this interface only, which is what
   makes the two engines interchangeable at runtime.
   ============================================================ */
import type { Level, Segment } from '../levels/types';
import type { DropResult, Hit, SimulationResult } from './types';

/** What every engine must expose about the ball in flight. */
export interface BallState {
  x: number; y: number;
  /** Previous step's position, for render interpolation. */
  px: number; py: number;
  vx: number; vy: number;

  steps: number;
  hits: number;
  segHits: number;

  /** Last contact. The renderer watches `n`; physics never reads it back. */
  hit: Hit;

  broken: boolean[];
  justBroke: number[];
  got: boolean[];

  stars: number;
  boosts: number;
  teleports: number;

  result: DropResult | null;
  readonly speed: number;

  toResult(): SimulationResult;
}

export type EngineId = 'arcade' | 'matter';

export interface PhysicsEngine {
  readonly id: EngineId;
  /** Shown in the engine picker. */
  readonly label: string;
  /** One line on what this engine is, for the info panel. */
  readonly blurb: string;

  createBall(lv: Level, seed: number, broken?: boolean[] | null): BallState;

  /** Advance one 1/60s step. Sets ball.result when the run ends. */
  step(ball: BallState, lv: Level, ramps: readonly Segment[]): void;

  /** Run a whole drop headlessly and report the outcome. */
  simulate(lv: Level, ramps: readonly Segment[], seed: number,
           broken?: boolean[] | null): SimulationResult;

  /** Release anything the engine holds for a finished run. Matter builds a
      world per drop; the arcade engine holds nothing and does not implement
      this. */
  dispose?(ball: BallState): void;
}
