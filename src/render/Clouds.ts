/* ============================================================
   ATMOSPHERE - daytime: drifting clouds and a few twinkles

   The light-sky counterpart of Starfield.ts, built the same way:
   fixed positions seeded once, so the sky is identical on every
   load and device, and nothing but plain arcs and lines - no
   shadow, no blur, no images.

   Kept deliberately quiet. The clouds are pale on a pale board
   and carry no outline, so they can never be mistaken for
   something the ball interacts with; every shape that matters
   is the one wearing the ink line.
   ============================================================ */
import { H, BOARD } from '../physics/constants';
import { mulberry32 } from '../physics/math';

export const CLOUD_N = 6;
export const TWINKLE_N = 14;

/* `sx` is 0..1 across the board, as the star field does it: the board is
   wider on a tablet, and absolute positions would leave its margins bare. */
interface Cloud { sx: number; y: number; s: number; drift: number; bob: number; phase: number; }
interface Twinkle { sx: number; y: number; r: number; tw: number; phase: number; }

const CLOUDS: Cloud[] = (() => {
  const r = mulberry32(0xc10d);
  const out: Cloud[] = [];
  for (let i = 0; i < CLOUD_N; i++)
    out.push({ sx: r(), y: 40 + (i / CLOUD_N) * (H - 120) + r() * 50,
               s: 0.7 + r() * 0.7,
               drift: 3 + r() * 5,             // px/sec sideways - barely motion
               bob: 1.5 + r() * 2, phase: r() * Math.PI * 2 });
  return out;
})();

const TWINKLES: Twinkle[] = (() => {
  const r = mulberry32(0x7117);
  const out: Twinkle[] = [];
  for (let i = 0; i < TWINKLE_N; i++)
    out.push({ sx: r(), y: r() * H, r: 2.5 + r() * 2.5,
               tw: 0.6 + r() * 1.2, phase: r() * Math.PI * 2 });
  return out;
})();

/* One lobe, added to the path already open. moveTo first: starting ON the
   circle is what stops a sliver joining it to the previous lobe. */
function lobe(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/* A cloud is four overlapping circles on a flat base, filled as ONE path so
   the overlaps do not double up the alpha. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const w = 34 * s;
  ctx.beginPath();
  /* The four lobes, written out rather than looped over a literal: this runs
     six times a frame forever, and the array of tuples it used to build was
     garbage created for no other reason than to be iterated once. */
  lobe(ctx, x - w * 0.55, y + 4 * s, 11 * s);
  lobe(ctx, x - w * 0.15, y - 5 * s, 16 * s);
  lobe(ctx, x + w * 0.30, y - 2 * s, 13 * s);
  lobe(ctx, x + w * 0.70, y + 5 * s, 10 * s);
  ctx.rect(x - w * 0.55, y + 4 * s, w * 1.25, 11 * s);
  ctx.fill('nonzero');
}

export function drawClouds(ctx: CanvasRenderingContext2D, clock: number): void {
  ctx.save();
  const span = BOARD.w + 160;
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  for (const c of CLOUDS) {
    // drift right forever and wrap, entering from off the left edge
    const x = BOARD.x0 - 80 + ((c.sx * span + clock * c.drift) % span);
    const y = c.y + Math.sin(clock * 0.4 + c.phase) * c.bob;
    puff(ctx, x, y, c.s);
  }

  // four-point twinkles, fading in and out on their own clocks
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  for (const t of TWINKLES) {
    const k = 0.5 + 0.5 * Math.sin(clock * t.tw + t.phase);
    if (k < 0.15) continue;
    const x = BOARD.x0 + t.sx * BOARD.w, r = t.r * (0.6 + 0.4 * k);
    ctx.globalAlpha = 0.25 + 0.6 * k;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - r, t.y); ctx.lineTo(x + r, t.y);
    ctx.moveTo(x, t.y - r); ctx.lineTo(x, t.y + r);
    ctx.stroke();
  }
  ctx.restore();
}
