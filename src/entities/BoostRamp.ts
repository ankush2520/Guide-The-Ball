/* ============================================================
   THE PLAYER'S BOOSTER - A RAMP THAT FIRES

   A BAR, drawn as the ramp's twin and coloured as its opposite.

   The silhouette is deliberate. This thing bounces the ball
   exactly the way a ramp does - same body, same mirror, same
   lossy contact - so it has to LOOK like the ramp whose physics
   it borrows, or the board would be promising something it does
   not do. The old version of this item was a disc with an arrow,
   which promised a heading; a bar promises a bounce, which is
   what it delivers.

   Which leaves colour to carry the difference on its own, and it
   is the one carrying it: ORANGE, for the speed. Not green -
   that is the target and nothing else may wear it, which is the
   collision this replaces: the booster used to be a green-cyan
   disc a step away from the goal's own green. Not the ramp's
   blue either, because blue is "an ordinary bar that only turns
   you" and this is the bar that throws you.

   The chevrons point OUT OF BOTH ENDS, and that is not a
   decoration. A bar has two faces and the ball may arrive at
   either; a single arrow would be telling the player a heading
   the item does not have. Outward from the middle says "speed,
   along this line", which is exactly the promise.
   ============================================================ */
import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BoostRampDef } from '../levels/types';
import { BOOST_HT } from '../physics/constants';
import { BOOST, INK } from '../render/palette';
import { drawSeg } from '../render/primitives';

/** How every boost ramp is painted - shared with the renderer's own loop, the
    same way RAMP_STYLE is. */
export const BOOST_STYLE = { fill: BOOST.base, shine: 'rgba(255,255,255,.7)',
                             outline: 2.5, shadow: true } as const;

export class BoostRamp extends Entity<BoostRampDef> {
  readonly kind: EntityKind = 'myboost';

  draw({ ctx, clock }: DrawContext): void {
    const s = this.def;
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    /* One slow breath, so a placed bar reads as ARMED rather than as a
       sticker. Phase is seeded off its own position, like every other
       animation on this board: two of them side by side must not pulse in
       lockstep. */
    const pulse = 0.5 + 0.5 * Math.sin(clock * 2.6 + s.x1 * 0.04);

    ctx.save();

    // the heat it gives off, under the bar and along it
    const bloom = ctx.createRadialGradient(cx, cy, len * 0.1, cx, cy, len * 0.72);
    bloom.addColorStop(0, `rgba(255,122,24,${0.16 + pulse * 0.12})`);
    bloom.addColorStop(1, 'rgba(255,122,24,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(cx, cy, len * 0.72, 0, Math.PI * 2); ctx.fill();

    // the bar itself, in the same pen and the same lift every ramp has
    drawSeg(ctx, s, BOOST_HT, BOOST_STYLE);

    /* THE CHEVRONS. Two out of each end, brightening outward, on the bar's
       own axis - the mark that says this one is not just a surface. */
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.strokeStyle = '#fff6ea';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = BOOST_HT * 0.52;
    const w = BOOST_HT * 0.72, step = len * 0.15;
    for (const dir of [-1, 1])
      for (let i = 0; i < 2; i++) {
        const ox = dir * (len * 0.12 + i * step + pulse * 2);
        ctx.globalAlpha = 0.45 + i * 0.35;
        ctx.beginPath();
        ctx.moveTo(ox - dir * w, -w);
        ctx.lineTo(ox + dir * w * 0.4, 0);
        ctx.lineTo(ox - dir * w, w);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;

    /* The ink pips on the ends, so the bar reads as a machine with a length
       rather than as a line someone drew. */
    ctx.fillStyle = INK;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(dir * len / 2, 0, BOOST_HT * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
