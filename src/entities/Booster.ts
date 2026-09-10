import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BoosterDef } from '../levels/types';

/* A green-cyan disc with a chevron aimed exactly where it fires. The chevron
   IS the promise: the game is plan-first, so the heading you will leave on
   has to be readable before the ball ever arrives. */
export class Booster extends Entity<BoosterDef> {
  readonly kind: EntityKind = 'booster';

  /** The heading it fires along, in radians. */
  get angleRad(): number { return this.def.angle * Math.PI / 180; }

  draw({ ctx, clock }: DrawContext): void {
    const z = this.def;
    const a = this.angleRad;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 3.4 + z.x * 0.05);
    ctx.save();
    const bloom = ctx.createRadialGradient(z.x, z.y, z.r * 0.3, z.x, z.y, z.r * 1.7);
    bloom.addColorStop(0, `rgba(64,232,190,${0.28 + pulse * 0.12})`);
    bloom.addColorStop(1, 'rgba(64,232,190,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 1.7, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    body.addColorStop(0, 'rgba(150,255,225,.30)');
    body.addColorStop(1, 'rgba(40,190,160,.10)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(90,255,215,.85)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -(clock * 26) % 13;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.translate(z.x, z.y); ctx.rotate(a);
    ctx.strokeStyle = '#dfffe8'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const L = z.r * 0.62;
    for (let i = 0; i < 2; i++) {
      const ox = -L * 0.35 + i * L * 0.62 + pulse * 3;
      ctx.beginPath();
      ctx.moveTo(ox - L * 0.32, -L * 0.42);
      ctx.lineTo(ox + L * 0.20, 0);
      ctx.lineTo(ox - L * 0.32, L * 0.42);
      ctx.globalAlpha = i ? 0.95 : 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}
