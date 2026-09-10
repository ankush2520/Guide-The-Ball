import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BreakableDef } from '../levels/types';

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
    const bloom = ctx.createRadialGradient(o.x, o.y, o.r * 0.8, o.x, o.y, o.r * 1.5);
    bloom.addColorStop(0, 'rgba(255,168,96,.22)');
    bloom.addColorStop(1, 'rgba(255,168,96,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.5, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(o.x - o.r * 0.34, o.y - o.r * 0.4, o.r * 0.05,
                                          o.x, o.y, o.r);
    body.addColorStop(0,    '#ffd7a8');
    body.addColorStop(0.45, '#e08a3c');
    body.addColorStop(1,    '#8c4a18');
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
    ctx.strokeStyle = 'rgba(255,220,180,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
