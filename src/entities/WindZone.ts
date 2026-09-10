import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { WindDef } from '../levels/types';
import { roundRect } from '../render/primitives';

/* A tinted region with streaks drifting the way it pushes. A zone whose
   effect is only discoverable by flying through it would be the same
   unfairness as an obstacle hidden on the winning line. */
export class WindZone extends Entity<WindDef> {
  readonly kind: EntityKind = 'wind';

  get isHorizontal(): boolean {
    return Math.abs(this.def.ax || 0) >= Math.abs(this.def.ay || 0);
  }

  draw({ ctx, clock }: DrawContext): void {
    const z = this.def;
    ctx.save();
    const horiz = this.isHorizontal;
    const dir = horiz ? Math.sign(z.ax || 1) : Math.sign(z.ay || 1);
    const g = horiz ? ctx.createLinearGradient(z.x, 0, z.x + z.w, 0)
                    : ctx.createLinearGradient(0, z.y, 0, z.y + z.h);
    const a0 = dir > 0 ? 0.02 : 0.13, a1 = dir > 0 ? 0.13 : 0.02;
    g.addColorStop(0, `rgba(150,200,255,${a0})`);
    g.addColorStop(1, `rgba(150,200,255,${a1})`);
    ctx.fillStyle = g;
    roundRect(ctx, z.x, z.y, z.w, z.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(160,205,255,.22)'; ctx.lineWidth = 1.5;
    roundRect(ctx, z.x, z.y, z.w, z.h, 10); ctx.stroke();

    // streaks: seeded off the zone's own position, so they never jitter
    ctx.lineCap = 'round';
    const n = 9, sp = 70;
    for (let i = 0; i < n; i++) {
      const seed = (z.x * 13 + z.y * 7 + i * 91) % 997;
      const off = seed / 997;
      const len = 16 + (seed % 13);
      let px: number, py: number;
      if (horiz) {
        const t = ((clock * sp * dir) / z.w + off) % 1;
        px = z.x + ((t + 1) % 1) * z.w;
        py = z.y + 8 + off * (z.h - 16);
      } else {
        const t = ((clock * sp * dir) / z.h + off) % 1;
        py = z.y + ((t + 1) % 1) * z.h;
        px = z.x + 8 + off * (z.w - 16);
      }
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#cfe6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - (horiz ? len * dir : 0), py - (horiz ? 0 : len * dir));
      ctx.stroke();
    }
    ctx.restore();
  }
}
