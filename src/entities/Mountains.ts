import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Level } from '../levels/types';
import { PLAY, H } from '../physics/constants';

/* ============================================================
   THE MOUNTAINS - the backdrop of the wind world

   Two ranges on the horizon - pale snow-capped peaks far off,
   greener ones in front - a meadow along the floor whose grass
   leans and sways in the breeze, and a few leaves blown across
   the air. It gives the wind world the same kind of painted
   ground the volcano and the seabed give theirs.

   All scenery - none of it touches the ball - so it runs on the
   wall clock, and the big pieces live in the MARGIN below the
   design box (y > H), as the volcano's do, so nothing on the
   board has to be read against it. The sky's clouds still drift
   above it (see Renderer).
   ============================================================ */
const LEAVES = 9;

export class Mountains extends Entity<Level> {
  readonly kind: EntityKind = 'mountains';

  draw({ ctx, clock }: DrawContext): void {
    const x0 = PLAY.x0, y0 = PLAY.y0, x1 = PLAY.x1, y1 = PLAY.y1;
    const w = x1 - x0, h = y1 - y0;
    /* each level gets its own skyline, from its id */
    const seed = this.def.id * 5.17;
    const rnd = (i: number) => frac(Math.sin((i + 1) * 12.9898 + seed) * 43758.5453);
    const floor = Math.max(H + 8, y1 - 64);
    ctx.save();

    // ---- two ranges: far and snowy, near and green
    const ranges = [
      { base: floor + 6, tall: 150, n: 3, fill: 'rgba(120,160,175,0.24)', snow: 0.75 },
      { base: floor + 12, tall: 96, n: 4, fill: 'rgba(80,150,120,0.30)', snow: 0 },
    ];
    for (const [ri, R] of ranges.entries()) {
      const peaks: { x: number; y: number; half: number }[] = [];
      ctx.fillStyle = R.fill;
      ctx.beginPath();
      ctx.moveTo(x0, R.base);
      for (let k = 0; k < R.n; k++) {
        const cx = x0 + w * ((k + 0.5) / R.n) + (rnd(ri * 10 + k) - 0.5) * 50;
        const tall = R.tall * (0.72 + rnd(ri * 10 + k + 5) * 0.45);
        const half = w / R.n * 0.62;
        const top = R.base - tall;
        ctx.lineTo(cx - half, R.base);
        ctx.lineTo(cx - half * 0.35, top + tall * 0.42);     // a shoulder
        ctx.lineTo(cx - 6, top + 4);
        ctx.quadraticCurveTo(cx, top - 3, cx + 6, top + 4);   // a softened peak
        ctx.lineTo(cx + half * 0.4, top + tall * 0.5);
        ctx.lineTo(cx + half, R.base);
        peaks.push({ x: cx, y: top, half });
      }
      ctx.lineTo(x1, R.base);
      ctx.closePath();
      ctx.fill();

      // snow on the far peaks: a cap with a ragged lower edge
      if (R.snow) {
        ctx.fillStyle = `rgba(255,255,255,${R.snow})`;
        for (const [k, p] of peaks.entries()) {
          const d = 34 + rnd(k + 20) * 10;                     // how far down the snow reaches
          const sx = d * 0.62;
          ctx.beginPath();
          ctx.moveTo(p.x - 6, p.y + 4);
          ctx.quadraticCurveTo(p.x, p.y - 3, p.x + 6, p.y + 4);
          ctx.lineTo(p.x + sx, p.y + d);
          ctx.lineTo(p.x + sx * 0.45, p.y + d - 7);
          ctx.lineTo(p.x + sx * 0.1, p.y + d + 3);
          ctx.lineTo(p.x - sx * 0.3, p.y + d - 8);
          ctx.lineTo(p.x - sx * 0.65, p.y + d + 1);
          ctx.lineTo(p.x - sx, p.y + d);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // ---- the meadow along the floor
    const meadow = ctx.createLinearGradient(0, floor - 6, 0, y1);
    meadow.addColorStop(0, '#bfeccb');
    meadow.addColorStop(0.35, '#8fd8a6');
    meadow.addColorStop(1, '#5fbf82');
    ctx.fillStyle = meadow;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    for (let i = 0; i <= 24; i++) {
      const px = x0 + w * i / 24;
      ctx.lineTo(px, floor + Math.sin(i * 0.7 + seed) * 5);
    }
    ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();

    // grass tufts along its edge, leaning with the breeze
    ctx.strokeStyle = 'rgba(40,130,80,0.55)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const gx = x0 + w * (i + rnd(i + 40) * 0.6) / 26;
      const gy = floor + Math.sin((gx - x0) / w * 24 * 0.7 + seed) * 5 + 4;
      const sway = Math.sin(clock * 1.8 + i * 0.9) * 3 + 4;          // always leaning downwind
      for (const [j, len] of [9, 13, 8].entries()) {
        const bx = gx + (j - 1) * 3;
        ctx.beginPath();
        ctx.moveTo(bx, gy);
        ctx.quadraticCurveTo(bx + sway * 0.3, gy - len * 0.6, bx + sway, gy - len);
        ctx.stroke();
      }
    }

    // ---- leaves blown across the air
    for (let i = 0; i < LEAVES; i++) {
      const u = frac(Math.sin(i * 51.3) * 4375.5), v = frac(Math.sin(i * 23.9) * 9123.1);
      const speed = 28 + v * 30;
      const t = (u * (w + 60) + clock * speed) % (w + 60);
      const px = x0 - 30 + t;
      const py = y0 + h * (0.12 + v * 0.7) + Math.sin(clock * 1.3 + i * 2) * 14;
      const spin = clock * (1.5 + v) + i;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(spin);
      ctx.scale(1, 0.45 + 0.55 * Math.abs(Math.sin(spin * 0.7)));    // tumbling
      ctx.fillStyle = i % 3 ? 'rgba(90,180,110,0.55)' : 'rgba(240,190,80,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

function frac(n: number): number { return n - Math.floor(n); }
