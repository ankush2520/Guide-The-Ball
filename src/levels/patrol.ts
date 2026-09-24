/* ============================================================
   THE MOVING TARGET - its rules

   A target that patrols horizontally between two waypoints, and
   everything the rest of the game needs to know about one: where
   its path is, where a ramp may NOT go because of it, and how it
   is drawn. Any country can use it - a level opts in with a
   `targetMove` block and nothing else changes.

   WHY THE LANE EXISTS. The mechanic was cut once because a
   patrol could slide through a ramp the player had just drawn:
   the target has no collision with ramps, so the two simply
   overlapped, and an ordinary pass-through read as a broken
   collision. This time the patrol OWNS its path. The lane is the
   capsule the target's disc sweeps between its waypoints, grown
   by a ramp's half-thickness and a visible gap, and it is carved
   OUT of the ramp-placement region:

     ramp-placement region = the play area - every patrol lane

   So the path can never enter the region by construction, and
   the rule is enforced at every door a ramp comes through - the
   draw, the end-drag, the slide (LevelManager), the draft preview
   (Renderer), and the headless simulate every solver uses
   (debugHook), so a level can never be PROVED with a layout the
   player is not allowed to build.

   HORIZONTAL ONLY, and OPEN only. A patrol in y would sweep a
   lane down through the space the route needs, and walls are
   built from the target's centre, so a walled target would drag
   real bars along with it. validatePatrol() rejects both.

   The clock is not here: targetAt() in target.ts is the
   one function that says where the target IS at a given step,
   and the win check, the renderer and the solver all read it.
   The entity that draws a patrol is entities/MovingTarget.ts.
   ============================================================ */
import type { RawLevel, Segment } from './types';
import { RAMP_HT, W } from '../physics/constants';
import { closestOnSeg } from '../physics/math';

/** Clear air between a ramp's edge and the target's rim at its closest pass.
    Enough that the two can never be drawn touching, small enough that the
    lane does not eat the board around it. */
export const LANE_GAP = 6;

type PatrolLevel = Pick<RawLevel, 'target' | 'targetMove'>;

/** The patrol's centre line: a horizontal segment between the two
    waypoints. Null when the level's target stands still. */
export function patrolPath(lv: PatrolLevel): Segment | null {
  const mv = lv.targetMove;
  if (!mv || !(mv.period > 0)) return null;
  return { x1: Math.min(mv.x0, mv.x1), y1: lv.target.y,
           x2: Math.max(mv.x0, mv.x1), y2: lv.target.y };
}

/** The lane: every point within `radius` of the patrol's centre line. A
    capsule rather than a rectangle because that is exactly the shape the
    target's disc sweeps, so the no-draw zone is no bigger than it must be. */
export interface Lane { path: Segment; radius: number; }

export function patrolLane(lv: PatrolLevel): Lane | null {
  const path = patrolPath(lv);
  if (!path) return null;
  return { path, radius: lv.target.r + RAMP_HT + LANE_GAP };
}

/** Whether a ramp's centre line stays clear of the lane. Measured centre line
    to centre line, and the lane's radius already carries the ramp's own
    half-thickness, so "clear" means the drawn ramp and the drawn target can
    never overlap at any point of the patrol. */
export function rampAllowed(lv: PatrolLevel, seg: Segment): boolean {
  const lane = patrolLane(lv);
  return !lane || segSegDist(seg, lane.path) >= lane.radius;
}

/** Every ramp in a layout clear of the lane. */
export function layoutAllowed(lv: PatrolLevel, ramps: readonly Segment[]): boolean {
  for (const s of ramps) if (!rampAllowed(lv, s)) return false;
  return true;
}

/** Authoring rules for a patrol, or null if the level is fine. Thrown by
    initLevel(): the data is static, so a bad patrol is caught the moment it
    is written rather than shipped as a board that misbehaves. */
export function validatePatrol(lv: Pick<RawLevel, 'id' | 'target' | 'targetMove' | 'targetType'>): string | null {
  const mv = lv.targetMove;
  if (!mv) return null;
  if (lv.targetType !== 'OPEN')
    return `level ${lv.id}: a moving target must be OPEN, not ${lv.targetType} - ` +
           `walls are built from the target centre and would move with it`;
  if (!(mv.period > 0)) return `level ${lv.id}: a patrol needs a positive period`;
  if (mv.x0 === mv.x1) return `level ${lv.id}: a patrol needs two different waypoints`;
  const lo = Math.min(mv.x0, mv.x1), hi = Math.max(mv.x0, mv.x1);
  if (lo - lv.target.r < 0 || hi + lv.target.r > W)
    return `level ${lv.id}: the patrol carries the target off the board`;
  return null;
}

/* Shortest distance between two segments: zero if they cross, otherwise the
   nearest endpoint-to-segment distance of the four. */
function segSegDist(a: Segment, b: Segment): number {
  if (crosses(a, b)) return 0;
  return Math.min(ptSeg(a.x1, a.y1, b), ptSeg(a.x2, a.y2, b),
                  ptSeg(b.x1, b.y1, a), ptSeg(b.x2, b.y2, a));
}

function ptSeg(x: number, y: number, s: Segment): number {
  const c = closestOnSeg(x, y, s.x1, s.y1, s.x2, s.y2);
  return Math.hypot(x - c.x, y - c.y);
}

function crosses(a: Segment, b: Segment): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const d1 = o(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1), d2 = o(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  const d3 = o(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1), d4 = o(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
