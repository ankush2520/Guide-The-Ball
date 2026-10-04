import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Segment, PillarLook } from '../levels/types';
import { POST_HT } from '../physics/constants';
import { INK } from '../render/palette';
import { MATS } from './Pillar';

/* ============================================================
   A POST

   A short standing bar of LEVEL STRUCTURE. It must never be
   mistaken for one of the player's ramps, so it shares nothing
   with them: it is chunky (POST_HT, not RAMP_HT), square-ended,
   dressed in its world's pillar material (wood in the meadow,
   basalt by the volcano...) with block seams across it and a
   dark rivet at each end. Ramps are thin, round-ended and BLUE.
   ============================================================ */
type PostDef = Segment & { look?: PillarLook };

export class Post extends Entity<PostDef> {
  readonly kind: EntityKind = 'post';

  draw({ ctx }: DrawContext): void {
    const s = this.def, m = MATS[s.look ?? 'stone'];
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy) || 1;
    const hw = POST_HT, ext = hw;                 // the ends stand proud of the line by the half-width
    ctx.save();
    ctx.translate((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
    ctx.rotate(Math.atan2(dy, dx));
    const L = len / 2 + ext;
    const shape = () => { ctx.beginPath(); ctx.roundRect(-L, -hw, L * 2, hw * 2, 3); };

    // hard shadow seat
    ctx.save(); ctx.rotate(-Math.atan2(dy, dx)); ctx.translate(3, 5); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(42,35,80,.22)'; shape(); ctx.fill(); ctx.restore();

    // material, lit across its width
    const g = ctx.createLinearGradient(0, -hw, 0, hw);
    g.addColorStop(0, m.top); g.addColorStop(1, m.bottom);
    ctx.fillStyle = g; shape(); ctx.fill();

    // block seams across the post
    ctx.save(); shape(); ctx.clip();
    ctx.strokeStyle = m.line; ctx.lineWidth = 2;
    const n = Math.max(2, Math.round((L * 2) / 22));
    for (let i = 1; i < n; i++) { const x = -L + (i * L * 2) / n; ctx.beginPath(); ctx.moveTo(x, -hw); ctx.lineTo(x, hw); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-L, -hw + 2, L * 2, 3);
    ctx.restore();

    ctx.strokeStyle = INK; ctx.lineWidth = 3; shape(); ctx.stroke();

    // a rivet at each end
    ctx.fillStyle = INK;
    for (const x of [-L + hw, L - hw]) { ctx.beginPath(); ctx.arc(x, 0, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
