/* THUMBNAILS - the portal cover art, drawn with the game's own cup, obstacle
   and ramp painters so the art matches what the player gets.
   Built by tools/thumbs (esbuild -> iife), rendered headless at each size. */
import { drawCupBack, drawCupFront } from '../src/entities/Cup';
import { drawObstacle } from '../src/entities/Obstacle';
import { drawSeg } from '../src/render/primitives';
import { RAMP, INK, BALL } from '../src/render/palette';

type P = [number, number];

/* THE SCENE, in a 1000 x 1000 unit box: three ramps zig-zag the ball down
   the screen into a glass of water. The ball hangs just over the mouth, the
   moment before it drops in; the cursor hand rests at the ramp it just drew. */
const START: P = [150, 50];
const RAMPS: [P, P][] = [
  [[60, 170], [560, 300]],
  [[900, 390], [420, 520]],
  [[100, 610], [560, 745]],
];
const CUP: P = [760, 870]; const CUP_R = 112;
const BR = 44, RT = 18;                           // ball radius, ramp half-thickness
const HAND: P = [104, 628];                        // fingertip, at R3's left end
const BALL_AT: P = [756, CUP[1] - CUP_R - BR * 0.45];

interface Layout {
  W: number; H: number;
  box: { x: number; y: number; s: number };      // where the scene sits, and its scale
  title?: { x: number; y: number; size: number; sub: number; maxW: number };
}

const LAYOUTS: Record<string, Layout> = {
  landscape: { W: 1920, H: 1080, box: { x: 930, y: 40, s: 0.95 },
    title: { x: 450, y: 640, size: 176, sub: 72, maxW: 800 } },
  portrait: { W: 800, H: 1200, box: { x: 40, y: 40, s: 0.82 },
    title: { x: 400, y: 1030, size: 128, sub: 54, maxW: 740 } },
  square: { W: 800, H: 800, box: { x: 150, y: 10, s: 0.56 },
    title: { x: 400, y: 655, size: 100, sub: 42, maxW: 740 } },
  itch: { W: 1260, H: 1000, box: { x: 313, y: 10, s: 0.66 },
    title: { x: 630, y: 790, size: 150, sub: 62, maxW: 1100 } },
  gd512: { W: 512, H: 512, box: { x: 112, y: 4, s: 0.37 },
    title: { x: 256, y: 405, size: 62, sub: 27, maxW: 470 } },
  gd384: { W: 512, H: 384, box: { x: 160, y: 2, s: 0.255 },
    title: { x: 256, y: 322, size: 52, sub: 22, maxW: 470 } },
  gd200: { W: 200, H: 120, box: { x: 40, y: 2, s: 0.115 } },
  gdwide: { W: 1280, H: 550, box: { x: 690, y: 6, s: 0.52 },
    title: { x: 350, y: 250, size: 120, sub: 50, maxW: 620 } },
  icon: { W: 512, H: 512, box: { x: 8, y: 4, s: 0.5 } },
};

function sky(ctx: CanvasRenderingContext2D, L: Layout): void {
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, '#7fd0ff'); g.addColorStop(0.55, '#cdeeff'); g.addColorStop(1, '#fff3da');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
  // soft rays
  ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath(); ctx.moveTo(L.W * 0.5, -L.H * 0.2);
    const a = -0.3 + i * 0.35;
    ctx.arc(L.W * 0.5, -L.H * 0.2, L.W * 1.6, Math.PI / 2 + a, Math.PI / 2 + a + 0.15); ctx.fill();
  }
  ctx.restore();
  // clouds
  const cloud = (x: number, y: number, s: number) => {
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    for (const [dx, dy, r] of [[0, 0, 1], [0.9, -0.35, 0.8], [1.7, 0, 0.9], [0.9, 0.2, 0.9]] as const) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
    }
  };
  cloud(L.W * 0.08, L.H * 0.42, L.H * 0.035); cloud(L.W * 0.86, L.H * 0.1, L.H * 0.04);
  // hills
  const hill = (y: number, col: string, amp: number, ph: number) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, L.H);
    for (let x = 0; x <= L.W; x += 10) ctx.lineTo(x, y + Math.sin(x / L.W * 5 + ph) * amp);
    ctx.lineTo(L.W, L.H); ctx.closePath(); ctx.fill();
  };
  hill(L.H * 0.86, '#a8e07f', L.H * 0.03, 0.5);
  hill(L.H * 0.93, '#7cc95a', L.H * 0.02, 2.1);
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save(); ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4);
  glow.addColorStop(0, 'rgba(255,214,90,.55)'); glow.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, BALL.hi); g.addColorStop(0.45, BALL.mid); g.addColorStop(1, BALL.edge);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.14); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}


