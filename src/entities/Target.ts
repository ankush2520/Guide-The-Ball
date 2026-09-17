import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';
import { targetAt } from '../levels/target';
import { INK, TARGET } from '../render/palette';

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

    const ring = (r: number, fill: string, ow = 3) => {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = INK; ctx.stroke();
    };

    // soft halo, breathing
    const halo = ctx.createRadialGradient(0, 0, c.r * 0.6, 0, 0, c.r * 1.5);
    halo.addColorStop(0, `rgba(47,201,90,${0.22 + pulse * 0.14})`);
    halo.addColorStop(1, 'rgba(47,201,90,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, c.r * 1.5, 0, Math.PI * 2); ctx.fill();

    /* A bullseye: a pale outer pad, a white band, a solid green centre. Every
       band carries the ink line, so the goal is a hard-edged shape rather
       than a glow - which is what kept it readable on the dark board and
       would not on a light one. */
    ring(c.r, 'rgba(127,227,154,.55)', 3);

    // the outer ring's dashes - fixed; nothing here rotates
    ctx.save();
    ctx.strokeStyle = TARGET.dark;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.84, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    ring(c.r * 0.62, '#ffffff', 2.5);
    ring(c.r * (0.36 + pulse * 0.04), TARGET.base, 2.5);

    // breathing pulse ring: expands outward and fades, then repeats
    const bk = (clock % TARGET_PULSE_S) / TARGET_PULSE_S;
    ctx.strokeStyle = `rgba(23,150,61,${(1 - bk) * 0.6})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, c.r * (0.62 + bk * 0.7), 0, Math.PI * 2); ctx.stroke();

    // gloss on the centre
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.ellipse(-c.r * 0.12, -c.r * 0.14, c.r * 0.10, c.r * 0.06, -0.7, 0, Math.PI * 2);
    ctx.fill();

    // motes sit at FIXED angles and breathe in and out along their radius -
    // radial drift, never an orbit
    for (let i = 0; i < TARGET_MOTES; i++) {
      const a = i * (Math.PI * 2 / TARGET_MOTES) + 0.4;
      const rr = c.r * 1.18 + Math.sin(clock * 1.5 + i * 1.9) * (c.r * 0.14);
      ctx.globalAlpha = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(clock * 2 + i));
      ctx.fillStyle = TARGET.base;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
      ctx.strokeStyle = `rgba(23,150,61,${(1 - kk) * 0.9})`;
      ctx.lineWidth = 3 * (1 - kk) + 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r * (0.5 + kk * 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
