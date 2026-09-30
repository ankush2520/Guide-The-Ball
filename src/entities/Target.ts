import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Circle } from '../levels/types';
import { targetAt } from '../levels/target';
import { INK } from '../render/palette';
import { drawCupBack, drawCupFront, MOUTH_Y } from './Cup';
import { TIE, WRAP } from './MysteryBox';

/* The goal: a CUP the ball drops into, dressed for its world - see
   entities/Cup for the look and why it is split into a back and a front.
   The win check is untouched: it is still this circle, and the cup is drawn
   to sit inside it.

   Where it is drawn is not its authored centre. A patrolling target is
   painted at targetAt(simT), the same function and the same clock the win
   check uses, so what the player sees the ball miss is what the simulation
   says it missed. simT is fractional - steps plus the interpolation alpha -
   which is what keeps the slide smooth between physics steps rather than
   stepping 60 times a second, the same trick the ball's own draw uses. */

export class Target extends Entity<Circle> {
  readonly kind: EntityKind = 'target';

  draw(g: DrawContext): void {
    const { ctx, clock, simT, level, giftTaken } = g;
    const c = targetAt(level, simT);
    const theme = g.cup ?? 'meadow';
    const pulse = 0.5 + 0.5 * Math.sin(clock * 2.3);

    ctx.save();
    ctx.translate(c.x, c.y);
    drawCupBack(ctx, c.r, theme, clock);

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
      /* it sits IN the cup's mouth, smaller, and the cup's front covers its
         bottom half - a present peeking out of the cup */
      ctx.translate(0, MOUTH_Y * s + bob);
      ctx.scale(0.72, 0.72);

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
    /* During a capture the front goes down AFTER the ball (Renderer calls
       drawFront), so the ball sinks in behind the cup's lip. */
    if (!g.capturing) drawCupFront(ctx, c.r, theme, clock);
    ctx.restore();
  }

  /** The cup's body and front lip on their own - painted over the ball
      while it drops in. */
  drawFront(g: DrawContext): void {
    const c = targetAt(g.level, g.simT);
    g.ctx.save();
    g.ctx.translate(c.x, c.y);
    drawCupFront(g.ctx, c.r, g.cup ?? 'meadow', g.clock);
    g.ctx.restore();
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
      const rr = c.r * (0.9 + kk * 1.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy + MOUTH_Y * c.r - kk * c.r * 0.6, rr, rr * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
