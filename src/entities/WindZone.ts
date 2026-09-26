import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { WindDef } from '../levels/types';
import { PLAY } from '../physics/constants';
import { INK } from '../render/palette';

/* ============================================================
   WIND - drawn as moving air with a visible source

   A TABLE FAN at the edge the wind comes from, blades spinning,
   and curly gust lines streaming out of it across the band - so
   where it comes from, which way it pushes and how hard (faster,
   denser gusts, a faster fan) are all readable at a glance. No
   box: the band only shows as a soft tint that fades out at its
   top and bottom edges.

   What rides the gust depends on the board (`look`, set in
   levels/index): leaves in open air, rain slanting hard in a
   storm, and under the sea it is a CURRENT - bubbles streaming
   sideways, and no fan.

   Scenery on the wall clock; the push itself is the physics'.
   A few dozen strokes a frame, nothing allocated - cheap on a
   phone.
   ============================================================ */
export class WindZone extends Entity<WindDef> {
  readonly kind: EntityKind = 'wind';

  get isHorizontal(): boolean {
    return Math.abs(this.def.ax || 0) >= Math.abs(this.def.ay || 0);
  }

  draw({ ctx, clock }: DrawContext): void {
    const z = this.def;
    const look = z.look ?? 'air';
    const x0 = Math.max(z.x, PLAY.x0), x1 = Math.min(z.x + z.w, PLAY.x1);
    const y0 = z.y, h = z.h, y1 = y0 + h, span = x1 - x0;
    if (span <= 0 || h <= 0) return;
    const dir = Math.sign(z.ax || 1);
    const s = Math.min(1.2, Math.abs(z.ax || 0.5));        // strength
    const cy = y0 + h / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, span, h); ctx.clip();

    // ---- the band: a soft tint, strongest in the middle, gone at the edges
    const tint = look === 'current' ? '255,255,255' : look === 'rain' ? '110,130,180' : '130,175,230';
    const band = ctx.createLinearGradient(0, y0, 0, y1);
    band.addColorStop(0, `rgba(${tint},0)`);
    band.addColorStop(0.5, `rgba(${tint},${look === 'current' ? 0.2 : 0.17})`);
    band.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = band;
    ctx.fillRect(x0, y0, span, h);

    // ---- the fan, at the upwind edge (none under water)
    const fr = Math.max(16, Math.min(30, h * 0.26));
    const hasFan = look !== 'current';
    const fanX = dir > 0 ? x0 + fr + 10 : x1 - fr - 10;
    const start = hasFan ? fanX + dir * fr : dir > 0 ? x0 : x1;   // where gusts leave from
    const run = hasFan ? span - fr * 2 - 10 : span;

    // ---- gust lines: curly swooshes streaming downwind
    const n = Math.round(5 + s * 6);
    const speed = 110 + s * 170;                          // px per second
    const len = 46 + s * 40;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const lane = y0 + h * (0.16 + 0.68 * frac(i * 0.618 + 0.13));
      const t = frac(clock * speed / (run + len) + i * 0.37);
      const head = start + dir * t * (run + len);
      const fade = Math.min(1, t * 5, (1 - t) * 4);        // in at the fan, out far side
      const wob = look === 'current' ? 6 : 3.5;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 10; k++) {
        const x = head - dir * len * (1 - k / 10);
        pts.push([x, lane + Math.sin(x * 0.045 + i + clock * 3) * wob]);
      }
      const col = look === 'current' ? '235,250,255' : '255,255,255';
      const edge = look === 'current' ? '25,100,150' : '70,95,160';
      for (const [wdt, c, a] of [[6, edge, 0.45], [3, col, 1]] as const) {
        ctx.strokeStyle = `rgba(${c},${a * fade})`; ctx.lineWidth = wdt;
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        // every other gust ends in a curl
        if (i % 2 === 0) {
          const [hx, hy] = pts[pts.length - 1];
          ctx.arc(hx, hy - 6, 6, Math.PI / 2, Math.PI / 2 + dir * Math.PI * 1.5, dir < 0);
        }
        ctx.stroke();
      }
    }

    // ---- what the gust carries
    if (look === 'air') {
      const leaves = ['#6cbf5a', '#e0a33c', '#8fcf6a', '#d98b3a'];
      for (let i = 0; i < 5; i++) {
        const t = frac(clock * speed * 0.8 / (run + 40) + i * 0.29);
        const x = start + dir * t * (run + 40), y = y0 + h * (0.2 + 0.6 * frac(i * 0.71)) + Math.sin(clock * 4 + i) * 8;
        ctx.save(); ctx.translate(x, y); ctx.rotate(clock * 5 * dir + i);
        ctx.fillStyle = leaves[i % leaves.length];
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,60,30,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.restore();
      }
    } else if (look === 'rain') {
      // the storm's rain, slanting hard where the gust catches it
      ctx.strokeStyle = 'rgba(85,110,165,0.55)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 18; i++) {
        const t = frac(clock * 1.4 + i * 0.137);
        const x = x0 + frac(i * 0.618 + clock * s * 0.9 * dir) * span;
        const y = y0 + t * h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * (10 + s * 10), y - 12); ctx.stroke();
      }
    } else {
      // bubbles swept along by the current
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) {
        const t = frac(clock * speed * 0.7 / (span + 20) + i * 0.23);
        const x = start + dir * t * (span + 20), y = y0 + h * (0.15 + 0.7 * frac(i * 0.53)) + Math.sin(clock * 3 + i) * 6;
        ctx.beginPath(); ctx.arc(x, y, 2.5 + (i % 3), 0, Math.PI * 2); ctx.stroke();
      }
    }

    if (hasFan) drawFan(ctx, fanX, cy, fr, dir, clock * (8 + s * 14));
    ctx.restore();
  }
}

function frac(n: number): number { return n - Math.floor(n); }

/** A table fan seen three-quarter on, facing `dir`: a round guard with
    spinning blades, the motor behind it, a stand and a base. */
function drawFan(ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
                 dir: number, spin: number): void {
  ctx.save();
  ctx.translate(x, y);
  // stand and base, down to the bottom of the guard and a little beyond
  ctx.fillStyle = '#9aa3b8'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(-dir * r * 0.18 - 3, r * 0.3, 6, r * 0.95); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-dir * r * 0.18, r * 1.3, r * 0.75, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // the motor housing, behind the guard
  ctx.fillStyle = '#c2c9d8';
  ctx.beginPath(); ctx.ellipse(-dir * r * 0.5, 0, r * 0.38, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // the guard, turned toward the wind's direction (so it reads as facing it)
  ctx.scale(0.62, 1);
  ctx.fillStyle = 'rgba(235,242,255,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // blades
  ctx.fillStyle = '#4f8fe0';
  for (let k = 0; k < 3; k++) {
    const a = spin + k * Math.PI * 2 / 3;
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(r * 0.48, 0, r * 0.42, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#2f5fa8';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
  // grille: rim, a ring and a few spokes
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(42,35,80,0.5)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
  }
  ctx.restore();
}
