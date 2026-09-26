import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { FishDef } from '../levels/types';
import { PLAY, W, H } from '../physics/constants';

/* ============================================================
   UNDER THE SEA - the backdrop of Coralis Deep

   Deep water shading darker toward the floor, light rays from
   the surface, a sandy seabed with rocks, coral, shells, a
   starfish and a sunken anchor, seaweed swaying up both sides,
   far-off rock silhouettes, rising bubbles and a drifting school.

   All scenery - none of it touches the ball - so it runs on the
   wall clock. The static pieces live in the MARGINS the view
   scale opens around the design box (below y = H and beside
   x = 0..W, see constants.ts PLAY), so the playing field stays
   clear and nothing here is mistaken for a hazard. Cheap on a
   phone: a few dozen plain fills per frame, nothing allocated.
   ============================================================ */
const BUBBLES = 26;
const SCHOOL = 6;

export class Sea extends Entity<readonly FishDef[]> {
  readonly kind: EntityKind = 'sea';

  draw({ ctx, clock }: DrawContext): void {
    const x0 = PLAY.x0, y0 = PLAY.y0, x1 = PLAY.x1, y1 = PLAY.y1;
    const w = x1 - x0, h = y1 - y0;
    /* each level gets its own seabed, from its first fish */
    const seed = this.def.length ? this.def[0].x0 * 7 + this.def[0].y : 1;
    const rnd = (i: number) => frac(Math.sin((i + 1) * 12.9898 + seed * 0.013) * 43758.5453);
    ctx.save();

    // ---- the water: blue-green, deepening toward the floor
    const wash = ctx.createLinearGradient(0, y0, 0, y1);
    wash.addColorStop(0, 'rgba(40,165,205,0.27)');
    wash.addColorStop(0.55, 'rgba(25,120,175,0.34)');
    wash.addColorStop(1, 'rgba(12,70,130,0.42)');
    ctx.fillStyle = wash;
    ctx.fillRect(x0, y0, w, h);

    // ---- light rays from the surface, swaying
    for (let i = 0; i < 5; i++) {
      const cx = x0 + w * (0.08 + i * 0.21) + Math.sin(clock * 0.25 + i * 1.7) * 26;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.8);
      g.addColorStop(0, 'rgba(255,255,255,0.13)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - 16, y0); ctx.lineTo(cx + 22, y0);
      ctx.lineTo(cx + 90, y0 + h * 0.8); ctx.lineTo(cx - 6, y0 + h * 0.8);
      ctx.closePath(); ctx.fill();
    }

    // ---- far-off rock silhouettes, low on the horizon
    const floor = Math.max(H + 8, y1 - 78);
    ctx.fillStyle = 'rgba(20,70,110,0.20)';
    ctx.beginPath();
    ctx.moveTo(x0, floor);
    for (let i = 0; i <= 8; i++) {
      const px = x0 + w * i / 8;
      ctx.lineTo(px, floor - 40 - rnd(i) * 90);
    }
    ctx.lineTo(x1, floor); ctx.closePath(); ctx.fill();

    // ---- seaweed up both side margins (and a little in the corners)
    const sideL = Math.min(0, x0 + 8), sideR = Math.max(W, x1 - 8);
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0;
      const edge = left ? sideL : sideR;
      const span = left ? Math.max(18, 0 - x0) : Math.max(18, x1 - W);
      const bx = left ? edge + 6 + rnd(i + 20) * (span - 12) : edge - 6 - rnd(i + 20) * (span - 12);
      const tall = 120 + rnd(i + 40) * 260;
      kelp(ctx, bx, y1, tall, clock + i * 0.9, i % 3 === 0 ? '#2f8a5b' : '#3fa56b', 5 + rnd(i) * 3);
    }

