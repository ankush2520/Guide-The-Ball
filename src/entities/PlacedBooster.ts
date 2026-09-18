/* ============================================================
   THE PLAYER'S BOOSTER

   Physically the same thing as the one Solmesa's levels come
   with - identical def, identical kick, read by the same loop in
   the engine - and deliberately NOT the same object to look at.

   The level's booster is a soft green-cyan bloom that belongs to
   the board. This one is YOURS, so it is drawn the way the ramp
   is: the player's blue, a hard ink outline, a cast shadow, and
   a nose that states the heading as a solid arrow rather than a
   pair of drifting chevrons. Put one beside an authored booster
   and the question "which of these did I put there" answers
   itself, which is the whole job of this class.

   Its own kind rather than a flag on Booster, because the two
   sit on different layers: level furniture is furniture, and
   what the player placed paints on top of it with the ramps.
   ============================================================ */
import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { BoosterDef } from '../levels/types';
import { INK, RAMP, outlineFor } from '../render/palette';

export class PlacedBooster extends Entity<BoosterDef> {
  readonly kind: EntityKind = 'myboost';

  /** The heading it fires along, in radians. */
  get angleRad(): number { return this.def.angle * Math.PI / 180; }

  draw({ ctx, clock }: DrawContext): void {
    const b = this.def;
    const a = this.angleRad;
    /* One slow breath, so a placed booster reads as armed rather than as a
       sticker. Phase is seeded off its own position: two of them side by side
       must not pulse in lockstep. */
    const pulse = 0.5 + 0.5 * Math.sin(clock * 2.6 + b.x * 0.04);

    ctx.save();
    ctx.translate(b.x, b.y);

    // the shadow that lifts it off the board, same as the ramp's
    ctx.fillStyle = 'rgba(42,35,80,.22)';
    ctx.beginPath(); ctx.arc(0, 4, b.r, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(a);

    /* THE NOSE. A solid wedge pointing exactly where the ball will leave, and
       the reason it is drawn before the body: the body's outline then closes
       across its base, so the two read as one machine and not a disc with a
       triangle stuck to it. */
    const nose = b.r * (1.42 + pulse * 0.1);
    ctx.beginPath();
    ctx.moveTo(nose, 0);
    ctx.lineTo(b.r * 0.30, -b.r * 0.86);
    ctx.lineTo(b.r * 0.30, b.r * 0.86);
    ctx.closePath();
    ctx.fillStyle = RAMP.light;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = outlineFor(b.r) * 0.85;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // the body: the player's blue, lit from the top left like every other
    // round thing on the board
    const body = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.35, b.r * 0.15,
                                          0, 0, b.r);
    body.addColorStop(0, RAMP.light);
    body.addColorStop(1, RAMP.dark);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = outlineFor(b.r);
    ctx.strokeStyle = INK;
    ctx.stroke();

    /* Three stacked chevrons inside the body, aimed the same way as the nose.
       They are what carries the heading at a glance when the disc is small on
       a phone, where the nose alone is only a few pixels of ink. */
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = b.r * 0.15;
    for (let i = 0; i < 3; i++) {
      const ox = -b.r * 0.48 + i * b.r * 0.36;
      ctx.globalAlpha = 0.35 + i * 0.25;
      ctx.beginPath();
      ctx.moveTo(ox, -b.r * 0.4);
      ctx.lineTo(ox + b.r * 0.3, 0);
      ctx.lineTo(ox, b.r * 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
