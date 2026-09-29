import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { QuicksandDef } from '../levels/types';
import { INK } from '../render/palette';

/* ============================================================
   QUICKSAND - Ancient Egypt's hazard

   A round pit of sinking sand: darker toward its middle, with a
   slow swirl turning in it and grains trickling inward, so it
   reads as something that SUCKS DOWN rather than a patch of
   floor. Inside it the ball loses most of its speed each step
   and sinks (MatterEngine, QUICKSAND_KEEP). It never ends a run.
   ============================================================ */
export class Quicksand extends Entity<QuicksandDef> {
  readonly kind: EntityKind = 'quicksand';

  draw({ ctx, clock }: DrawContext): void {
    const { x, y, r } = this.def;
    ctx.save();

    // the pit: pale sand at the rim, sinking to a dark centre
    const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
    g.addColorStop(0, '#8a5a2b');
    g.addColorStop(0.45, '#c08a4c');
    g.addColorStop(0.85, '#e7c080');
    g.addColorStop(1, '#f1d39c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // a slow swirl turning inward
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(110,65,25,0.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const spin = clock * 0.8;
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const f = k / 24, a = spin + arm * (Math.PI * 2 / 3) + f * 4.2, rr = r * (0.95 - f * 0.85);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // grains drifting in toward the middle
    ctx.fillStyle = 'rgba(255,240,205,0.8)';
    for (let i = 0; i < 7; i++) {
      const t = (clock * 0.25 + i / 7) % 1;
      const a = i * 2.3 + t * 3, rr = r * 0.9 * (1 - t);
      ctx.globalAlpha = 1 - t;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // a soft ink rim, dashed, so it reads as a zone rather than a solid
    ctx.strokeStyle = INK; ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
