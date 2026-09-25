import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';
import { targetAt } from '../levels/target';
import { INK, TARGET } from '../render/palette';
import { TARGET_GLOW } from '../render/glow';
import { TIE, WRAP } from './MysteryBox';

/* A bullseye well. Concentric rings, a pulsing core and a few drifting
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

  draw({ ctx, clock, simT, level, giftTaken }: DrawContext): void {
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
    const halo = ctx.createRadialGradient(0, 0, c.r * 0.6, 0, 0, c.r * TARGET_GLOW);
    halo.addColorStop(0, `rgba(47,201,90,${0.22 + pulse * 0.14})`);
    halo.addColorStop(1, 'rgba(47,201,90,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, c.r * TARGET_GLOW, 0, Math.PI * 2); ctx.fill();

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

    /* ============================================================
       THE GIFT INSIDE THE TARGET

       A present sitting IN the well, not a ribbon tied round the
       outside. The flag says the gift is inside this target, so
       that is what is drawn: the chest's own present - the same
       magenta paper, the same gold ribbon and bow as the box on
       the board - shrunk to sit within the rings.

       IT STAYS INSIDE THE RIM. Nothing here crosses c.r: a bow
       that broke the target's outline made the goal a different
       shape on four boards, and the outline is what a player
       reads "land here" off. The rings are all still there
       around it, so the target is a target that happens to have
       something in it.

       Gone once the gift has been taken, here or on an earlier
       visit: a promise the level can no longer keep must not stay
       on the board.
       ============================================================ */
    if (level.targetGift && !giftTaken) {
      /* Everything below is a fraction of the target's own radius, so a
         27-unit target and a 46-unit one both get the same present. */
      const s = c.r;
      const w = s * 0.82, h = s * 0.72;
      const half = w / 2, top = -h / 2 + s * 0.09;   // nudged down: the bow
      const tie = w * 0.22;                          // takes the room above
      const bob = Math.sin(clock * 2.2) * (s * 0.03);

      ctx.save();
      ctx.translate(0, bob);

      // a warm glow under it, so the present reads as treasure in a well
      const bloom = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.8);
      bloom.addColorStop(0, `rgba(255,197,58,${0.30 + pulse * 0.18})`);
      bloom.addColorStop(1, 'rgba(255,197,58,0)');
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2); ctx.fill();

      /* THE BOW, drawn first so the box's own outline closes over the bottom
         of its loops - the two then read as one present rather than as a
         sticker on a square. The chest does exactly this, for the reason. */
      const bowY = top - h * 0.12;
      const loop = w * 0.28;
      ctx.lineWidth = Math.max(1.2, s * 0.055);
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, bowY);
        ctx.bezierCurveTo(dir * loop, bowY - loop * 0.95,
                          dir * loop * 1.25, bowY + loop * 0.5,
                          0, bowY + loop * 0.1);
        ctx.closePath();
        const gl = ctx.createLinearGradient(0, bowY - loop, 0, bowY + loop * 0.5);
        gl.addColorStop(0, TIE.light);
        gl.addColorStop(1, TIE.base);
        ctx.fillStyle = gl;
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, bowY + loop * 0.08, w * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = TIE.light; ctx.fill(); ctx.stroke();

      // the wrapped body
      const body = ctx.createLinearGradient(-half, top, half, top + h);
      body.addColorStop(0, WRAP.light);
      body.addColorStop(0.55, WRAP.base);
      body.addColorStop(1, WRAP.dark);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.roundRect(-half, top, w, h, s * 0.1); ctx.fill();

      // the ribbon, a cross over both faces - the strongest "this is a
      // present" cue there is at board size
      ctx.fillStyle = TIE.base;
      ctx.fillRect(-tie / 2, top, tie, h);
      ctx.fillRect(-half, -tie / 2 + s * 0.09, w, tie);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(-tie / 2, top, tie * 0.32, h);
      ctx.fillRect(-half, -tie / 2 + s * 0.09, w, tie * 0.32);

      // the one pen, round the whole silhouette
      ctx.lineWidth = Math.max(1.4, s * 0.07);
      ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.roundRect(-half, top, w, h, s * 0.1); ctx.stroke();

      ctx.restore();
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
      ctx.strokeStyle = `rgba(23,150,61,${(1 - kk) * 0.9})`;
      ctx.lineWidth = 3 * (1 - kk) + 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r * (0.5 + kk * 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
