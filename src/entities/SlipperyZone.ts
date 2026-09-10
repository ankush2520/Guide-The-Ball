import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { SlipperyDef } from '../levels/types';
import { roundRect } from '../render/primitives';

/* A pale frozen sheet with a slow sheen crossing it. Bounces inside keep
   nearly all their speed (SLIP_REST), so the surface has to look slick
   before the ball proves it. */
export class SlipperyZone extends Entity<SlipperyDef> {
  readonly kind: EntityKind = 'slippery';

  draw({ ctx, clock }: DrawContext): void {
    const z = this.def;
    ctx.save();
    const g = ctx.createLinearGradient(z.x, z.y, z.x, z.y + z.h);
    g.addColorStop(0, 'rgba(190,235,255,.16)');
    g.addColorStop(1, 'rgba(120,190,230,.07)');
    ctx.fillStyle = g;
    roundRect(ctx, z.x, z.y, z.w, z.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(200,240,255,.34)'; ctx.lineWidth = 1.5;
    roundRect(ctx, z.x, z.y, z.w, z.h, 8); ctx.stroke();

    ctx.save();
    roundRect(ctx, z.x, z.y, z.w, z.h, 8); ctx.clip();
    const k = (clock * 0.22 + (z.x + z.y) / 900) % 1;
    const sx = z.x - z.w * 0.5 + k * z.w * 2;
    const sh = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
    sh.addColorStop(0,   'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,255,255,.16)');
    sh.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.restore();
    ctx.restore();
  }
}
