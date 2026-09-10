import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { StarDef } from '../levels/types';
import { STAR_R } from '../physics/constants';

/* Optional gold pickups. Stars are SCENERY to the physics - they never touch
   the trajectory - so collecting them is a pure side-objective. Dimmed to an
   outline once taken, so the board still shows what is left to find. */
export class StarPickup extends Entity<StarDef> {
  readonly kind: EntityKind = 'star';

  isTaken(g: DrawContext): boolean { return !!g.got[this.index]; }

  draw(g: DrawContext): void {
    const { ctx, clock } = g;
    const st = this.def;
    const taken = this.isTaken(g);
    const tw = 0.5 + 0.5 * Math.sin(clock * 3 + st.x * 0.07 + st.y * 0.03);
    ctx.save();
    ctx.translate(st.x, st.y);
    if (!taken) {
      const bloom = ctx.createRadialGradient(0, 0, 1, 0, 0, STAR_R * 1.8);
      bloom.addColorStop(0, `rgba(255,214,120,${0.34 + tw * 0.18})`);
      bloom.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(0, 0, STAR_R * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(clock * 0.6);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? STAR_R * 0.42 : STAR_R * (taken ? 0.85 : 1);
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    if (taken) {
      ctx.strokeStyle = 'rgba(255,214,120,.32)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      const grad = ctx.createLinearGradient(0, -STAR_R, 0, STAR_R);
      grad.addColorStop(0, '#fff6d2'); grad.addColorStop(1, '#ffc451');
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
}
