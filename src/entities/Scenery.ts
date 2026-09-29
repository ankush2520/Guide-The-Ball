import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Level } from '../levels/types';
import { PLAY, H } from '../physics/constants';
import { INK } from '../render/palette';

/* ============================================================
   WORLD SCENERY - the painted ground of the other worlds

   One class per world, each doing for its world what the
   volcano does for Lava Land and the seabed for Coral Reef:
   a horizon, a floor and a little life, so every world reads
   as a PLACE rather than a colour.

     Meadow  - Sunny Meadows: rolling hills, round trees,
               flowers, butterflies
     Cliffs  - Thunder Sky: a storm-cloud bank, rain-dark
               cliffs, a lighthouse sweeping its beam, puddles
     Desert  - Starry Desert: a low sun, mesas, dunes, cacti
               and the first stars of the evening
     Space   - Outer Space: a ringed planet, a moon, nebula
               glow, twinkling stars, shooting stars, a rocket
               and a cratered moon floor

   All scenery - none of it touches the ball - so it runs on the
   wall clock, and the big pieces sit in the MARGINS around the
   design box (below y = H, beside x = 0..W, above y = 0), low
   in alpha where they reach the board, so every hazard on it
   stays as readable as before. A few dozen plain fills a frame.
   ============================================================ */

const frac = (n: number): number => n - Math.floor(n);
/** A per-level random stream, so each level gets its own skyline. */
const stream = (id: number, salt: number) => (i: number): number =>
  frac(Math.sin((i + 1) * 12.9898 + id * salt) * 43758.5453);

/** The rect the scene may paint in, and where its floor sits. */
function frame() {
  const x0 = PLAY.x0, y0 = PLAY.y0, x1 = PLAY.x1, y1 = PLAY.y1;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, floor: Math.max(H + 8, y1 - 64) };
}

