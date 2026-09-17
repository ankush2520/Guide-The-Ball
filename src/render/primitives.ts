/* Shared canvas primitives. Kept out of the entity classes so a shape that
   several entities draw the same way is written once. */
import { INK } from './palette';

export function roundRect(ctx: CanvasRenderingContext2D,
                          x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

export interface SegStyle {
  fill: string;
  /** Lengthwise highlight, or null for a flat bar. */
  shine?: string | null;
  /** Ink outline weight; 0 for none. */
  outline?: number;
  /** A hard drop shadow under the bar, as a sticker would cast. */
  shadow?: boolean;
  alpha?: number;
}

/* A bar with a cartoon's hard edges: a drop shadow, a thick ink outline, the
   fill, and a highlight streak along its upper side. Four ordinary strokes -
   still deliberately NOT shadowBlur, which is what used to make drawing a ramp
   stutter on a phone. */
export function drawSeg(ctx: CanvasRenderingContext2D,
                        s: { x1: number; y1: number; x2: number; y2: number },
                        halfT: number, st: SegStyle): void {
  const ow = st.outline ?? 0;
  ctx.save();
  ctx.globalAlpha = st.alpha ?? 1;
  ctx.lineCap = 'round';
  const line = (dx: number, dy: number, inset = 0) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    const ux = (s.x2 - s.x1) / len, uy = (s.y2 - s.y1) / len;
    ctx.beginPath();
    ctx.moveTo(s.x1 + ux * inset + dx, s.y1 + uy * inset + dy);
    ctx.lineTo(s.x2 - ux * inset + dx, s.y2 - uy * inset + dy);
  };
  if (st.shadow) {
    line(0, 4);
    ctx.strokeStyle = 'rgba(42,35,80,.22)';
    ctx.lineWidth = halfT * 2 + ow * 2; ctx.stroke();
  }
  line(0, 0);
  if (ow > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = halfT * 2 + ow * 2; ctx.stroke();
  }
  ctx.strokeStyle = st.fill;
  ctx.lineWidth = halfT * 2; ctx.stroke();
  if (st.shine) {
    /* the streak sits on whichever side of the bar faces UP, so every ramp
       agrees with every ball about where the light is */
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    let nx = -(s.y2 - s.y1) / len, ny = (s.x2 - s.x1) / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const off = halfT * 0.42;
    line(nx * off, ny * off, Math.min(halfT * 1.4, len * 0.25));
    ctx.strokeStyle = st.shine;
    ctx.lineWidth = Math.max(1, halfT * 0.55); ctx.stroke();
  }
  ctx.restore();
}
