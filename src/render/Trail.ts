/* ============================================================
   BALL TRAIL
   A short history of painted positions, drawn as a tapering
   comet. It is the only thing on the board that reports speed -
   the ball itself is a 9px circle and looks identical at every
   velocity, which is what made the fall read as floaty.
   ============================================================ */
import { BALL_R } from '../physics/constants';

const TRAIL_MAX = 16;

export class Trail {
  private pts: { x: number; y: number }[] = [];   // oldest first, board space

  push(x: number, y: number): void {
    this.pts.push({ x, y });
    if (this.pts.length > TRAIL_MAX) this.pts.shift();
  }

  clear(): void { this.pts.length = 0; }

  get length(): number { return this.pts.length; }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffd479';
    for (let i = 1; i < this.pts.length; i++) {
      const k = i / this.pts.length;         // 0 at the tail, 1 at the ball
      ctx.globalAlpha = k * k * 0.5;
      ctx.lineWidth = BALL_R * 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(this.pts[i - 1].x, this.pts[i - 1].y);
      ctx.lineTo(this.pts[i].x, this.pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
