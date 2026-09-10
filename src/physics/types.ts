/** How a drop ended. `null` while it is still running. */
export type DropResult = 'win' | 'out' | 'timeout';

/** What the ball last touched. Drives the juice, never the physics. */
export type HitKind = 'ramp' | 'wall' | 'obstacle' | 'breakable' | 'booster' | 'portal';

/** Last contact, mutated in place so the solver never allocates. */
export interface Hit {
  n: number;            // bumped on every contact - the renderer watches this
  x: number; y: number;
  nx: number; ny: number;
  kind: HitKind | '';
  speed: number;
}

/** One obstacle bounce, recorded for the trajectory debug view. */
export interface BounceRecord { inAng: number; nAng: number; outAng: number; }

/** The outcome of a headless run. */
export interface SimulationResult {
  result: DropResult;
  steps: number; hits: number; segHits: number;
  spdMin: number; spdMax: number; vyMax: number; restMin: number;
  secs: number;
  stars: number; boosts: number; teleports: number;
  broken: boolean[];
  bounces: BounceRecord[];
  x: number; y: number;
}
