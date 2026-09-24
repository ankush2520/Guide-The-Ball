/* ============================================================
   THE MOVING TARGET - the entity

   A patrolling target, drawn. The rules that make it safe to use
   in any country - the lane, and the ramp-placement region it is
   carved out of - live in levels/patrol.ts, next to targetAt(),
   and are re-exported here so one import brings the whole
   mechanic.
   ============================================================ */
import { Target } from './Target';
import type { DrawContext } from './Entity';
import { INK, TARGET } from '../render/palette';
import { patrolLane, type Lane } from '../levels/patrol';

/* ============================================================
   THE ENTITY

   The ordinary bullseye, painted where targetAt() says it is,
   over a TRACK: the lane itself, drawn as a pale rounded rail
   with its two waypoints marked. The track is the rule made
   visible - the player can see where the target will go and,
   with it, where a ramp cannot - so the refusal to place one
   there never arrives as a surprise.
   ============================================================ */
export class MovingTarget extends Target {
  draw(g: DrawContext): void {
    const lane = patrolLane(g.level);
    if (lane) drawTrack(g.ctx, lane);
    super.draw(g);
  }
}

function drawTrack(ctx: CanvasRenderingContext2D, lane: Lane): void {
  const { path, radius } = lane;
  ctx.save();
  // the lane: a soft capsule, so the no-draw zone has a visible edge
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(47,201,90,0.10)';
  ctx.lineWidth = radius * 2;
  ctx.beginPath(); ctx.moveTo(path.x1, path.y1); ctx.lineTo(path.x2, path.y2); ctx.stroke();
  // its outline, dashed, so it reads as a boundary and not as a solid
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(23,150,61,0.45)';
  ctx.beginPath();
  ctx.moveTo(path.x1, path.y1 - radius); ctx.lineTo(path.x2, path.y2 - radius);
  ctx.arc(path.x2, path.y2, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(path.x1, path.y1 + radius);
  ctx.arc(path.x1, path.y1, radius, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.setLineDash([]);
  // the rail the centre rides on, and a tick at each waypoint
  ctx.lineWidth = 3;
  ctx.strokeStyle = TARGET.dark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(path.x1, path.y1); ctx.lineTo(path.x2, path.y2); ctx.stroke();
  for (const x of [path.x1, path.x2]) {
    ctx.beginPath(); ctx.arc(x, path.y1, 4, 0, Math.PI * 2);
    ctx.fillStyle = TARGET.base; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
}

export * from '../levels/patrol';