/** A soft four-point twinkle. */
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** A wavy floor band from `top` to the bottom of the scene. */
function floorBand(ctx: CanvasRenderingContext2D, f: ReturnType<typeof frame>, top: number,
                   stops: [number, string][], wave: number, phase: number): void {
  const g = ctx.createLinearGradient(0, top - 6, 0, f.y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(f.x0, f.y1);
  for (let i = 0; i <= 24; i++) ctx.lineTo(f.x0 + f.w * i / 24, top + Math.sin(i * 0.7 + phase) * wave);
  ctx.lineTo(f.x1, f.y1);
  ctx.closePath();
  ctx.fill();
}

/* ================================================================ MEADOW */
export class Meadow extends Entity<Level> {
  readonly kind: EntityKind = 'meadow';

  draw({ ctx, clock }: DrawContext): void {
    const f = frame(), rnd = stream(this.def.id, 3.71);
    ctx.save();

    // two rows of rolling hills
    const rows = [
      { base: f.floor + 4, tall: 70, n: 3, fill: 'rgba(110,200,140,0.32)' },
      { base: f.floor + 10, tall: 44, n: 4, fill: 'rgba(80,185,115,0.45)' },
    ];
    const tops: { x: number; y: number }[] = [];
    for (const [ri, R] of rows.entries()) {
      ctx.fillStyle = R.fill;
      ctx.beginPath();
      ctx.moveTo(f.x0, R.base);
      for (let k = 0; k < R.n; k++) {
        const cx = f.x0 + f.w * ((k + 0.5) / R.n) + (rnd(ri * 9 + k) - 0.5) * 40;
        const half = f.w / R.n * 0.7, top = R.base - R.tall * (0.7 + rnd(ri * 9 + k + 4) * 0.5);
        ctx.lineTo(cx - half, R.base);
        ctx.bezierCurveTo(cx - half * 0.5, top, cx + half * 0.5, top, cx + half, R.base);
        if (ri === 1) tops.push({ x: cx, y: top + (R.base - top) * 0.25 });
      }
      ctx.lineTo(f.x1, R.base);
      ctx.closePath();
      ctx.fill();
    }

    // round trees standing on the nearer hills
    for (const [k, t] of tops.entries()) {
      if (k % 2) continue;
      const s = 12 + rnd(k + 30) * 6;
      ctx.fillStyle = 'rgba(140,95,55,0.7)';
      ctx.fillRect(t.x - 2.5, t.y - s * 0.4, 5, s * 1.1);
      ctx.fillStyle = 'rgba(70,170,95,0.75)';
      ctx.strokeStyle = 'rgba(42,35,80,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x - s * 0.45, t.y - s * 0.55, s * 0.6, 0, Math.PI * 2);
      ctx.arc(t.x + s * 0.4, t.y - s * 0.6, s * 0.65, 0, Math.PI * 2);
      ctx.arc(t.x, t.y - s * 1.05, s * 0.7, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // the grass floor, with flowers along it
    floorBand(ctx, f, f.floor, [[0, '#c9f0c4'], [0.35, '#9adf98'], [1, '#62c26f']], 4, this.def.id);
    const petals = ['#ff8fb1', '#ffd23f', '#ffffff', '#b99cff'];
    for (let i = 0; i < 18; i++) {
      const fx = f.x0 + f.w * (i + rnd(i + 50) * 0.8) / 18;
      const fy = f.floor + 12 + rnd(i + 60) * (f.y1 - f.floor - 20);
      ctx.fillStyle = petals[i % petals.length];
      ctx.beginPath(); ctx.arc(fx, fy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb400';
      ctx.beginPath(); ctx.arc(fx, fy, 1, 0, Math.PI * 2); ctx.fill();
    }

    // butterflies fluttering low over the grass
    for (let i = 0; i < 3; i++) {
      const u = rnd(i + 70);
      const bx = f.x0 + f.w * frac(u + clock * 0.03 * (i % 2 ? 1 : -1));
      const by = f.floor - 30 - i * 16 + Math.sin(clock * 1.7 + i * 2) * 12;
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(clock * 9 + i));
      ctx.fillStyle = ['rgba(255,140,180,0.85)', 'rgba(255,200,60,0.85)', 'rgba(150,130,255,0.85)'][i];
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(bx + side * 3.5 * flap, by, 4 * flap, 3, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* ================================================================ CLIFFS */
export class Cliffs extends Entity<Level> {
  readonly kind: EntityKind = 'cliffs';

  draw({ ctx, clock }: DrawContext): void {
    const f = frame(), rnd = stream(this.def.id, 2.93);
    ctx.save();

    // the storm-cloud bank along the top
    for (let i = 0; i < 9; i++) {
      const cx = f.x0 + f.w * (i + 0.5) / 9 + Math.sin(clock * 0.15 + i) * 8;
      const cy = f.y0 + 18 + rnd(i) * 26;
      const r = 26 + rnd(i + 10) * 18;
      ctx.fillStyle = 'rgba(105,115,150,0.30)';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(80,88,125,0.22)';
      ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.45, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }

    // far hills in the rain haze
    ctx.fillStyle = 'rgba(95,105,145,0.22)';
    ctx.beginPath(); ctx.moveTo(f.x0, f.floor + 6);
    for (let i = 0; i <= 12; i++)
      ctx.lineTo(f.x0 + f.w * i / 12, f.floor - 30 - Math.abs(Math.sin(i * 1.3 + this.def.id)) * 34);
    ctx.lineTo(f.x1, f.floor + 6); ctx.closePath(); ctx.fill();

    // the wet ground
    floorBand(ctx, f, f.floor, [[0, '#aab4d4'], [0.4, '#8791b8'], [1, '#666f98']], 3, this.def.id);

    // cliffs rising at both sides of the floor
    const cliff = (left: boolean) => {
      const edge = left ? f.x0 : f.x1, dir = left ? 1 : -1, reach = f.w * 0.2, top = f.floor - 70;
      ctx.fillStyle = 'rgba(74,70,103,0.85)';
      ctx.beginPath();
      ctx.moveTo(edge, f.y1);
      ctx.lineTo(edge, top);
      ctx.lineTo(edge + dir * reach * 0.55, top - 6);
      ctx.lineTo(edge + dir * reach * 0.8, top + 22);
      ctx.lineTo(edge + dir * reach, f.floor + 4);
      ctx.lineTo(edge + dir * reach, f.y1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(30,26,52,0.35)'; ctx.lineWidth = 2;
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(edge, top + k * 20);
        ctx.lineTo(edge + dir * reach * (0.5 + k * 0.1), top + k * 20 + 6);
        ctx.stroke();
      }
      return { x: edge + dir * reach * 0.4, y: top - 3 };
    };
    cliff(true);
    const lh = cliff(false);

    // the lighthouse on the right-hand cliff, its beam sweeping the storm
    const lw = 16, lhH = 58, bx = lh.x, by = lh.y;
    const sweep = Math.sin(clock * 0.9);
    const beam = ctx.createLinearGradient(bx, 0, bx - 220 * Math.sign(sweep || 1), 0);
    beam.addColorStop(0, 'rgba(255,236,150,0.45)');
    beam.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.fillStyle = beam;
    const ly = by - lhH - 8, spread = 16 + 10 * Math.abs(sweep);
    ctx.beginPath();
    ctx.moveTo(bx, ly);
    ctx.lineTo(bx - 240 * sweep, ly - spread);
    ctx.lineTo(bx - 240 * sweep, ly + spread);
    ctx.closePath(); ctx.fill();
    for (let k = 0; k < 4; k++) {                    // red and white bands, narrowing upward
      const y = by - (k + 1) * lhH / 4, t = 1 - k * 0.07;
      ctx.fillStyle = k % 2 ? '#ffffff' : '#ef4b5c';
      ctx.fillRect(bx - lw / 2 * t, y, lw * t, lhH / 4);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(bx - lw / 2, by - lhH, lw, lhH);
    ctx.fillStyle = `rgba(255,230,120,${0.75 + 0.25 * Math.abs(sweep)})`;
    ctx.fillRect(bx - 6, ly - 6, 12, 12);
    ctx.strokeRect(bx - 6, ly - 6, 12, 12);
    ctx.fillStyle = '#ef4b5c';
    ctx.beginPath(); ctx.moveTo(bx - 9, ly - 6); ctx.lineTo(bx, ly - 16); ctx.lineTo(bx + 9, ly - 6); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // puddles on the floor, rippling under the rain
    for (let i = 0; i < 4; i++) {
      const px = f.x0 + f.w * (0.25 + i * 0.17 + (rnd(i + 40) - 0.5) * 0.06);
      const py = f.floor + 16 + rnd(i + 44) * 22;
      ctx.fillStyle = 'rgba(200,215,245,0.45)';
      ctx.beginPath(); ctx.ellipse(px, py, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
      const t = frac(clock * 0.8 + rnd(i + 48));
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(px + 4, py, 3 + t * 14, 1 + t * 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ================================================================ EGYPT */
export class Egypt extends Entity<Level> {
  readonly kind: EntityKind = 'egypt';

  draw({ ctx, clock }: DrawContext): void {
    const f = frame(), rnd = stream(this.def.id, 4.37);
    ctx.save();

    // the sun, low and hot over the sand
    const sx = f.x0 + f.w * (0.7 + rnd(1) * 0.15), sy = f.floor - 120;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160);
    glow.addColorStop(0, 'rgba(255,200,110,0.5)');
    glow.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = 'rgba(255,175,80,0.6)';
    ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();

    // birds gliding across
    ctx.strokeStyle = 'rgba(90,60,40,0.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const bx = f.x0 + frac(rnd(i + 5) + clock * 0.02 * (1 + i * 0.3)) * (f.w + 40) - 20;
      const by = f.y0 + f.h * (0.12 + i * 0.07) + Math.sin(clock + i) * 6;
      const flap = 3 + Math.sin(clock * 5 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by - flap); ctx.quadraticCurveTo(bx - 3, by - flap, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - flap, bx + 7, by - flap);
      ctx.stroke();
    }

    // three pyramids: a lit face and a shaded one, with stepped courses
    const base = f.floor + 8;
    const pyr = [
      { x: f.x0 + f.w * (0.5 + (rnd(2) - 0.5) * 0.1), h: 150 },
      { x: f.x0 + f.w * 0.2, h: 96 },
      { x: f.x0 + f.w * 0.8, h: 74 },
    ].sort((a, b) => a.h - b.h === 0 ? 0 : b.h - a.h);
    for (const p of pyr) {
      const half = p.h * 1.05, top = base - p.h;
      ctx.fillStyle = 'rgba(236,190,120,0.75)';               // the lit face
      ctx.beginPath(); ctx.moveTo(p.x - half, base); ctx.lineTo(p.x, top); ctx.lineTo(p.x + half * 0.2, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(196,138,78,0.75)';                // the shaded face
      ctx.beginPath(); ctx.moveTo(p.x + half * 0.2, base); ctx.lineTo(p.x, top); ctx.lineTo(p.x + half, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(150,95,45,0.35)'; ctx.lineWidth = 1.2;
      for (let y = top + 14; y < base; y += 12) {             // the courses of stone
        const k = (y - top) / p.h;
        ctx.beginPath(); ctx.moveTo(p.x - half * k, y); ctx.lineTo(p.x + half * k, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,215,90,0.9)';                 // a gold capstone
      ctx.beginPath(); ctx.moveTo(p.x - 7, top + 8); ctx.lineTo(p.x, top); ctx.lineTo(p.x + 7, top + 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(42,35,80,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x - half, base); ctx.lineTo(p.x, top); ctx.lineTo(p.x + half, base); ctx.stroke();
    }

    // an obelisk, gold-tipped, carved with marks
    const ox = f.x0 + f.w * (0.07 + rnd(3) * 0.05), oh = 110, ow = 14;
    ctx.fillStyle = 'rgba(214,160,100,0.85)'; ctx.strokeStyle = 'rgba(42,35,80,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox - ow / 2, base); ctx.lineTo(ox - ow * 0.35, base - oh); ctx.lineTo(ox + ow * 0.35, base - oh);
    ctx.lineTo(ox + ow / 2, base); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(ox - ow * 0.35, base - oh); ctx.lineTo(ox, base - oh - 12); ctx.lineTo(ox + ow * 0.35, base - oh);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(120,70,30,0.5)';
    for (let k = 0; k < 6; k++) ctx.fillRect(ox - 2, base - oh + 14 + k * 15, 4, 7);

    // the sand, and the Nile running along it
    floorBand(ctx, f, f.floor, [[0, '#ffe2ac'], [0.4, '#f3c781'], [1, '#e0a45c']], 5, this.def.id * 0.7);
    const ny = f.floor + 22;
    const nile = ctx.createLinearGradient(0, ny - 8, 0, ny + 12);
    nile.addColorStop(0, '#7fd3f0'); nile.addColorStop(1, '#3fa7d6');
    ctx.fillStyle = nile;
    ctx.beginPath(); ctx.moveTo(f.x0, ny + 12);
    for (let i = 0; i <= 20; i++) ctx.lineTo(f.x0 + f.w * i / 20, ny - 6 + Math.sin(i * 0.9 + this.def.id) * 3);
    ctx.lineTo(f.x1, ny + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {                              // the water glinting as it flows
      const gx = f.x0 + frac(rnd(k + 20) + clock * 0.04) * f.w;
      ctx.beginPath(); ctx.moveTo(gx, ny + 3); ctx.lineTo(gx + 14, ny + 3); ctx.stroke();
    }

    // palms on the river bank
    for (let k = 0; k < 2; k++) {
      const px = f.x0 + f.w * (0.33 + k * 0.4 + (rnd(k + 30) - 0.5) * 0.08), py = ny - 4;
      const lean = (k ? -1 : 1) * 8, top = py - 44;
      ctx.strokeStyle = 'rgba(130,85,45,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + lean, py - 24, px + lean * 0.6, top); ctx.stroke();
      const sway = Math.sin(clock * 1.2 + k) * 2;
      ctx.strokeStyle = 'rgba(60,160,80,0.9)'; ctx.lineWidth = 3.5;
      for (const a of [-2.6, -2.0, -1.2, -0.5, 0.1]) {
        const tx = px + lean * 0.6, ex = tx + Math.cos(a) * 20, ey = top + Math.sin(a) * 10 + 8 + sway;
        ctx.beginPath(); ctx.moveTo(tx, top); ctx.quadraticCurveTo((tx + ex) / 2, top - 6, ex, ey); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* ================================================================ SPACE */
export class Space extends Entity<Level> {
  readonly kind: EntityKind = 'space';

  draw({ ctx, clock }: DrawContext): void {
    const f = frame(), rnd = stream(this.def.id, 6.11);
    ctx.save();

    // nebula clouds glowing in the dark
    for (const [nx, ny, col, r] of [[f.x0 + f.w * 0.15, f.y0 + f.h * 0.28, '150,90,255', 240],
                                    [f.x0 + f.w * 0.85, f.y0 + f.h * 0.62, '255,90,170', 220],
                                    [f.x0 + f.w * 0.55, f.y0 + f.h * 0.1, '80,170,255', 180]] as const) {
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
      g.addColorStop(0, `rgba(${col},0.22)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(nx - r, ny - r, r * 2, r * 2);
    }

    // a field of tiny stars, and bigger ones that twinkle
    for (let i = 0; i < 70; i++) {
      const sx = f.x0 + f.w * rnd(i), sy = f.y0 + f.h * 0.9 * rnd(i + 200);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * rnd(i + 300)})`;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    for (let i = 0; i < 18; i++) {
      const sx = f.x0 + f.w * rnd(i + 400), sy = f.y0 + f.h * 0.85 * rnd(i + 450);
      const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(clock * (1.2 + rnd(i + 90)) + i * 1.7));
      ctx.fillStyle = i % 4 ? `rgba(220,215,255,${a})` : `rgba(255,215,120,${a})`;
      twinkle(ctx, sx, sy, 2.5 + rnd(i + 70) * 3);
    }

    // a shooting star every few seconds
    const cyc = 5.5, t = frac(clock / cyc), n = Math.floor(clock / cyc);
    if (t < 0.18) {
      const p = t / 0.18, r2 = stream(n, 1.3);
      const sx = f.x0 + f.w * (0.2 + r2(1) * 0.6) + p * 160, sy = f.y0 + 40 + r2(2) * 120 + p * 70;
      const tr = ctx.createLinearGradient(sx, sy, sx - 70, sy - 30);
      tr.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - p)})`);
      tr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = tr; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 70, sy - 30); ctx.stroke();
    }

    // a ringed planet in the top corner, half off the edge
    const px = f.x1 - 24, py = f.y0 + 70, pr = 52;
    const ring = (front: boolean) => {
      ctx.strokeStyle = 'rgba(255,205,120,0.9)'; ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.65, pr * 0.42, -0.35, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
    };
    ring(false);
    const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 4, px, py, pr);
    pg.addColorStop(0, '#ffd0b5'); pg.addColorStop(1, '#e8577e');
    ctx.fillStyle = pg; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,50,100,0.4)'; ctx.lineWidth = 4;
    for (const dy of [-16, 4]) {
      ctx.beginPath(); ctx.ellipse(px, py + dy, pr * 0.92, 6, 0, 0, Math.PI); ctx.stroke();
    }
    ring(true);

    // a little cratered moon on the other side
    const mx = f.x0 + 34, my = f.y0 + 120;
    const mg = ctx.createRadialGradient(mx - 6, my - 6, 2, mx, my, 20);
    mg.addColorStop(0, '#f1eeff'); mg.addColorStop(1, '#a9a2d6');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(90,80,150,0.4)';
    for (const [dx, dy, r] of [[-6, -5, 5], [7, 4, 4], [-2, 9, 3]] as const) {
      ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2); ctx.fill();
    }

    // a rocket climbing the left margin, round and round
    const span = 0 - f.x0;
    if (span >= 24) {
      const rx = f.x0 + span / 2, ry = f.y1 - frac(clock * 0.05) * (f.h + 80) + 40;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.fillStyle = `rgba(255,150,40,${0.6 + 0.4 * Math.sin(clock * 20)})`;
      ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(0, 22 + Math.sin(clock * 25) * 3); ctx.lineTo(4, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.quadraticCurveTo(8, -6, 6, 12); ctx.lineTo(-6, 12); ctx.quadraticCurveTo(-8, -6, 0, -16);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5ec8ff';
      ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4b5c';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 6, 4); ctx.lineTo(s * 11, 13); ctx.lineTo(s * 6, 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    // the cratered moon floor, catching a little starlight
    floorBand(ctx, f, f.floor, [[0, '#6e6a9e'], [0.35, '#4d4a7c'], [1, '#2f2c58']], 3, this.def.id);
    for (let i = 0; i < 7; i++) {
      const cx = f.x0 + f.w * (i + 0.3 + rnd(i + 110) * 0.4) / 7;
      const cy = f.floor + 14 + rnd(i + 120) * (f.y1 - f.floor - 22);
      const r = 6 + rnd(i + 130) * 9;
      ctx.fillStyle = 'rgba(20,18,45,0.45)';
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,195,255,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, cy + 1, r, r * 0.38, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    }
    ctx.restore();
  }
}
