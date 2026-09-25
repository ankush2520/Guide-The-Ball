import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { OvalDef } from '../levels/types';
import { WALL_HT } from '../physics/constants';
import { INK, WALL } from '../render/palette';

/* A big solid oval: level structure, so it wears the WALL's stone rather
   than the obstacle's red - it does not scatter the ball, it is simply in
   the way. Drawn grown by the wall half-thickness, because that is the
   surface the ball actually meets. */
export class Oval extends Entity<OvalDef> {
  readonly kind: EntityKind = 'oval';

  draw({ ctx }: DrawContext): void {
    const o = this.def;
    const a = (o.angle ?? 0) * Math.PI / 180;
    const rx = o.rx + WALL_HT, ry = o.ry + WALL_HT;
    ctx.save();
    // the hard shadow seat, offset down like every other solid on the board
    ctx.fillStyle = 'rgba(42,35,80,.22)';
    ctx.beginPath(); ctx.ellipse(o.x, o.y + 5, rx + 2, ry + 2, a, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createLinearGradient(o.x, o.y - ry, o.x, o.y + ry);
    body.addColorStop(0, WALL.light);
    body.addColorStop(1, WALL.dark);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, rx, ry, a, 0, Math.PI * 2); ctx.fill();

    // an inner rim line, so it reads as a slab and not a hole in the board
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, Math.max(1, rx - 9), Math.max(1, ry - 9), a, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, rx, ry, a, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
