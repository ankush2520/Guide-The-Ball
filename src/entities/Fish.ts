import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { FishDef } from '../levels/types';
import { fishAt, fishPathAt } from '../levels/fish';
import { INK } from '../render/palette';

/* An EATER FISH: a dark-violet piranha with a mouthful of teeth. Deliberately
   NOT red - red bounces you; this ends the run, like fire, and has its own
   shape so the two are never confused. Its wavy lane is drawn faintly under
   it, so the player can see where it will go. Drawn off simT, the physics'
   own step clock, so where it is drawn is where it bites. */
const BODY = '#5b2a86', BELLY = '#8d5cc0', FIN = '#3d1a5e';

export class Fish extends Entity<FishDef> {
  readonly kind: EntityKind = 'fish';

  draw({ ctx, simT }: DrawContext): void {
    const f = this.def;
    ctx.save();
    // the lane: a faint dotted wave, out and back along the same line
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(70,40,110,0.22)';
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = fishPathAt(f, i / 40);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const c = fishAt(f, simT);
    const r = f.r;
    ctx.translate(c.x, c.y);
    ctx.scale(c.dir, 1);                       // faces the way it swims
    // shadow seat
    ctx.fillStyle = 'rgba(42,35,80,.18)';
    ctx.beginPath(); ctx.ellipse(0, 5, r * 1.25, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    // tail, flicking
    const flick = Math.sin(simT * 0.5) * r * 0.18;
    ctx.fillStyle = FIN;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, 0);
    ctx.lineTo(-r * 1.75, -r * 0.7 + flick);
    ctx.lineTo(-r * 1.55, flick * 0.3);
    ctx.lineTo(-r * 1.75, r * 0.7 + flick);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    // spiky dorsal fin
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.62);
    ctx.lineTo(-r * 0.2, -r * 1.15);
    ctx.lineTo(0.05 * r, -r * 0.7);
    ctx.lineTo(r * 0.3, -r * 1.05);
    ctx.lineTo(r * 0.45, -r * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // body
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, BODY); g.addColorStop(1, BELLY);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.stroke();
    // the jaw: open, with teeth
    ctx.fillStyle = '#2a0f3f';
    ctx.beginPath();
    ctx.moveTo(r * 1.12, -r * 0.05);
    ctx.lineTo(r * 0.55, r * 0.12);
    ctx.lineTo(r * 1.05, r * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) {
      const x = r * (0.68 + k * 0.14);
      ctx.beginPath(); ctx.moveTo(x, r * 0.02); ctx.lineTo(x + r * 0.06, r * 0.16); ctx.lineTo(x + r * 0.12, r * 0.04); ctx.fill();
    }
    // the eye - yellow, with a hard pupil
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.28, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.28, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
