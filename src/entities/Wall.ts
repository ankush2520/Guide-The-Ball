import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Segment } from '../levels/types';
import { WALL_HT } from '../physics/constants';
import { INK, WALL } from '../render/palette';

/* A level wall is structural and dead, and must not read as something the
   player placed: flat stone grey, no gloss streak, a hard shadow seat under
   it, and a darker inner line so it reads as a slab rather than a bar. */
export class Wall extends Entity<Segment> {
  readonly kind: EntityKind = 'wall';

  draw({ ctx }: DrawContext): void {
    const s = this.def;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    const ow = 3;
    ctx.save();
    ctx.translate(0, 4);
    ctx.strokeStyle = 'rgba(42,35,80,.22)';
    ctx.lineWidth = WALL_HT * 2 + ow * 2; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = WALL_HT * 2 + ow * 2; ctx.stroke();
    ctx.strokeStyle = WALL.light;
    ctx.lineWidth = WALL_HT * 2; ctx.stroke();
    ctx.strokeStyle = WALL.dark;
    ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }
}
