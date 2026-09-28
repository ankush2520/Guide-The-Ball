/* ============================================================
   THE BOUNCY RAMP

   A ramp the player drew with a Bouncy on it - the item the
   code still calls a `spring` (Segment.spring): the physics is
   unchanged, the ramp throws the ball SPRING_GAIN times harder.

   What changed is how it LOOKS, because the old coil fitted on
   top of a blue ramp had to be explained. This is a TRAMPOLINE,
   which nobody has to be told about: the whole ramp becomes an
   orange rubber mat, with two little legs and coil springs under
   it. Orange, not the goal's green, the obstacle's red or the
   plain ramp's blue - so which of your ramps is the bouncy one
   is never a question.

   When it throws the ball the mat SQUASHES down onto its coils
   and springs back (`squash`, 1 at the hit easing to 0), which
   is the "boing" the sound plays over.
   ============================================================ */
import type { Segment } from '../levels/types';
import { RAMP_HT } from '../physics/constants';
import { INK } from './palette';

/** The mat's rubber, light through dark. */
export const SPRING = { light: '#ffb14a', base: '#f07a12', dark: '#b8430a' };

/**
 * Paint the bouncy ramp over `seg`. `clock` is the render clock in seconds;
 * `squash` (0..1) presses the mat down onto its coils just after a bounce.
 */
export function drawSpring(ctx: CanvasRenderingContext2D, seg: Segment,
                           clock: number, squash = 0): void {
  const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  // the face pointing DOWN-board: the legs and coils hang off it
  let nx = -uy, ny = ux;
  if (ny < 0) { nx = -nx; ny = -ny; }

  const sq = Math.max(0, Math.min(1, squash));
  const press = sq * 5;                        // how far the mat dips
  const legLen = 11 - sq * 4;
  const mx = nx * press, my = ny * press;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /* LEGS, near each end */
  for (const f of [0.14, 0.86]) {
    const bx = seg.x1 + dx * f + nx * RAMP_HT, by = seg.y1 + dy * f + ny * RAMP_HT;
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(bx + mx, by + my);
    ctx.lineTo(bx + nx * (legLen + press) - ux * 3 * (f < 0.5 ? 1 : -1),
               by + ny * (legLen + press) - uy * 3 * (f < 0.5 ? 1 : -1));
    ctx.stroke();
  }

  /* COILS under the mat: two short zig-zags, squeezed flat on a bounce */
  const coilH = 8 - sq * 5;
  for (const f of [0.34, 0.66]) {
    const cx = seg.x1 + dx * f, cy = seg.y1 + dy * f;
    const span = Math.min(18, len * 0.14);
    ctx.strokeStyle = '#8a8fb0'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const along = -span / 2 + span * (i / 4);
      const down = RAMP_HT + press + (i % 2 ? coilH : 0);
      const px = cx + ux * along + nx * down, py = cy + uy * along + ny * down;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  /* THE MAT: the whole ramp, in rubber - drawn over the blue */
  const x1 = seg.x1 + mx, y1 = seg.y1 + my, x2 = seg.x2 + mx, y2 = seg.y2 + my;
  ctx.strokeStyle = 'rgba(42,35,80,.22)'; ctx.lineWidth = RAMP_HT * 2 + 6;
  ctx.beginPath(); ctx.moveTo(x1, y1 + 3); ctx.lineTo(x2, y2 + 3); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = RAMP_HT * 2 + 5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = SPRING.base; ctx.lineWidth = RAMP_HT * 2;
  ctx.stroke();
  // the lit top edge of the rubber
  ctx.strokeStyle = SPRING.light; ctx.lineWidth = RAMP_HT * 0.8;
  ctx.beginPath();
  ctx.moveTo(x1 - nx * RAMP_HT * 0.45, y1 - ny * RAMP_HT * 0.45);
  ctx.lineTo(x2 - nx * RAMP_HT * 0.45, y2 - ny * RAMP_HT * 0.45);
  ctx.stroke();
  // white stitching dashes that drift slowly, so it reads as alive
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
  ctx.setLineDash([6, 7]);
  ctx.lineDashOffset = -clock * 6;
  ctx.beginPath(); ctx.moveTo(x1 + ux * 6, y1 + uy * 6); ctx.lineTo(x2 - ux * 6, y2 - uy * 6); ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}
