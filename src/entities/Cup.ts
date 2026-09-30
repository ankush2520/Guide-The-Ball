/* ============================================================
   THE CUP - what the target looks like

   The goal used to be a bullseye. It is now a CUP the ball drops
   into, and every world has its own cup, so the goal belongs to
   the place: a daisy cup in the meadow, a basalt cup with lava in
   its cracks, a wooden barrel-cup in the peaks, a storm-steel cup
   with a bolt on it, a coral shell under the sea, a gold cup
   in Egypt and a neon capsule in space.

   THE CUP IS REAL. Its sides and floor are solid in the physics
   and the ball can only get in over the rim (levels/cup holds the
   shape both sides share). The outline drawn here is that same
   shape, walls and all, so the cup you see is the cup you hit -
   which is also why no cup has a handle: a handle the ball flew
   through would be a lie.

   GREEN IS STILL THE GOAL. Whatever the cup is made of, its mouth
   glows green and the halo round it is green - the one colour the
   board reserves for "land here" never leaves the target.

   TWO HALVES. The cup is painted in two passes so a ball can fall
   INTO it: drawCupBack() is the halo and the inside of the mouth,
   drawCupFront() is the body and the front lip. Normally both go
   down together; during a capture the renderer puts the ball
   between them, so the front of the cup covers the ball as it
   sinks in.

   All sizes are fractions of r, so a 27-unit target and a 46-unit
   one get the same cup.
   ============================================================ */
import { INK } from '../render/palette';
import { TARGET_GLOW } from '../render/glow';
import type { Country } from '../levels/types';
import { CUP } from '../levels/cup';

export type CupTheme = 'meadow' | 'volcano' | 'mountains' | 'cliffs' | 'reef' | 'egypt' | 'space';

/** The world's cup. The reef is the one world with no painted scene. */
export function cupThemeOf(country: Pick<Country, 'scene'> | null | undefined): CupTheme {
  return country?.scene ?? 'reef';
}

/* The silhouette, in units of r. The mouth sits above the centre and the
   base below it, so the whole cup fits the target's circle. */
export const MOUTH_Y = CUP.mouthY;
const MOUTH_RX = CUP.mouthHX;
const MOUTH_RY = 0.27;

interface Look {
  body: [string, string, string];   // gradient, left to right
  rim: string;                      // the front lip
  inner: string;                    // the dark inside of the mouth
}

const LOOKS: Record<CupTheme, Look> = {
  meadow:    { body: ['#fffaf0', '#f6ecd4', '#d9c9a3'], rim: '#8fd46a', inner: '#1f5a33' },
  volcano:   { body: ['#5a3d3f', '#35242a', '#1c1216'], rim: '#ff8a2a', inner: '#2a0f0a' },
  mountains: { body: ['#dca067', '#b87838', '#7f4f22'], rim: '#9aa3b5', inner: '#2e2014' },
  cliffs:    { body: ['#eef2fa', '#b7c1d6', '#7d88a3'], rim: '#ffd23a', inner: '#1d2340' },
  reef:      { body: ['#ffc0cc', '#ff8aa3', '#d9507a'], rim: '#fff0c8', inner: '#3a1030' },
  egypt:     { body: ['#fff0a0', '#f2c53d', '#b8860b'], rim: '#ffe36e', inner: '#3a2606' },
  space:     { body: ['#f2f4ff', '#b8bfe6', '#6c75a8'], rim: '#38f0ff', inner: '#0b0f2e' },
};

/* ------------------------------------------------------------ */

/* Straight tapered sides and a flat floor - exactly the three bars the
   physics has (levels/cup), so the ball bounces off what it looks like it
   hits. The floor's slight curve stays inside the bar's thickness. */
function bodyPath(ctx: CanvasRenderingContext2D, r: number): void {
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;
  const bx = CUP.baseHX * r, by = CUP.baseY * r;
  ctx.beginPath();
  ctx.moveTo(-rx, my);
  ctx.lineTo(-bx, by - r * 0.04);
  ctx.quadraticCurveTo(0, by + r * 0.06, bx, by - r * 0.04);
  ctx.lineTo(rx, my);
  // the FRONT half of the mouth closes it, so the inside shows above it
  ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
}

/* ============================================================
   BACK: halo, the inside of the mouth, and a gift sitting in it
   ============================================================ */