/* The point a ball resting on ramp `r` would have its centre at, over x. */
function onRamp(r: [P, P], x: number): P {
  const [[x1, y1], [x2, y2]] = r;
  const t = (x - x1) / (x2 - x1), y = y1 + (y2 - y1) * t;
  const len = Math.hypot(x2 - x1, y2 - y1);
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  if (ny > 0) { nx = -nx; ny = -ny; }             // the side facing up
  return [x + nx * (RT + 16), y + ny * (RT + 16)];
}

/* The ball's route as a polyline: drop, roll, hop, roll, hop, roll, over the cup. */
function route(): P[] {
  const pts: P[] = [];
  const quad = (a: P, c: P, b: P, n = 14) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
                (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
    }
  };
  const line = (a: P, b: P, n = 16) => { for (let i = 1; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } };
  pts.push(START);
  const l1 = onRamp(RAMPS[0], START[0]); line(START, l1, 8);
  const e1 = onRamp(RAMPS[0], RAMPS[0][1][0] - 10); line(l1, e1);
  const l2 = onRamp(RAMPS[1], 700); quad(e1, [660, e1[1] - 10], l2);
  const e2 = onRamp(RAMPS[1], RAMPS[1][1][0] + 10); line(l2, e2);
  const l3 = onRamp(RAMPS[2], 330); quad(e2, [360, e2[1] - 10], l3);
  const e3 = onRamp(RAMPS[2], RAMPS[2][1][0] - 10); line(l3, e3);
  quad(e3, [720, e3[1] - 60], [BALL_AT[0], BALL_AT[1] - BR]);
  return pts;
}

/* White dots along the route, evenly spaced, growing toward the ball. */
function trail(ctx: CanvasRenderingContext2D): void {
  const pts = route();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1], step = 46;
  let j = 0;
  for (let d = BR * 1.6; d < total - BR * 1.8; d += step) {
    while (cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j]);
    const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
    const k = d / total;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(x, y, 6 + 5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

/* The pointer hand everybody knows from a mouse cursor: a white glove, index
   finger up, fingertip at the origin. Drawn as a union - every piece stroked
   fat in ink first, then every piece filled white over it - so it reads as
   one clean outlined shape. */
function cursorHand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const parts = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.roundRect(-15, 0, 30, 112, 15);              // index finger
    c.roundRect(13, 58, 28, 62, 14);               // middle, folded
    c.roundRect(39, 66, 26, 56, 13);               // ring
    c.roundRect(63, 76, 22, 48, 11);               // little
    c.roundRect(-15, 92, 100, 86, [10, 10, 30, 30]); // palm
    c.roundRect(-3, 172, 80, 30, 6);               // cuff
  };
  const thumb = (c: CanvasRenderingContext2D) => {
    c.save(); c.translate(-8, 140); c.rotate(-0.95);
    c.beginPath(); c.roundRect(-14, -66, 28, 74, 14); c.restore();
  };
  // shadow
  ctx.save(); ctx.translate(8, 10); ctx.fillStyle = 'rgba(42,35,80,.25)';
  parts(ctx); ctx.fill(); thumb(ctx); ctx.fill(); ctx.restore();
  // outline, then fill
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 16;
  parts(ctx); ctx.stroke(); thumb(ctx); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  parts(ctx); ctx.fill(); thumb(ctx); ctx.fill();
  // cuff tint and the creases between fingers
  ctx.fillStyle = '#dfe8ff'; ctx.beginPath(); ctx.roundRect(-3, 172, 80, 30, 6); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3, 172); ctx.lineTo(77, 172); ctx.stroke();
  for (const [cx, y0, y1] of [[15, 66, 104], [40, 76, 108], [64, 86, 112]] as const) {
    ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke();
  }
  // a little tap burst at the fingertip
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8;
  for (const a of [-2.6, -1.9, -1.2]) {
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); ctx.stroke();
  }
  ctx.restore();
}

