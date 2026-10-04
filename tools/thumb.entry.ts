/* THUMBNAILS - the portal cover art, drawn with the game's own cup, obstacle
   and ramp painters so the art matches what the player gets.
   Built by tools/thumbs (esbuild -> iife), rendered headless at each size. */
import { drawCupBack, drawCupFront } from '../src/entities/Cup';
import { drawObstacle } from '../src/entities/Obstacle';
import { drawSeg } from '../src/render/primitives';
import { RAMP, INK, BALL } from '../src/render/palette';

type P = [number, number];
interface Layout {
  W: number; H: number; k: number;              // canvas size, art scale
  title?: { x: number; y: number; size: number; sub: number; maxW: number };
  ramp: [P, P];                                  // the drawn ramp
  ball: P;                                       // the ball, rolling on the ramp
  drop: P;                                       // where the ball fell from
  arc: P[];                                      // the flight from ramp to cup (control pts)
  cup: P; cupR: number;
  hand: P;                                       // the finger that drew the ramp
  obstacles: P[]; star?: P;
}

const LAYOUTS: Record<string, Layout> = {
  landscape: { W: 1920, H: 1080, k: 1,
    title: { x: 960, y: 175, size: 190, sub: 78, maxW: 1700 },
    drop: [430, 300], ramp: [[330, 470], [1080, 700]], ball: [700, 556],
    arc: [[1080, 700], [1430, 540], [1500, 690]], cup: [1500, 860], cupR: 150,
    hand: [1090, 712], obstacles: [[880, 440], [1230, 450]], star: [1300, 618] },
  portrait: { W: 800, H: 1200, k: 0.62,
    title: { x: 400, y: 150, size: 128, sub: 54, maxW: 740 },
    drop: [170, 380], ramp: [[110, 520], [560, 720]], ball: [330, 610],
    arc: [[560, 720], [700, 690], [615, 855]], cup: [610, 1000], cupR: 116,
    hand: [562, 736], obstacles: [[470, 520], [160, 860]], star: [668, 742] },
  square: { W: 800, H: 800, k: 0.55,
    title: { x: 400, y: 110, size: 104, sub: 44, maxW: 740 },
    drop: [150, 250], ramp: [[90, 360], [500, 520]], ball: [290, 438],
    arc: [[500, 520], [650, 470], [645, 585]], cup: [645, 690], cupR: 90,
    hand: [504, 536], obstacles: [[420, 300], [130, 560]], star: [612, 478] },
  icon: { W: 512, H: 512, k: 0.42,
    drop: [100, 50], ramp: [[50, 150], [290, 250]], ball: [160, 196],
    arc: [[290, 250], [400, 205], [410, 315]], cup: [410, 405], cupR: 70,
    hand: [292, 256], obstacles: [[300, 120]], star: [380, 222] },
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
  cloud(L.W * 0.08, L.H * 0.42, 34 * L.k + 10); cloud(L.W * 0.78, L.H * 0.36, 40 * L.k + 10);
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

function speedLines(ctx: CanvasRenderingContext2D, L: Layout, r: number): void {
  const [[x1, y1], [x2, y2]] = L.ramp, [bx, by] = L.ball;
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * r * 0.7, back = r * (2.2 + i * 0.5);
    ctx.strokeStyle = `rgba(255,255,255,${0.9 - i * 0.2})`; ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(bx - ux * r * 1.3 - uy * off, by - uy * r * 1.3 + ux * off - r * 0.2);
    ctx.lineTo(bx - ux * (r * 1.3 + back) - uy * off, by - uy * (r * 1.3 + back) + ux * off - r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function dotted(ctx: CanvasRenderingContext2D, pts: P[], r: number, col = '#ffffff'): void {
  const [a, c, b] = pts;
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath(); ctx.arc(x, y, r * (0.22 + 0.1 * t), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // arrow head into the cup
  const t = 0.97, t2 = 0.9;
  const P = (t: number) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const [x, y] = P(t), [px, py] = P(t2), ang = Math.atan2(y - py, x - px), s = r * 0.9;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.lineTo(-s * 0.6, s * 0.7); ctx.closePath();
  ctx.fillStyle = '#2fc95a'; ctx.fill(); ctx.lineWidth = Math.max(3, r * 0.14); ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
}

function dropLine(ctx: CanvasRenderingContext2D, L: Layout, r: number): void {
  const [dx, dy] = L.drop, [rx, ry] = L.ramp[0];
  ctx.save(); ctx.setLineDash([r * 0.3, r * 0.45]); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(42,35,80,.45)'; ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.moveTo(dx, dy + r * 1.3); ctx.lineTo(dx, ry + (dx - rx) * ((L.ramp[1][1] - ry) / (L.ramp[1][0] - rx)) - r * 1.2); ctx.stroke();
  ctx.restore();
  // the spawn: a faint ball outline where it dropped from
  ctx.save(); ctx.globalAlpha = 0.45; ball(ctx, dx, dy, r * 0.75); ctx.restore();
}

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  // a big friendly PENCIL drawing the ramp: its tip at (x, y), coming in from the bottom-left
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.62); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK;
  // sparkles where it draws
  ctx.fillStyle = '#ffffff';
  for (const [a, l] of [[-2.5, 30], [-1.9, 38], [-1.3, 30]] as const) {
    ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.roundRect(14, -3, l, 6, 3); ctx.fill(); ctx.restore();
  }
  const w = 44;                                   // body width; the pencil runs down +y
  // wood cone and graphite point
  ctx.fillStyle = '#f6d3a1';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w / 2, 58); ctx.lineTo(-w / 2, 58); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3550';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 18); ctx.lineTo(-8, 18); ctx.closePath(); ctx.fill();
  // the painted body, in three faces
  const body = (x0: number, x1: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x0, 58, x1 - x0, 170); };
  body(-w / 2, -w / 6, '#ffd84a'); body(-w / 6, w / 6, '#ffc21a'); body(w / 6, w / 2, '#f0a400');
  ctx.beginPath(); ctx.rect(-w / 2, 58, w, 170); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(42,35,80,.35)';
  for (const xx of [-w / 6, w / 6]) { ctx.beginPath(); ctx.moveTo(xx, 58); ctx.lineTo(xx, 228); ctx.stroke(); }
  ctx.lineWidth = 6; ctx.strokeStyle = INK;
  // metal band
  ctx.fillStyle = '#c9cfdc'; ctx.beginPath(); ctx.rect(-w / 2 - 2, 228, w + 4, 30); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 2;
  for (const yy of [238, 248]) { ctx.beginPath(); ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy); ctx.stroke(); }
  ctx.lineWidth = 6;
  // pink eraser
  ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.roundRect(-w / 2, 258, w, 36, [0, 0, 14, 14]); ctx.fill(); ctx.stroke();
  // shine down the lit face
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-w / 2 + 6, 66, 6, 154);
  ctx.restore();
}

function starShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.48 : s;
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffb800');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(3, s * 0.14); ctx.strokeStyle = INK; ctx.stroke();
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
  const br = 34 * L.k + 10;                         // ball radius in this layout
  sky(ctx, L);
  for (const [x, y] of L.obstacles) drawObstacle(ctx, { x, y, r: br * 1.25 });
  dropLine(ctx, L, br);
  // the cup, back half
  ctx.save(); ctx.translate(L.cup[0], L.cup[1]); drawCupBack(ctx, L.cupR, 'meadow', 0.6); ctx.restore();
  // the ramp the player drew
  const [[x1, y1], [x2, y2]] = L.ramp;
  drawSeg(ctx, { x1, y1, x2, y2 }, br * 0.55, { fill: RAMP.base, shine: 'rgba(255,255,255,.75)', outline: Math.max(4, br * 0.16), shadow: true });
  dotted(ctx, L.arc, br);
  if (L.star) starShape(ctx, L.star[0], L.star[1], br * 0.9);
  speedLines(ctx, L, br);
  ball(ctx, L.ball[0], L.ball[1], br);
  ctx.save(); ctx.translate(L.cup[0], L.cup[1]); drawCupFront(ctx, L.cupR, 'meadow', 0.6); ctx.restore();
  hand(ctx, L.hand[0], L.hand[1], 0.95 * L.k + 0.15);
  if (L.title) titleBlock(ctx, L);
}

(window as any).render = render;
