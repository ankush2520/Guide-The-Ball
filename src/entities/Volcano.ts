import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Level } from '../levels/types';
import { PLAY, W, H } from '../physics/constants';

/* ============================================================
   THE VOLCANO - the backdrop of Emberkeep, the fire world

   Hot air shading to orange toward the ground; two ranges of
   volcanoes on the horizon, their craters glowing, smoke rolling
   off the tops and lava running down their flanks; a lava lake
   along the floor that bubbles and pops; basalt rocks up the
   sides with glowing cracks; and embers drifting up through the
   air.

   All scenery - none of it touches the ball - so it runs on the
   wall clock. The big pieces live in the MARGINS the view scale
   opens around the design box (below y = H and beside x = 0..W,
   see constants.ts PLAY), exactly as the seabed does, so the red
   bumpers and the fire hazards on the board stay easy to read.
   Cheap on a phone: a few dozen plain fills a frame, nothing
   allocated.
   ============================================================ */
const EMBERS = 34;

export class Volcano extends Entity<Level> {
  readonly kind: EntityKind = 'volcano';

  draw({ ctx, clock }: DrawContext): void {
    const x0 = PLAY.x0, y0 = PLAY.y0, x1 = PLAY.x1, y1 = PLAY.y1;
    const w = x1 - x0, h = y1 - y0;
    /* each level gets its own skyline, from its id */
    const seed = this.def.id * 7.31;
    const rnd = (i: number) => frac(Math.sin((i + 1) * 12.9898 + seed) * 43758.5453);
    const floor = Math.max(H + 8, y1 - 70);
    ctx.save();

    // ---- the air: warm, heating toward the ground
    const air = ctx.createLinearGradient(0, y0, 0, y1);
    air.addColorStop(0, 'rgba(255,170,100,0.10)');
    air.addColorStop(0.6, 'rgba(255,110,50,0.18)');
    air.addColorStop(1, 'rgba(210,50,20,0.34)');
    ctx.fillStyle = air;
    ctx.fillRect(x0, y0, w, h);

    // ---- two ranges of volcanoes on the horizon
    const ranges = [
      { base: floor + 4, tall: 120, alpha: 0.20, color: '120,40,40', n: 3, off: 0 },
      { base: floor + 10, tall: 82, alpha: 0.30, color: '80,25,30', n: 4, off: 40 },
    ];
    const craters: { x: number; y: number; s: number }[] = [];
    for (const [ri, R] of ranges.entries()) {
      ctx.fillStyle = `rgba(${R.color},${R.alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0, R.base);
      for (let k = 0; k < R.n; k++) {
        const cx = x0 + w * ((k + 0.5) / R.n) + (rnd(ri * 10 + k) - 0.5) * 40 + R.off * (k % 2 ? 1 : -1) * 0.3;
        const tall = R.tall * (0.7 + rnd(ri * 10 + k + 5) * 0.5);
        const half = w / R.n * 0.55, mouth = 12 + rnd(k + ri) * 8;
        ctx.lineTo(cx - half, R.base);
        ctx.lineTo(cx - mouth, R.base - tall);
        ctx.lineTo(cx + mouth, R.base - tall);         // the flat, broken-off top
        ctx.lineTo(cx + half, R.base);
        craters.push({ x: cx, y: R.base - tall, s: mouth });
      }
      ctx.lineTo(x1, R.base);
      ctx.closePath();
      ctx.fill();
    }

    // ---- lava running down the flanks, glowing and slowly pulsing
    for (const [i, c] of craters.entries()) {
      if (i % 2) continue;                                  // not every peak is erupting
      const pulse = 0.55 + 0.35 * Math.sin(clock * 1.6 + i);
      ctx.strokeStyle = `rgba(255,120,30,${0.55 * pulse})`;
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c.x + side * c.s * 0.5, c.y + 2);
        let x = c.x + side * c.s * 0.5, y = c.y + 2;
        for (let k = 0; k < 5; k++) {
          x += side * (8 + rnd(i * 7 + k) * 10);
          y += 16 + rnd(i * 3 + k) * 12;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // the crater's glow
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 34);
      g.addColorStop(0, `rgba(255,210,90,${0.55 * pulse})`);
      g.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, Math.PI * 2); ctx.fill();
      // smoke rolling up off the top
      for (let k = 0; k < 5; k++) {
        const t = frac(clock * 0.12 + k / 5 + i * 0.13);
        const r = 10 + t * 30;
        ctx.fillStyle = `rgba(90,70,75,${0.11 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(c.x + Math.sin(t * 3 + i) * 14 + t * 20, c.y - 8 - t * 95, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- basalt rocks up both side margins (and only there), glowing cracks
    for (let i = 0; i < 6; i++) {
      const left = i % 2 === 0;
      const span = left ? 0 - x0 : x1 - W;              // the margin's width
      if (span < 24) continue;                          // no margin, no rocks
      const s = Math.min(span * 0.4, 10 + rnd(i + 50) * 10);
      const cx = left ? x0 + s + rnd(i + 30) * (span - 2 * s) : W + s + rnd(i + 30) * (span - 2 * s);
      const cy = y0 + h * (0.3 + rnd(i + 40) * 0.5);
      ctx.fillStyle = 'rgba(60,35,40,0.32)';
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s * 0.8);
      ctx.lineTo(cx - s * 0.7, cy - s * 0.6);
      ctx.lineTo(cx + s * 0.1, cy - s);
      ctx.lineTo(cx + s * 0.9, cy - s * 0.3);
      ctx.lineTo(cx + s, cy + s * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,130,40,${0.45 + 0.3 * Math.sin(clock * 2 + i)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.4, cy + s * 0.5);
      ctx.lineTo(cx - s * 0.05, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.3, cy + s * 0.2);
      ctx.stroke();
    }

    // ---- the lava lake along the floor
    const lake = ctx.createLinearGradient(0, floor - 6, 0, y1);
    lake.addColorStop(0, '#ffd166');
    lake.addColorStop(0.25, '#ff8a1f');
    lake.addColorStop(1, '#c2270f');
    ctx.fillStyle = lake;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    for (let i = 0; i <= 28; i++) {
      const px = x0 + w * i / 28;
      ctx.lineTo(px, floor + Math.sin(i * 0.8 + clock * 1.3) * 3);
    }
    ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
    // its heat, glowing up off the surface
    const heat = ctx.createLinearGradient(0, floor - 60, 0, floor);
    heat.addColorStop(0, 'rgba(255,140,40,0)');
    heat.addColorStop(1, 'rgba(255,140,40,0.35)');
    ctx.fillStyle = heat;
    ctx.fillRect(x0, floor - 60, w, 60);
    // a crust of darker ripples drifting across it
    ctx.strokeStyle = 'rgba(150,30,10,0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const px = x0 + w * i / 24, py = floor + 14 + k * 14 + Math.sin(i * 1.1 + k + clock * 0.9) * 2.5;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // bubbles that swell and pop
    for (let i = 0; i < 6; i++) {
      const t = frac(clock * (0.35 + rnd(i + 60) * 0.3) + rnd(i + 70));
      const bx = x0 + w * rnd(i + 80), by = floor + 10 + rnd(i + 90) * 30;
      ctx.strokeStyle = `rgba(255,230,140,${0.8 * (1 - t)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(bx, by, 2 + t * 8, Math.PI, 0); ctx.stroke();
    }

    // ---- embers drifting up through the air
    for (let i = 0; i < EMBERS; i++) {
      const u = frac(Math.sin(i * 91.7) * 4375.5), v = frac(Math.sin(i * 17.3) * 9123.1);
      const rise = 30 + v * 40;
      const t = ((v * h + clock * rise) % (h + 20));
      const py = y1 - t;
      const px = x0 + u * w + Math.sin(clock * 1.2 + i) * 10;
      const life = 1 - t / h;                               // fades as it climbs
      ctx.fillStyle = i % 3 ? `rgba(255,150,40,${0.75 * life})` : `rgba(255,220,110,${0.8 * life})`;
      ctx.beginPath(); ctx.arc(px, py, 1.4 + v * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function frac(n: number): number { return n - Math.floor(n); }
