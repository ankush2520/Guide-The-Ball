import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BoosterDef } from '../levels/types';
import { BOOST } from '../render/palette';

/* ============================================================
   THE LEVEL'S BOOSTER PAD

   A disc with a chevron aimed exactly where it fires. The chevron
   IS the promise: the game is plan-first, so the heading you will
   leave on has to be readable before the ball ever arrives.

   ORANGE, and it used to be green-cyan. That green sat one step
   from the target's own, on boards that carry both - "is that the
   thing I am aiming at, or the thing that throws me?" - and green
   belongs to the goal alone. Orange is the speed family it now
   shares with the player's boost ramp: same meaning, and the
   SHAPE is what says which of the two you are looking at. A pad
   is the level's; a bar is yours.

   Its PHYSICS is untouched by any of this. Twenty-three shipped
   levels were proved winnable against this pad's fixed-speed
   kick, so nothing here is more than paint.
   ============================================================ */
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
    bloom.addColorStop(0, `rgba(255,122,24,${0.18 + pulse * 0.10})`);
    bloom.addColorStop(1, 'rgba(255,122,24,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 1.7, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    body.addColorStop(0, 'rgba(255,214,168,.80)');
    body.addColorStop(1, 'rgba(255,122,24,.50)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = BOOST.dark; ctx.lineWidth = 2.8;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -(clock * 26) % 13;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.translate(z.x, z.y); ctx.rotate(a);
    ctx.strokeStyle = '#8f3405'; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
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
