import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { PortalDef, PortalEnd } from '../levels/types';

/* A pair of rings in the pair's own hue, so which goes where is readable at
   a glance on a board holding more than one pair. */
const PORTAL_HUES = [285, 190, 45, 330];

export class Portal extends Entity<PortalDef> {
  readonly kind: EntityKind = 'portal';

  get hue(): number { return PORTAL_HUES[this.index % PORTAL_HUES.length]; }

  private end(ctx: CanvasRenderingContext2D, e: PortalEnd, hue: number, spin: number): void {
    ctx.save();
    ctx.translate(e.x, e.y);
    const bloom = ctx.createRadialGradient(0, 0, e.r * 0.2, 0, 0, e.r * 1.7);
    bloom.addColorStop(0, `hsla(${hue},100%,72%,.30)`);
    bloom.addColorStop(1, `hsla(${hue},100%,72%,0)`);
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.7, 0, Math.PI * 2); ctx.fill();

    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r);
    well.addColorStop(0,   `hsla(${hue},100%,88%,.55)`);
    well.addColorStop(0.6, `hsla(${hue},90%,60%,.18)`);
    well.addColorStop(1,   `hsla(${hue},80%,40%,.05)`);
    ctx.fillStyle = well;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(spin);
    ctx.strokeStyle = `hsla(${hue},100%,80%,.9)`;
    ctx.lineWidth = 2.5; ctx.setLineDash([e.r * 0.7, e.r * 0.5]);
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-spin * 2.2);
    ctx.strokeStyle = `hsla(${hue},100%,90%,.5)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // an exit that states a facing shows it: you do not leave the way you came
    if (e.facing !== undefined && e.facing !== null) {
      const a = e.facing * Math.PI / 180;
      ctx.save();
      ctx.translate(e.x + Math.cos(a) * e.r * 1.15, e.y + Math.sin(a) * e.r * 1.15);
      ctx.rotate(a);
      ctx.fillStyle = `hsla(${hue},100%,85%,.95)`;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  draw({ ctx, clock }: DrawContext): void {
    const spin = clock * 0.7;
    // the two ends counter-rotate, which reads as one linked pair
    this.end(ctx, this.def.a, this.hue,  spin);
    this.end(ctx, this.def.b, this.hue, -spin);
  }
}