/* Short streaks over the ball: it is falling, straight in. */
function fallLines(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.95)';
  for (const [dx, l] of [[-0.55, 1.1], [0, 1.5], [0.55, 1.1]] as const) {
    ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.moveTo(x + dx * r, y - r * 1.35); ctx.lineTo(x + dx * r, y - r * (1.35 + l)); ctx.stroke();
  }
  ctx.restore();
}

function chunky(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number,
                fill: [string, string], font: string): void {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  const w = ctx.measureText(text).width;
  const sc = Math.min(1, maxW / w);
  ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // drop shadow
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = size * 0.22;
  ctx.strokeText(text, 0, size * 0.08); ctx.fillText(text, 0, size * 0.08);
  ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.45);
  g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  // gloss
  ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.rect(-w, -size * 0.55, w * 2, size * 0.32); ctx.clip(); ctx.fillText(text, 0, 0); ctx.restore();
  ctx.restore();
}

function titleBlock(ctx: CanvasRenderingContext2D, L: Layout): void {
  const t = L.title!;
  chunky(ctx, 'BALL TO CUP', t.x, t.y, t.size, t.maxW, ['#ffe066', '#ff8a1e'], "'Lilita One', 'Baloo 2', sans-serif");
  // the subtitle on a blue ribbon - blue like the ramp you draw
  ctx.save();
  ctx.font = `${t.sub}px 'Lilita One', sans-serif`;
  const label = 'DRAW THE RAMP!';
  const w = ctx.measureText(label).width + t.sub * 1.4, h = t.sub * 1.35;
  const y = t.y + t.size * 0.78;
  ctx.translate(t.x, y); ctx.rotate(-0.025);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + 7, w, h, h / 2); ctx.fill();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#5fb6ff'); g.addColorStop(1, RAMP.base);
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
  ctx.lineWidth = Math.max(4, t.sub * 0.1); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, t.sub * 0.04);
  ctx.restore();
}

function render(name: string): void {
  const L = LAYOUTS[name];
  const c = document.createElement('canvas'); c.width = L.W; c.height = L.H; c.id = 'c';
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  sky(ctx, L as any);
  ctx.save(); ctx.translate(L.box.x, L.box.y); ctx.scale(L.box.s, L.box.s);
  // where the ball started: a faint ghost at the top
  ctx.save(); ctx.globalAlpha = 0.4; ball(ctx, START[0], START[1], BR * 0.85); ctx.restore();
  ctx.save(); ctx.translate(CUP[0], CUP[1]); drawCupBack(ctx, CUP_R, 'meadow', 0.6); ctx.restore();
  for (const [[x1, y1], [x2, y2]] of RAMPS)
    drawSeg(ctx, { x1, y1, x2, y2 }, RT, { fill: RAMP.base, shine: 'rgba(255,255,255,.75)', outline: 6, shadow: true });
  trail(ctx);
  fallLines(ctx, BALL_AT[0], BALL_AT[1], BR);
  ball(ctx, BALL_AT[0], BALL_AT[1], BR);
  ctx.save(); ctx.translate(CUP[0], CUP[1]); drawCupFront(ctx, CUP_R, 'meadow', 0.6); ctx.restore();
  cursorHand(ctx, HAND[0], HAND[1], 0.85, 0.45);
  ctx.restore();
  if (L.title) titleBlock(ctx, L as any);
}

(window as any).render = render;
