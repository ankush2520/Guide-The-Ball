import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BlackHoleDef } from '../levels/types';

/* ============================================================
   THE BLACK HOLE - Outer Space's hazard

   Its PULL reaches as far as the faint dashed ring, so the
   player can see where the ball will start to bend; a glowing
   accretion disk turns round a black core, and specks of light
   spiral in and vanish. Touch the core and the drop is over
   (MatterEngine: 'swallowed').
   ============================================================ */
export class BlackHole extends Entity<BlackHoleDef> {
  readonly kind: EntityKind = 'blackhole';

  draw({ ctx, clock }: DrawContext): void {
    const { x, y, r, reach } = this.def;
    ctx.save();

    // how far the pull reaches: a faint glow and a dashed ring, slowly turning
    const halo = ctx.createRadialGradient(x, y, r, x, y, reach);
    halo.addColorStop(0, 'rgba(167,139,250,0.28)');
    halo.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, reach, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,185,255,0.45)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    ctx.lineDashOffset = -clock * 12;
    ctx.beginPath(); ctx.arc(x, y, reach, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // specks of light spiralling in
    for (let i = 0; i < 10; i++) {
      const t = (clock * 0.35 + i / 10) % 1;
      const a = i * 2.1 + t * 5, rr = r + (reach - r) * (1 - t);
      ctx.fillStyle = `rgba(255,230,200,${0.85 * t})`;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.4 + t, 0, Math.PI * 2); ctx.fill();
    }

    // the accretion disk: a hot ring turning round the core
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(clock * 1.4);
    const disk = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 2.1);
    disk.addColorStop(0, 'rgba(255,200,120,0.95)');
    disk.addColorStop(0.45, 'rgba(255,110,150,0.75)');
    disk.addColorStop(1, 'rgba(140,90,255,0)');
    ctx.fillStyle = disk;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 2.1, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,220,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.45, r * 1.1, 0, 0.2, Math.PI * 1.3); ctx.stroke();
    ctx.restore();

    // the core: pure black with a thin bright rim
    ctx.fillStyle = '#05030f';
    ctx.strokeStyle = 'rgba(255,220,180,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
