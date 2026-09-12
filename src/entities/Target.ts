import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';
import { targetAt } from '../levels/target';

/* A bullseye portal. Concentric rings, a pulsing core and a few drifting
   motes, so it reads as "land here" and stays alive even before the ball is
   dropped.

   Note what does NOT happen here: nothing rotates. The rings breathe along
   their radius only. An orbiting element implies the target SPINS, which it
   never does - on a Needlecrest board it slides, and those two would fight.

   Where it is drawn is not its authored centre. A patrolling target is
   painted at targetAt(simT), the same function and the same clock the win
   check uses, so what the player sees the ball miss is what the simulation
   says it missed. simT is fractional - steps plus the interpolation alpha -
   which is what keeps the slide smooth between physics steps rather than
   stepping 60 times a second, the same trick the ball's own draw uses. */
const TARGET_PULSE_S = 1.9;   // seconds per outward pulse ring
const TARGET_MOTES = 6;       // motes at fixed angles, breathing in and out

export class Target extends Entity<Circle> {
  readonly kind: EntityKind = 'target';

  draw({ ctx, clock, simT, level }: DrawContext): void {
    const c = targetAt(level, simT);
    const pulse = 0.5 + 0.5 * Math.sin(clock * 2.3);

    ctx.save();
    ctx.translate(c.x, c.y);

    // soft halo
    const halo = ctx.createRadialGradient(0, 0, c.r * 0.15, 0, 0, c.r * 1.55);
    halo.addColorStop(0,    `rgba(47,217,122,${0.30 + pulse * 0.16})`);
    halo.addColorStop(0.55, 'rgba(47,217,122,0.10)');
    halo.addColorStop(1,    'rgba(47,217,122,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, c.r * 1.55, 0, Math.PI * 2); ctx.fill();

    // outer ring - dashed and fixed; nothing here rotates
    ctx.save();
    ctx.strokeStyle = 'rgba(47,217,122,.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([11, 8]);
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // breathing pulse ring: expands outward and fades, then repeats
    const bk = (clock % TARGET_PULSE_S) / TARGET_PULSE_S;
    ctx.strokeStyle = `rgba(120,255,180,${(1 - bk) * 0.5})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, c.r * (0.55 + bk * 0.75), 0, Math.PI * 2); ctx.stroke();

    // middle ring
    ctx.strokeStyle = 'rgba(47,217,122,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.66, 0, Math.PI * 2); ctx.stroke();

    // inner ring + pulsing core, as a gradient so the mouth looks like a well
    // rather than a sticker
    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, c.r * 0.66);
    well.addColorStop(0,    'rgba(47,217,122,.34)');
    well.addColorStop(0.65, 'rgba(47,217,122,.13)');
    well.addColorStop(1,    'rgba(20,120,70,.05)');
    ctx.fillStyle = well;
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.66, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(47,217,122,.9)';
    ctx.shadowBlur = 10 + pulse * 14;
    ctx.fillStyle = `rgba(120,255,180,${0.75 + pulse * 0.25})`;
    ctx.beginPath(); ctx.arc(0, 0, c.r * (0.20 + pulse * 0.05), 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // motes sit at FIXED angles and breathe in and out along their radius -
    // radial drift, never an orbit
    for (let i = 0; i < TARGET_MOTES; i++) {
      const a = i * (Math.PI * 2 / TARGET_MOTES) + 0.4;
      const rr = c.r * 1.18 + Math.sin(clock * 1.5 + i * 1.9) * (c.r * 0.14);
      ctx.fillStyle = `rgba(150,255,195,${0.28 + 0.34 * (0.5 + 0.5 * Math.sin(clock * 2 + i))})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** Expanding shockwave rings when the ball is swallowed. Drawn straight
      after the target, so the rings sit over the well and under everything
      the board puts on top of it. */
  drawCapture(ctx: CanvasRenderingContext2D, k: number, cx: number, cy: number): void {
    const c = this.def;
    for (let i = 0; i < 3; i++) {
      const kk = k - i * 0.16;
      if (kk <= 0 || kk >= 1) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(120,255,180,${(1 - kk) * 0.85})`;
      ctx.lineWidth = 3 * (1 - kk) + 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r * (0.5 + kk * 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
