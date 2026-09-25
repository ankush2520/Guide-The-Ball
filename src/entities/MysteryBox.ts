/* ============================================================
   THE MYSTERY BOX

   A wrapped PRESENT the ball opens by touching it mid-drop. Pure
   bonus: like a star, it is scenery to the physics and can never
   change where the ball goes - which is what lets one be dropped
   onto a level whose solution is already proved.

   DRAWN AS A GIFT, and drawn as nothing else here is. Every
   other thing on the board is a circle or a bar: the target's
   green ring, the red obstacle, the gold star, the blue ramp.
   This is the only SQUARE, and the only thing wearing a ribbon
   and a bow - a silhouette test rather than a colour one,
   because colour is already carrying "red hurts, green is the
   goal, blue is yours".

   The wrap is magenta, which is the one warm hue the board's
   vocabulary had not already spent, and the ribbon is the gold
   every reward in this game is paid in. Deliberately NOT the
   obstacle's red: a bonus must never read as a hazard.

   Once taken it goes to a dashed outline, the same way a
   collected star does, so the board still says what was there.
   ============================================================ */
import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BoxDef } from '../levels/types';
import { BOX_R } from '../physics/constants';
import { INK } from '../render/palette';
import { BOX_GLOW } from '../render/glow';

/* Gift wrap and its ribbon. The wrap is its own family - nothing else on the
   board is magenta - and the ribbon is the game's gold.

   Exported because a gift has two homes now: the chest the ball opens on the
   way past, and the one sitting INSIDE a wrapped target (see Target.draw).
   Those two must be the same present in the same paper, or the second one is
   a new thing to learn rather than the same treasure somewhere else. */
export const WRAP = { light: '#f07ac4', base: '#d94a9e', dark: '#a82f76' };
export const TIE  = { light: '#ffe07a', base: '#ffc53a', dark: '#e0a112' };

export class MysteryBox extends Entity<BoxDef> {
  readonly kind: EntityKind = 'box';

  isTaken(g: DrawContext): boolean { return !!g.gotBox[this.index]; }

  draw(g: DrawContext): void {
    const { ctx, clock } = g;
    const p = this.def;
    const taken = this.isTaken(g);
    /* A slow bob and a glow, so a present reads as live treasure rather than
       as part of the scenery. Seeded off its own x, like every other
       animation here, so two boxes never move in lockstep. */
    const t = clock * 2.2 + p.x * 0.05;
    const bob = taken ? 0 : Math.sin(t) * 1.8;
    const w = BOX_R * 1.8, h = BOX_R * 1.6;
    const half = w / 2, top = -h / 2;
    const tie = w * 0.2;                      // ribbon width

    ctx.save();
    ctx.translate(p.x, p.y + bob);

    if (taken) {
      /* The empty spot. Dashed, low contrast, no glow - present enough to say
         "you already got this one", quiet enough never to be mistaken for a
         thing still worth steering at. The ribbon's cross is kept, faintly,
         so the outline still reads as the gift that was there. */
      ctx.strokeStyle = 'rgba(42,35,80,.30)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.roundRect(-half, top, w, h, 4);
      ctx.moveTo(0, top); ctx.lineTo(0, top + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    const glow = 0.5 + 0.5 * Math.sin(t);
    const bloom = ctx.createRadialGradient(0, 0, BOX_R * 0.4, 0, 0, BOX_R * BOX_GLOW);
    bloom.addColorStop(0, `rgba(255,197,58,${0.26 + glow * 0.16})`);
    bloom.addColorStop(1, 'rgba(255,197,58,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(0, 0, BOX_R * BOX_GLOW, 0, Math.PI * 2); ctx.fill();

    // the shadow it casts, so the present sits ON the board like everything else
    ctx.fillStyle = 'rgba(42,35,80,.20)';
    ctx.beginPath();
    ctx.ellipse(0, h / 2 + 4 - bob, w * 0.42, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    /* THE BOW, drawn first so the box's own outline closes over the bottom of
       its loops - the two then read as one object rather than as a sticker
       sitting on a square. */
    const bowY = top - h * 0.1;
    const loop = w * 0.3;
    ctx.lineWidth = 2.4;
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
    // the knot
    ctx.beginPath();
    ctx.arc(0, bowY + loop * 0.08, w * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = TIE.light; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();

    // the wrapped body
    const body = ctx.createLinearGradient(-half, top, half, top + h);
    body.addColorStop(0, WRAP.light);
    body.addColorStop(0.55, WRAP.base);
    body.addColorStop(1, WRAP.dark);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-half, top, w, h, 4); ctx.fill();

    /* THE RIBBON, a cross over both faces. It is the single strongest "this is
       a present" cue at board size - far stronger than any glyph, which is
       what the first pass wore and what made this read as a crate. */
    ctx.fillStyle = TIE.base;
    ctx.fillRect(-tie / 2, top, tie, h);
    ctx.fillRect(-half, -tie / 2, w, tie);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillRect(-tie / 2, top, tie * 0.32, h);
    ctx.fillRect(-half, -tie / 2, w, tie * 0.32);

    // the one pen, round the whole silhouette and down the ribbon's edges
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.roundRect(-half, top, w, h, 4); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-tie / 2, top); ctx.lineTo(-tie / 2, top + h);
    ctx.moveTo(tie / 2, top);  ctx.lineTo(tie / 2, top + h);
    ctx.moveTo(-half, -tie / 2); ctx.lineTo(half, -tie / 2);
    ctx.moveTo(-half, tie / 2);  ctx.lineTo(half, tie / 2);
    ctx.stroke();

    /* A sparkle over one corner, on the same clock as the glow: the last
       little thing that says the contents are a surprise. */
    ctx.globalAlpha = 0.35 + glow * 0.65;
    ctx.strokeStyle = '#fffdf2';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const sx = half * 0.78, sy = top + h * 0.22, k = 4 + glow * 2;
    ctx.beginPath();
    ctx.moveTo(sx - k, sy); ctx.lineTo(sx + k, sy);
    ctx.moveTo(sx, sy - k); ctx.lineTo(sx, sy + k);
    ctx.stroke();

    ctx.restore();
  }
}