    // ---- the seabed: sand with a soft wavy top and ripples
    const sand = ctx.createLinearGradient(0, floor - 10, 0, y1);
    sand.addColorStop(0, '#ecd9a4');
    sand.addColorStop(1, '#c9ae76');
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    for (let i = 0; i <= 24; i++) {
      const px = x0 + w * i / 24;
      ctx.lineTo(px, floor + Math.sin(i * 0.9 + seed) * 6);
    }
    ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,125,70,0.35)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const px = x0 + w * i / 24, py = floor + 16 + k * 16 + Math.sin(i * 1.3 + k) * 3;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    // ---- on the seabed: rocks, coral, seaweed tufts, shells, a starfish, an anchor
    for (let i = 0; i < 5; i++) {
      const rx = x0 + w * (0.06 + i * 0.22 + rnd(i + 60) * 0.08), ry = floor + 10;
      rock(ctx, rx, ry, 16 + rnd(i + 70) * 18);
    }
    const corals = ['#ff8fa3', '#ffb26b', '#c49bff', '#ff7aa8'];
    for (let i = 0; i < 4; i++) {
      const cx = x0 + w * (0.14 + i * 0.24 + rnd(i + 80) * 0.06);
      coral(ctx, cx, floor + 6, 34 + rnd(i + 90) * 26, corals[i % corals.length]);
    }
    for (let i = 0; i < 5; i++) {
      const bx = x0 + w * (0.03 + i * 0.2 + rnd(i + 100) * 0.1);
      kelp(ctx, bx, floor + 12, 40 + rnd(i + 110) * 40, clock * 1.2 + i, '#4db37a', 4);
    }
    shell(ctx, x0 + w * 0.33, floor + 30, 9);
    shell(ctx, x0 + w * 0.71, floor + 42, 7);
    starfish(ctx, x0 + w * (0.5 + rnd(120) * 0.1), floor + 36, 11);
    anchor(ctx, x0 + w * (0.84 + rnd(130) * 0.06), floor + 6, 30);

    // ---- the school: small silhouettes drifting slowly across
    ctx.fillStyle = 'rgba(20,70,115,0.22)';
    for (let i = 0; i < SCHOOL; i++) {
      const u = frac(Math.sin(i * 91.7) * 4375.5), v = frac(Math.sin(i * 17.3) * 9123.1);
      const dir = i % 2 ? 1 : -1, s = 7 + v * 7, speed = 14 + u * 16;
      const span = w + 80;
      const px = x0 - 40 + ((u * span + dir * clock * speed) % span + span) % span;
      const py = y0 + h * (0.12 + v * 0.62) + Math.sin(clock * 0.8 + i) * 8;
      ctx.save(); ctx.translate(px, py); ctx.scale(dir, 1);
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.6, -s * 0.5); ctx.lineTo(-s * 1.6, s * 0.5); ctx.fill();
      ctx.restore();
    }

    // ---- bubbles, rising and wobbling
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < BUBBLES; i++) {
      const u = frac(Math.sin(i * 12.9898) * 43758.5453), v = frac(Math.sin(i * 78.233) * 12543.1234);
      const rise = 25 + v * 35, r = 2 + v * 4;
      const py = y1 - ((v * h + clock * rise) % (h + 20));
      const px = x0 + u * w + Math.sin(clock * 1.5 + i) * 5;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function frac(n: number): number { return n - Math.floor(n); }

/** A strand of seaweed rooted at (x, y), `tall` high, swaying with `t`. */
function kelp(ctx: CanvasRenderingContext2D, x: number, y: number, tall: number,
              t: number, color: string, width: number): void {
  const sway = Math.sin(t * 0.9) * tall * 0.12;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 14 + sway * 0.3, y - tall * 0.35, x + 14 + sway * 0.7, y - tall * 0.7, x + sway, y - tall);
  ctx.stroke();
  // a few leaves along it
  ctx.fillStyle = color;
  for (let k = 1; k <= 3; k++) {
    const f = k / 4, lx = x + sway * f, ly = y - tall * f, side = k % 2 ? 1 : -1;
    ctx.beginPath(); ctx.ellipse(lx + side * 6, ly, 7, 3, side * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#7d8fa0';
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.8, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.45, r * 0.18, -0.3, 0, Math.PI * 2); ctx.fill();
}

/** Branching coral: a trunk and a few rounded arms. */
function coral(ctx: CanvasRenderingContext2D, x: number, y: number, tall: number, color: string): void {
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 6;
  const arm = (ax: number, ay: number, bx: number, by: number) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax, (ay + by) / 2, bx, by); ctx.stroke();
  };
  arm(x, y, x, y - tall);
  arm(x, y - tall * 0.35, x - tall * 0.4, y - tall * 0.8);
  arm(x, y - tall * 0.5, x + tall * 0.38, y - tall * 0.95);
  arm(x - tall * 0.2, y - tall * 0.6, x - tall * 0.45, y - tall * 0.55);
  ctx.fillStyle = color;
  for (const [px, py] of [[x, y - tall], [x - tall * 0.4, y - tall * 0.8], [x + tall * 0.38, y - tall * 0.95]]) {
    ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
  }
}

function shell(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#f7e6d6'; ctx.strokeStyle = '#d4a98c'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * r * 0.4, y - r * 0.95); ctx.stroke();
  }
}

function starfish(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#ff9a5c';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.75;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

/** A sunken anchor, half in the sand. */
function anchor(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.strokeStyle = 'rgba(70,80,95,0.8)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x, y + s * 0.2); ctx.stroke();     // shank
  ctx.beginPath(); ctx.moveTo(x - s * 0.35, y - s); ctx.lineTo(x + s * 0.35, y - s); ctx.stroke(); // stock
  ctx.beginPath(); ctx.arc(x, y - s * 1.45, s * 0.16, 0, Math.PI * 2); ctx.stroke();           // ring
  ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); // arms
}
