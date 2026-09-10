import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';

/* A sphere, lit from the upper left. Every round thing on this board agrees
   about where the light is, which is most of what stops a canvas game looking
   like flat cut-out shapes. Red is the game's word for "this hurts" and never
   changes meaning between worlds. */
export class Obstacle extends Entity<Circle> {
  readonly kind: EntityKind = 'obstacle';

  draw({ ctx }: DrawContext): void {
    const o = this.def;
    ctx.save();
    const bloom = ctx.createRadialGradient(o.x, o.y, o.r * 0.8, o.x, o.y, o.r * 1.65);
    bloom.addColorStop(0, 'rgba(255,77,94,.32)');
    bloom.addColorStop(1, 'rgba(255,77,94,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.65, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(o.x - o.r * 0.34, o.y - o.r * 0.40, o.r * 0.05,
                                          o.x, o.y, o.r);
    body.addColorStop(0,    '#ffa7ae');
    body.addColorStop(0.42, '#ff4d5e');
    body.addColorStop(1,    '#a81c2b');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();

    // rim light along the shaded edge, then the dark inner ring it always had
    ctx.strokeStyle = 'rgba(255,190,196,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,0,10,.32)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
