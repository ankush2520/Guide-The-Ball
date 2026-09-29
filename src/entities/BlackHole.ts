import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BlackHoleDef } from '../levels/types';
import { holeState } from '../levels/blackhole';

/* ============================================================
   THE BLACK HOLE - Outer Space's hazard, and a TIMING puzzle

   Drawn off simT, the level clock the physics switches it on,
   so what the player sees is exactly what the ball meets:

     OFF   a dim core and a slow, quiet swirl. A thin ring round
           the core fills up like a clock toward the next pull.
     WARN  the rim flickers and the outer ring brightens.
     ON    bright ripples roll INWARD from the edge of its reach,
           over and over, the disk spins fast - that whole
           rippling circle is where the ball gets pulled in.

   The black core swallows the ball in any phase.
   ============================================================ */
export class BlackHole extends Entity<BlackHoleDef> {
  readonly kind: EntityKind = 'blackhole';

  draw({ ctx, clock, simT }: DrawContext): void {
    const { x, y, r, reach } = this.def;
    const st = holeState(this.def, simT);
    const live = st.on ? 1 : st.warn * 0.5;
    ctx.save();

    // the reach: faint when OFF, glowing when ON
    const halo = ctx.createRadialGradient(x, y, r, x, y, reach);
    halo.addColorStop(0, `rgba(167,139,250,${0.08 + 0.3 * live})`);
    halo.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, reach, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(200,185,255,${0.22 + 0.5 * live})`;
    ctx.lineWidth = st.on ? 2 : 1.2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(x, y, reach, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // ON: ripples rolling inward from the edge of the reach to the core
    if (st.on) {
      for (let i = 0; i < 4; i++) {
        const f = (simT / 34 + i / 4) % 1;                  // 0 at the edge .. 1 at the core
        const rr = reach - (reach - r) * f;
        ctx.strokeStyle = `rgba(210,190,255,${0.75 * Math.sin(f * Math.PI)})`;
        ctx.lineWidth = 2 + 2 * f;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // the accretion disk: lazy when OFF, racing when ON
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(clock * (0.5 + 3 * live));
    const disk = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 2.1);
    disk.addColorStop(0, `rgba(255,200,120,${0.4 + 0.55 * live})`);
    disk.addColorStop(0.45, `rgba(255,110,150,${0.3 + 0.45 * live})`);
    disk.addColorStop(1, 'rgba(140,90,255,0)');
    ctx.fillStyle = disk;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 2.1, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,240,220,${0.35 + 0.5 * live})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.45, r * 1.1, 0, 0.2, Math.PI * 1.3); ctx.stroke();
    ctx.restore();

    // OFF: the countdown - a thin ring round the core filling toward the pull
    if (!st.on) {
      ctx.strokeStyle = st.warn > 0 ? 'rgba(255,120,150,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.charge);
      ctx.stroke();
    }

    // the core, always deadly; its rim flickers in the warning
    const flick = st.warn > 0 ? 0.5 + 0.5 * Math.sin(simT * 1.4) : 1;
    ctx.fillStyle = '#05030f';
    ctx.strokeStyle = st.on ? 'rgba(255,220,180,0.95)' : `rgba(255,170,190,${0.45 + 0.5 * st.warn * flick})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
