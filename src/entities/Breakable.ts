import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BreakableDef } from '../levels/types';
import { INK, outlineFor } from '../render/palette';

/* An obstacle that is visibly cracked, so it never reads as a permanent one.
   Different hue AND different surface, not colour alone - the board has to be
   readable to a player who cannot tell the two reds apart. */
export class Breakable extends Entity<BreakableDef> {
  readonly kind: EntityKind = 'breakable';

  /** Gone for the rest of the session once struck. */
  isGone(g: DrawContext): boolean { return !!g.broken[this.index]; }

  draw(g: DrawContext): void {
    if (this.isGone(g)) return;
    const { ctx } = g;
    const o = this.def;
    ctx.save();
    const ow = outlineFor(o.r);
    // the same hard seat shadow the obstacle sits on
    ctx.fillStyle = 'rgba(42,35,80,.20)';
    ctx.beginPath(); ctx.arc(o.x, o.y + 5, o.r + ow / 2, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(o.x - o.r * 0.34, o.y - o.r * 0.4, o.r * 0.05,
                                          o.x, o.y, o.r);
    body.addColorStop(0,    '#ffd29a');
    body.addColorStop(0.45, '#f08a2c');
    body.addColorStop(1,    '#a8520f');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();

    // fracture lines - fixed per position, so they never crawl
    ctx.strokeStyle = 'rgba(60,26,4,.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const seed = (o.x * 7 + o.y * 13) % 360;
    for (let i = 0; i < 3; i++) {
      const a = (seed + i * 118) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a) * o.r * 0.15, o.y + Math.sin(a) * o.r * 0.15);
      ctx.lineTo(o.x + Math.cos(a + 0.25) * o.r * 0.92, o.y + Math.sin(a + 0.25) * o.r * 0.92);
      ctx.stroke();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = ow;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
