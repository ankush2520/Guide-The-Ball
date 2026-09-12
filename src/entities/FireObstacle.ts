import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { FireDef } from '../levels/types';

/* ============================================================
   FIRE - the hazard that ends the run

   Red is this game's word for "this hurts" and does not change
   meaning between countries, so fire stays inside the red
   family. What it must NOT do is stay inside the red obstacle's
   SHAPE. The two hazards differ in consequence - one deflects
   you, one ends the drop - and a player has to be able to tell
   them apart before the ball arrives, not after.

   So the obstacle keeps the whole vocabulary of a solid object:
   a clean circle, a single light source, a smooth rim. Fire
   gets the opposite of every one of those.

     - NO CLEAN EDGE. The silhouette is a closed path whose
       radius is modulated per angle and per frame, biased
       upward, so it licks. A circle reads as a thing you can
       bounce off; this reads as something you cannot.
     - IT MOVES. The obstacle is dead still. Every part of this
       flickers, and at a rate fast enough to feel unstable.
     - HOTTER, NOT JUST REDDER. The gradient runs from the
       obstacle's own deep red at the base up through orange to
       a near-white tip, which is the one part of the board
       brighter than the ball.
     - A DARK CORE. An ember sits at the middle, so the centre
       is the darkest point rather than the lit one. The
       obstacle's highlight is upper-left and bright; inverting
       that is what makes the two read as opposites at a glance
       rather than as two shades of the same thing.

   Every one of those is canvas primitives on the existing
   clock, so it costs nothing to load and is identical on every
   device at the same time.
   ============================================================ */

/** Points around the flame's rim. Enough that the wobble reads as a curve
    rather than as a polygon, few enough to stay cheap with several on a
    board. */
const RIM = 44;
/** Rising sparks. Deliberately few: this is a hazard to be read, not a
    particle demo, and a cloud of embers would blur its actual extent. */
const SPARKS = 5;

export class FireObstacle extends Entity<FireDef> {
  readonly kind: EntityKind = 'fire';

  draw({ ctx, clock }: DrawContext): void {
    const o = this.def;
    /* Two flickers at unrelated rates, summed. One alone is a pulse - the
       eye locks onto its period within a second and the flame reads as a
       machine. The offset by x keeps neighbouring fires out of phase. */
    const t = clock * 6.5 + o.x * 0.07;
    const t2 = clock * 4.1 - o.y * 0.05;

    ctx.save();

    // heat haze, wider and hotter than the obstacle's cool red bloom
    const bloom = ctx.createRadialGradient(o.x, o.y, o.r * 0.5, o.x, o.y, o.r * 2.15);
    bloom.addColorStop(0,   'rgba(255,120,40,.34)');
    bloom.addColorStop(0.5, 'rgba(255,70,40,.16)');
    bloom.addColorStop(1,   'rgba(255,60,40,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.15, 0, Math.PI * 2); ctx.fill();

    /* The flame body. `up` is 1 straight up and 0 straight down, so the
       tongues only ever grow upward - fire that licked sideways and down
       equally would just be a wobbling ball. */
    ctx.beginPath();
    for (let i = 0; i <= RIM; i++) {
      const a = (i / RIM) * Math.PI * 2 - Math.PI / 2;
      const up = Math.max(0, -Math.sin(a));
      const lick = 0.5 + 0.5 * Math.sin(a * 3 + t);
      const wob = Math.sin(a * 5 - t2) * 0.5 + Math.sin(a * 2 + t2 * 0.7) * 0.5;
      const rr = o.r * (0.88 + up * up * 0.42 * lick + wob * 0.07);
      const x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    /* Vertical, not radial: a flame is lit from its own tip, and a radial
       fill here made it a sphere again no matter what the outline did. */
    const body = ctx.createLinearGradient(0, o.y - o.r * 1.3, 0, o.y + o.r);
    body.addColorStop(0,    '#fff0c0');
    body.addColorStop(0.22, '#ffc451');
    body.addColorStop(0.5,  '#ff6a1e');
    body.addColorStop(0.78, '#e0281f');
    body.addColorStop(1,    '#8e1219');
    ctx.fillStyle = body;
    ctx.fill();

    // the ember: the centre is the DARKEST point, the inverse of the obstacle
    const core = ctx.createRadialGradient(o.x, o.y + o.r * 0.12, 0,
                                          o.x, o.y + o.r * 0.12, o.r * 0.62);
    core.addColorStop(0,    `rgba(255,214,120,${0.5 + 0.22 * Math.sin(t * 0.8)})`);
    core.addColorStop(0.34, 'rgba(150,26,20,.72)');
    core.addColorStop(1,    'rgba(60,8,8,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(o.x, o.y + o.r * 0.12, o.r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    /* Sparks, rising and fading on a loop each. They carry the eye upward,
       which is what keeps the whole thing reading as burning while the ball
       is somewhere else on the board. */
    for (let i = 0; i < SPARKS; i++) {
      const k = ((clock * 0.62 + i / SPARKS) % 1);
      const sx = o.x + Math.sin(clock * 2.2 + i * 2.3) * o.r * 0.5;
      const sy = o.y - o.r * 0.5 - k * o.r * 1.7;
      ctx.fillStyle = `rgba(255,${180 + Math.round(50 * (1 - k))},120,${(1 - k) * 0.75})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.9 * (1 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
