/* ============================================================
   BALL

   State for one drop. In the original this was a plain object
   built by makeBall(); it is a class here so the bookkeeping
   that was scattered through stepBall - the stall watch, the
   speed audit, the contact record - lives with the data it
   maintains.

   It stays a PURE data-and-arithmetic object: it never draws,
   never touches storage, and never emits. The simulation reads
   and writes it; everything else observes it through the result.
   ============================================================ */
import type { Level } from '../levels/types';
import type { DropResult, Hit, HitKind, BounceRecord, SimulationResult } from './types';
import { mulberry32, falses } from './math';
import {
  BALL_R, TERMINAL_VY, MAX_VX, SPEED_CAP, MIN_BOUNCE,
  REST_STEPS, REST_PX, MAX_STEPS, W, H,
} from './constants';

export class Ball {
  x: number; y: number;
  px: number; py: number;          // previous step, for render interpolation
  vx = 0; vy = 0;                  // released from rest - gravity does the rest

  steps = 0;
  hits = 0;
  segHits = 0;                     // ramp/wall strikes, for the bounce SFX

  /* stall watch: where the ball was, and when, at the last checkpoint */
  restX: number; restY: number; restAt = 0;
  restMin = Infinity;              // closest this run came to stalling

  /* speed audit */
  spdMin = Infinity; spdMax = -Infinity;
  vyMax = 0;                       // deepest fall speed reached

  hit: Hit = { n: 0, x: 0, y: 0, nx: 0, ny: 0, kind: '', speed: 0 };
  bounces: BounceRecord[] = [];

  /* ---- world 2+ mechanics ---- */
  boostIn: boolean[];              // boosters the ball is inside RIGHT NOW, so
                                   // one only fires as you ENTER it
  portalCd = 0;                    // substeps before any portal may fire
  portalHold: { k: number; side: 'a' | 'b' } | null = null;
  broken: boolean[];
  justBroke: number[] = [];        // broke during THIS run, for the shatter
  got: boolean[];                  // stars collected this run

  stars = 0; boosts = 0; teleports = 0;

  readonly rng: () => number;
  result: DropResult | null = null;
  hitX = 0; hitY = 0;              // where a win was scored

  /** `broken` seeds which breakable blocks are ALREADY gone - that state
      survives free retries inside one level entry, so a drop must be able to
      start from it. Pass nothing for a fresh, fully-intact board. */
  constructor(lv: Level, seed: number, broken?: boolean[] | null) {
    this.x = lv.spawn.x; this.y = lv.spawn.y;
    this.px = lv.spawn.x; this.py = lv.spawn.y;
    this.restX = lv.spawn.x; this.restY = lv.spawn.y;
    this.boostIn = falses(lv.boosters.length);
    this.broken = broken ? broken.slice() : falses(lv.breakables.length);
    this.got = falses(lv.stars.length);
    this.rng = mulberry32(seed >>> 0);
  }

  /** The universal magnitude clamp. Never binds in world 1 - see SPEED_CAP. */
  clampSpeed(): void {
    const m = Math.hypot(this.vx, this.vy);
    if (m > SPEED_CAP) { const k = SPEED_CAP / m; this.vx *= k; this.vy *= k; }
  }

  /** Clamp to the terminal values. Gravity only ever pushes vy down, so the
      vertical clamp is one-sided; a bounce can throw the ball upward as fast
      as it likes and gravity will take that back. */
  capVelocity(): void {
    if (this.vy > TERMINAL_VY) this.vy = TERMINAL_VY;
    if (this.vx > MAX_VX) this.vx = MAX_VX;
    if (this.vx < -MAX_VX) this.vx = -MAX_VX;
  }

  /** Never let a glancing contact leave the ball with nothing to travel on. */
  enforceMinBounce(nx: number, ny: number): void {
    const m = Math.hypot(this.vx, this.vy);
    if (m >= MIN_BOUNCE) return;
    const k = m > 1e-6 ? MIN_BOUNCE / m : 0;
    if (k) { this.vx *= k; this.vy *= k; }
    else { this.vx = nx * MIN_BOUNCE; this.vy = ny * MIN_BOUNCE; }
  }

  noteSpeed(): void {
    const m = Math.hypot(this.vx, this.vy);
    if (m < this.spdMin) this.spdMin = m;
    if (m > this.spdMax) this.spdMax = m;
    if (this.vy > this.vyMax) this.vyMax = this.vy;
  }

  /** Record a contact for the renderer. Pure data - physics never reads it. */
  noteHit(x: number, y: number, nx: number, ny: number, kind: HitKind): void {
    const h = this.hit;
    h.n++; h.x = x; h.y = y; h.nx = nx; h.ny = ny; h.kind = kind;
    h.speed = Math.hypot(this.vx, this.vy);
  }

  get speed(): number { return Math.hypot(this.vx, this.vy); }

  /** Has the ball left the board? The board has no walls - leaving by any
      edge ends the run. */
  isOutOfBounds(): boolean {
    return this.x < -BALL_R || this.x > W + BALL_R ||
           this.y < -BALL_R || this.y > H + BALL_R;
  }

  /* A bouncy ball can settle: land dead-flat on a level ramp and it will
     patter in place until MAX_STEPS, leaving the player watching nothing for
     fourteen seconds. Anything genuinely in play covers hundreds of px in
     half a second, so REST_PX over REST_STEPS means it has stopped going
     anywhere. Called once per whole step, never per substep. */
  tickStallWatch(): void {
    this.steps++;
    if (this.steps - this.restAt >= REST_STEPS) {
      const moved = Math.hypot(this.x - this.restX, this.y - this.restY);
      if (moved < this.restMin) this.restMin = moved;
      if (moved < REST_PX) { this.result = 'timeout'; return; }
      this.restX = this.x; this.restY = this.y; this.restAt = this.steps;
    }
    if (this.steps >= MAX_STEPS) this.result = 'timeout';
  }

  toResult(): SimulationResult {
    return {
      result: this.result ?? 'timeout',
      steps: this.steps, hits: this.hits, segHits: this.segHits,
      spdMin: this.spdMin, spdMax: this.spdMax, vyMax: this.vyMax,
      restMin: this.restMin, secs: this.steps / 60,
      stars: this.stars, boosts: this.boosts, teleports: this.teleports,
      broken: this.broken.slice(), bounces: this.bounces,
      x: this.x, y: this.y,
    };
  }
}
