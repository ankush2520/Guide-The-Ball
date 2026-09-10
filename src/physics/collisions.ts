/* ============================================================
   COLLISION RESOLUTION

   Ported verbatim. Two primitives only - a line segment and a
   circle - and every collidable thing in the game is one of
   them. Player ramps and level walls run through IDENTICAL
   segment physics; obstacles and breakables run through
   IDENTICAL circle physics. That sameness is deliberate: a
   breakable must feel exactly like an obstacle on the hit that
   destroys it, or the mechanic reads as a different thing.
   ============================================================ */
import type { Level, Segment, Circle, Rect } from '../levels/types';
import type { HitKind } from './types';
import { Ball } from './Ball';
import { closestOnSeg } from './math';
import { BALL_R, RAMP_HT, WALL_HT, MIN_BOUNCE, OB_JITTER, OB_MAX_DEV } from './constants';

export function inDisc(b: Ball, c: Circle | { x: number; y: number; r: number }, r: number): boolean {
  const dx = b.x - c.x, dy = b.y - c.y;
  return dx * dx + dy * dy <= r * r;
}

/* Zones are axis-aligned rectangles and NEVER move. That is deliberate: a
   region that slides through the space a player just drew a ramp in is the
   same class of bug that got moving targets deleted. */
export function inZone(b: Ball, z: Rect): boolean {
  return b.x >= z.x && b.x <= z.x + z.w && b.y >= z.y && b.y <= z.y + z.h;
}

/* Both the ball and the target are circles, so the win check is simply
   "is the ball's centre inside the outer ring". */
export function inTarget(b: Ball, c: Circle): boolean {
  return Math.hypot(b.x - c.x, b.y - c.y) <= c.r;
}

/** Bounce off a static line segment: mirror the velocity about the surface
    normal and scale it by `rest`. Gravity keeps acting on vy afterwards, so
    the ball arcs away rather than holding a fixed heading. Used for BOTH
    player ramps and level walls - identical physics. */
export function segmentBounce(b: Ball, s: Segment, halfT: number,
                              kind: HitKind, rest: number): boolean {
  const c = closestOnSeg(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
  let nx = b.x - c.x, ny = b.y - c.y;
  const d = Math.hypot(nx, ny);
  const min = BALL_R + halfT;
  if (d >= min) return false;
  if (d < 1e-6) {                        // dead-centre: use the perpendicular
    const ax = s.y2 - s.y1, ay = -(s.x2 - s.x1);
    const am = Math.hypot(ax, ay) || 1;
    nx = ax / am; ny = ay / am;
  } else { nx /= d; ny /= d; }
  const pen = min - d;                   // how far it sank in this substep
  b.x = c.x + nx * min;
  b.y = c.y + ny * min;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) {
    b.vx = (b.vx - 2 * dot * nx) * rest;
    b.vy = (b.vy - 2 * dot * ny) * rest;
    b.enforceMinBounce(nx, ny);
    b.capVelocity();
    /* Only a real reflection is an impact. Resolving an overlap the ball is
       already leaving is a graze: push it out, stay quiet. */
    b.noteHit(c.x + nx * (BALL_R * 0.35), c.y + ny * (BALL_R * 0.35), nx, ny, kind);
  }
  // Re-spend the travel the push-out just undid, along the new heading.
  const sp = Math.hypot(b.vx, b.vy) || 1;
  b.x += b.vx / sp * pen;
  b.y += b.vy / sp * pen;
  return true;
}

/** Mirror off a circle, then scatter. Shared VERBATIM by red obstacles and
    breakable blocks. Returns true if contact was made. */
export function bounceOffCircle(b: Ball, o: Circle, kind: HitKind, rest: number): boolean {
  let nx = b.x - o.x, ny = b.y - o.y;
  const d = Math.hypot(nx, ny);
  const min = BALL_R + o.r;
  if (d >= min) return false;
  if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
  b.x = o.x + nx * (min + 0.5);          // nudge clear so we can't re-trigger
  b.y = o.y + ny * (min + 0.5);
  const inAng = Math.atan2(b.vy, b.vx);
  const dot = b.vx * nx + b.vy * ny;
  let bx = b.vx, by = b.vy;
  if (dot < 0) { bx = b.vx - 2 * dot * nx; by = b.vy - 2 * dot * ny; }
  let a = Math.atan2(by, bx) + (b.rng() * 2 - 1) * OB_JITTER;
  const nAng = Math.atan2(ny, nx);
  let rel = a - nAng;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));   // wrap to [-PI, PI]
  if (rel > OB_MAX_DEV) rel = OB_MAX_DEV;
  else if (rel < -OB_MAX_DEV) rel = -OB_MAX_DEV;
  a = nAng + rel;
  b.bounces.push({ inAng, nAng, outAng: a });
  // the scatter re-aims the bounce; the restitution decides what it costs
  const sp = Math.max(MIN_BOUNCE, Math.hypot(b.vx, b.vy) * rest);
  b.vx = Math.cos(a) * sp;
  b.vy = Math.sin(a) * sp;
  b.capVelocity();
  b.noteHit(o.x + nx * o.r, o.y + ny * o.r, nx, ny, kind);
  b.hits++;
  return true;
}

export function resolveCollisions(b: Ball, lv: Level, ramps: Segment[],
                                  walls: Segment[], rest: number): void {
  /* The board has no walls - the ball is free to leave by any edge, which
     ends the run. Only ramps, level walls, obstacles and breakables change
     its direction. */
  for (let i = 0; i < ramps.length; i++)
    if (segmentBounce(b, ramps[i], RAMP_HT, 'ramp', rest)) b.segHits++;
  for (let i = 0; i < walls.length; i++)
    if (segmentBounce(b, walls[i], WALL_HT, 'wall', rest)) b.segHits++;

  for (let i = 0; i < lv.obstacles.length; i++)
    bounceOffCircle(b, lv.obstacles[i], 'obstacle', rest);

  /* Breakables bounce once, exactly like an obstacle, and are then gone for
     the rest of the SESSION - free retries keep the cleared board, so the
     level is learned and then solved. A fresh entry rebuilds them. */
  for (let i = 0; i < lv.breakables.length; i++) {
    if (b.broken[i]) continue;
    if (bounceOffCircle(b, lv.breakables[i], 'breakable', rest)) {
      b.broken[i] = true;
      b.justBroke.push(i);
    }
  }
}