export function drawCupBack(ctx: CanvasRenderingContext2D, r: number, theme: CupTheme, clock: number): void {
  const L = LOOKS[theme];
  const pulse = 0.5 + 0.5 * Math.sin(clock * 2.3);
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;

  // the green halo - the goal's colour, whatever the cup is made of
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * TARGET_GLOW);
  halo.addColorStop(0, `rgba(47,201,90,${0.20 + pulse * 0.14})`);
  halo.addColorStop(1, 'rgba(47,201,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * TARGET_GLOW, 0, Math.PI * 2); ctx.fill();

  // the inside of the mouth, with the goal glowing up out of it
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = L.inner; ctx.fill();
  const glow = ctx.createRadialGradient(0, my + ry * 0.3, 0, 0, my, rx);
  glow.addColorStop(0, `rgba(127,227,154,${0.75 + pulse * 0.2})`);
  glow.addColorStop(0.6, `rgba(47,201,90,${0.35 + pulse * 0.15})`);
  glow.addColorStop(1, 'rgba(47,201,90,0)');
  ctx.fillStyle = glow; ctx.fill();
  // the back lip
  ctx.lineWidth = r * 0.12; ctx.strokeStyle = L.rim;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

  // breathing ring rising off the mouth: "drop it in here"
  const bk = (clock % 1.9) / 1.9;
  ctx.strokeStyle = `rgba(23,150,61,${(1 - bk) * 0.55})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, my - bk * r * 0.5, rx * (1 + bk * 0.35), ry * (1 + bk * 0.35), 0, 0, Math.PI * 2);
  ctx.stroke();
}

/* ============================================================
   FRONT: the body, its world's decoration, the front lip
   ============================================================ */
export function drawCupFront(ctx: CanvasRenderingContext2D, r: number, theme: CupTheme, clock: number): void {
  const L = LOOKS[theme];
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;

  // body
  const g = ctx.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, L.body[0]); g.addColorStop(0.45, L.body[1]); g.addColorStop(1, L.body[2]);
  ctx.fillStyle = g;
  bodyPath(ctx, r); ctx.fill();

  // decoration, clipped to the body so nothing spills off the cup
  ctx.save();
  bodyPath(ctx, r); ctx.clip();
  DECOR[theme](ctx, r, clock, L);
  // one soft gloss down the left side - every cup is shiny
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.55, my + r * 0.55, r * 0.1, r * 0.38, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the one pen round the body
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  bodyPath(ctx, r); ctx.stroke();

  // the front lip, over everything
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.16; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
  ctx.lineWidth = r * 0.10; ctx.strokeStyle = L.rim;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
  ctx.lineCap = 'butt';

  if (theme === 'reef') bubbles(ctx, r, clock);
  if (theme === 'space') sparkles(ctx, r, clock);
}

/* ------------------------------------------------------------ */

type Decor = (ctx: CanvasRenderingContext2D, r: number, clock: number, L: Look) => void;

const DECOR: Record<CupTheme, Decor> = {
  /* a cream cup with a leaf-green band and daisies */
  meadow: (ctx, r) => {
    ctx.fillStyle = '#6cc24a';
    ctx.fillRect(-r * 1.2, r * 0.42, r * 2.4, r * 0.14);
    for (const [x, y, s] of [[-0.35, 0.02, 1], [0.3, 0.12, 0.8], [-0.02, -0.12, 0.6]] as const) {
      daisy(ctx, x * r, y * r, r * 0.13 * s);
    }
  },
  /* basalt with lava glowing in its cracks */
  volcano: (ctx, r, clock) => {
    const heat = 0.6 + 0.4 * Math.sin(clock * 2.1);
    ctx.save();
    ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = r * 0.25 * heat;
    ctx.strokeStyle = `rgba(255,${120 + heat * 60 | 0},30,${0.75 + heat * 0.25})`;
    ctx.lineWidth = r * 0.06; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.3, r * 0.05); ctx.lineTo(-r * 0.38, r * 0.35); ctx.lineTo(-r * 0.12, r * 0.7);
    ctx.moveTo(-r * 0.3, r * 0.05); ctx.lineTo(r * 0.05, r * 0.12);
    ctx.moveTo(r * 0.55, -r * 0.25); ctx.lineTo(r * 0.3, r * 0.1); ctx.lineTo(r * 0.45, r * 0.45);
    ctx.stroke();
    ctx.restore();
    // a warm wash rising from the bottom
    const w = ctx.createLinearGradient(0, r, 0, 0);
    w.addColorStop(0, `rgba(255,90,20,${0.35 * heat})`); w.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = w; ctx.fillRect(-r * 1.2, -r, r * 2.4, r * 2);
  },
  /* a wooden tankard: planks and two iron hoops */
  mountains: (ctx, r) => {
    ctx.strokeStyle = 'rgba(90,50,20,.55)'; ctx.lineWidth = 1.5;
    for (const x of [-0.55, -0.2, 0.15, 0.5]) {
      ctx.beginPath(); ctx.moveTo(x * r, -r); ctx.lineTo(x * r * 0.92, r); ctx.stroke();
    }
    for (const y of [-0.12, 0.52]) {
      ctx.fillStyle = '#8c95a8'; ctx.fillRect(-r * 1.2, y * r, r * 2.4, r * 0.13);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-r * 1.2, y * r, r * 2.4, r * 0.04);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.strokeRect(-r * 1.2, y * r, r * 2.4, r * 0.13);
      ctx.fillStyle = INK;
      for (const x of [-0.45, 0.45]) { ctx.beginPath(); ctx.arc(x * r, (y + 0.065) * r, r * 0.03, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  /* storm steel with a bolt that flashes now and then */
  cliffs: (ctx, r, clock) => {
    const flash = (clock % 3.2) < 0.12 ? 1 : 0;
    ctx.fillStyle = 'rgba(40,50,90,.18)';
    ctx.fillRect(-r * 1.2, r * 0.5, r * 2.4, r * 0.4);
    ctx.save();
    if (flash) { ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = r * 0.5; }
    ctx.beginPath();
    ctx.moveTo(r * 0.08, -r * 0.2); ctx.lineTo(-r * 0.2, r * 0.18); ctx.lineTo(-r * 0.02, r * 0.18);
    ctx.lineTo(-r * 0.12, r * 0.55); ctx.lineTo(r * 0.22, r * 0.08); ctx.lineTo(r * 0.03, r * 0.08);
    ctx.closePath();
    ctx.fillStyle = flash ? '#fffbe0' : '#ffd23a'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  },
  /* a coral shell: curved ridges and a pearl */
  reef: (ctx, r) => {
    ctx.strokeStyle = 'rgba(160,30,70,.45)'; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.28, MOUTH_Y * r);
      ctx.quadraticCurveTo(i * r * 0.2, r * 0.3, i * r * 0.08, r * 0.8);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.12, 0, Math.PI * 2);
    const p = ctx.createRadialGradient(-r * 0.04, r * 0.16, 1, 0, r * 0.2, r * 0.12);
    p.addColorStop(0, '#ffffff'); p.addColorStop(1, '#d8d2ff');
    ctx.fillStyle = p; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
  },
  /* a gold cup with a lapis band, an eye, and a banded foot */
  egypt: (ctx, r) => {
    ctx.fillStyle = '#1f4fa8';
    ctx.fillRect(-r * 1.2, r * 0.6, r * 2.4, r * 0.1);
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(-r * 1.2, r * 0.7, r * 2.4, r * 0.2);
    ctx.fillStyle = '#1f4fa8';
    ctx.fillRect(-r * 1.2, -r * 0.2, r * 2.4, r * 0.24);
    ctx.fillStyle = '#ffe36e';
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.arc(i * r * 0.2, -r * 0.08, r * 0.035, 0, Math.PI * 2); ctx.fill(); }
    // the eye
    ctx.lineWidth = 2; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, r * 0.14, r * 0.2, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8dc'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, r * 0.14, r * 0.06, 0, Math.PI * 2); ctx.fillStyle = '#1f4fa8'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 0.05, r * 0.22); ctx.lineTo(-r * 0.1, r * 0.3); ctx.stroke();
  },
  /* chrome with a neon band and blinking lights */
  space: (ctx, r, clock) => {
    const hum = 0.6 + 0.4 * Math.sin(clock * 3);
    ctx.save();
    ctx.shadowColor = '#38f0ff'; ctx.shadowBlur = r * 0.3 * hum;
    ctx.fillStyle = `rgba(56,240,255,${0.6 + 0.4 * hum})`;
    ctx.fillRect(-r * 1.2, r * 0.08, r * 2.4, r * 0.1);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const on = Math.floor(clock * 2 + i) % 3 === 0;
      ctx.beginPath(); ctx.arc((i - 1) * r * 0.32, r * 0.42, r * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ff5ce1' : '#5a3a7a'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
    }
  },
};

function daisy(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(42,35,80,.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, s * 0.4, a, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#ffc53a'; ctx.fill(); ctx.stroke();
}

/* bubbles rising out of the reef shell */
function bubbles(ctx: CanvasRenderingContext2D, r: number, clock: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const k = ((clock * 0.5 + i / 3) % 1);
    const x = (i - 1) * r * 0.35 + Math.sin(clock * 3 + i) * r * 0.06;
    const y = MOUTH_Y * r - k * r * 0.9;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(x, y, r * (0.05 + 0.03 * k), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* a few twinkles around the space cup's rim */
function sparkles(ctx: CanvasRenderingContext2D, r: number, clock: number): void {
  ctx.fillStyle = '#bff9ff';
  for (let i = 0; i < 4; i++) {
    const tw = Math.max(0, Math.sin(clock * 2.4 + i * 1.7));
    if (tw < 0.2) continue;
    const a = -Math.PI + i * 0.9 + 0.4;
    const x = Math.cos(a) * r * 1.1, y = MOUTH_Y * r + Math.sin(a) * r * 0.5;
    const s = r * 0.09 * tw;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.3); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.3);
    ctx.closePath(); ctx.fill();
  }
}

