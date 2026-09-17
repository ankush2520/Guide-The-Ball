import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';
import { INK, OBSTACLE, outlineFor } from '../render/palette';

/* A sphere, lit from the upper left. Every round thing on this board agrees
   about where the light is, which is most of what stops a canvas game looking
   like flat cut-out shapes. Red is the game's word for "this hurts" and never
   changes meaning between countries. */
export class Obstacle extends Entity<Circle> {
  readonly kind: EntityKind = 'obstacle';

  draw({ ctx }: DrawContext): void {
    const o = this.def;
    ctx.save();
    const ow = outlineFor(o.r);
    // a hard shadow seat, offset down - the sticker lifted off the board
    ctx.fillStyle = 'rgba(42,35,80,.20)';
    ctx.beginPath(); ctx.arc(o.x, o.y + 5, o.r + ow / 2, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(o.x - o.r * 0.34, o.y - o.r * 0.40, o.r * 0.05,
                                          o.x, o.y, o.r);
    body.addColorStop(0,    OBSTACLE.light);
    body.addColorStop(0.45, OBSTACLE.base);
    body.addColorStop(1,    OBSTACLE.dark);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();

    // the dark inner ring it always had, then the ink outline over the edge
    ctx.strokeStyle = 'rgba(90,0,20,.28)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = ow;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();

    // the toy-plastic gloss: a hard white highlight, high and left
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.ellipse(o.x - o.r * 0.38, o.y - o.r * 0.42, o.r * 0.24, o.r * 0.14,
                -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
