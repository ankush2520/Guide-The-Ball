import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Segment } from '../levels/types';
import { WALL_HT } from '../physics/constants';

/* A level wall is structural and dead, and must not read as something the
   player placed: no bloom, a seat of shadow under it, and a lengthwise
   gradient so it looks extruded rather than drawn. */
export class Wall extends Entity<Segment> {
  readonly kind: EntityKind = 'wall';

  draw({ ctx }: DrawContext): void {
    const s = this.def;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = WALL_HT * 2 + 7; ctx.stroke();
    const g = ctx.createLinearGradient(s.x1, s.y1, s.x2, s.y2);
    g.addColorStop(0,   '#aeb9cf');
    g.addColorStop(0.5, '#7f8ba6');
    g.addColorStop(1,   '#aeb9cf');
    ctx.strokeStyle = g;
    ctx.lineWidth = WALL_HT * 2; ctx.stroke();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }
}
