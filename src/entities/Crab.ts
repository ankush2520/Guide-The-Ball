import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { CrabDef } from '../levels/types';
import { crabAt, crabPathAt } from '../levels/crab';
import { INK } from '../render/palette';

/* ============================================================
   A CRAB

   A toon crab in the game's "this eats you" VIOLET - never red,
   which on this board means a bumper. Round shell, two eyes up
   on stalks that look the way it walks, claws that open and
   snap, and three legs a side that scuttle as it goes.

   Its loop is drawn faintly under it, so the pattern it walks
   is on the board to be read, not guessed. Drawn off simT -
   the physics' own step clock - so where it is drawn is where
   it pinches.
   ============================================================ */
const SHELL = '#7b3fc4', SHELL_LIGHT = '#a878e6', CLAW = '#6a32ad', BELLY = '#c9a8f2';

export class Crab extends Entity<CrabDef> {
  readonly kind: EntityKind = 'crab';

  draw({ ctx, simT }: DrawContext): void {
    const c = this.def;
    ctx.save();

    // the loop it walks: a faint dotted line
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(90,50,140,0.22)';
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const p = crabPathAt(c, i / 64);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const at = crabAt(c, simT);
    const r = c.r;
    const step = simT * 0.45;                       // the legs' and claws' tempo
    ctx.translate(at.x, at.y);

    // shadow seat
    ctx.fillStyle = 'rgba(42,35,80,.18)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 1.25, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

    // legs: three a side, scuttling in turn
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const lift = Math.sin(step + k * 2.1 + (side > 0 ? Math.PI : 0)) * r * 0.12;
      const bx = side * r * 0.62, by = r * (-0.05 + k * 0.22);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(side * r * (1.05 + k * 0.05), by + r * 0.05 - lift);
      ctx.lineTo(side * r * (1.28 + k * 0.08), by + r * 0.42 - lift);
      ctx.stroke();
    }

    // claws: an arm up and out each side, pincers opening and snapping shut
    const snap = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(step * 1.7));
    for (const side of [-1, 1]) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(side * r * 0.55, -r * 0.2);
      ctx.quadraticCurveTo(side * r * 1.05, -r * 0.55, side * r * 1.05, -r * 0.95);
      ctx.stroke();
      ctx.save();
      ctx.translate(side * r * 1.05, -r * 1.05);
      ctx.fillStyle = CLAW;
      for (const jaw of [-1, 1]) {
        ctx.save();
        ctx.rotate(jaw * snap * side);
        ctx.beginPath();
        ctx.ellipse(side * r * 0.12 * jaw, -r * 0.22, r * 0.2, r * 0.36, jaw * 0.35, 0, Math.PI * 2);
        ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // the shell
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, SHELL_LIGHT); g.addColorStop(1, SHELL);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    // a paler belly band and a few shell spots
    ctx.fillStyle = BELLY;
    ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (const [sx, sy, sr] of [[-0.35, -0.3, 0.12], [0.3, -0.38, 0.09], [0.05, -0.1, 0.07]])
      { ctx.beginPath(); ctx.arc(r * sx, r * sy, r * sr, 0, Math.PI * 2); ctx.fill(); }

    // eyes on stalks, pupils glancing the way it walks
    for (const side of [-1, 1]) {
      const ex = side * r * 0.32, ey = -r * 0.95;
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side * r * 0.22, -r * 0.55); ctx.lineTo(ex, ey + r * 0.12); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + at.dir * r * 0.07, ey + r * 0.03, r * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    // a small grin
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -r * 0.02, r * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }
}
