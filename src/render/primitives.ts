/* Shared canvas primitives. Kept out of the entity classes so a shape that
   several entities draw the same way is written once. */

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

/* A player ramp: a neon tube. Two wide translucent passes make the bloom and
   a bright thin pass makes the lit core. Deliberately NOT shadowBlur - a
   blurred shadow per segment per frame is what used to make drawing a ramp
   stutter on a phone, and this costs three ordinary strokes. */
export function drawSeg(ctx: CanvasRenderingContext2D,
                        s: { x1: number; y1: number; x2: number; y2: number },
                        color: string, halfT: number, glow: string | null): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  if (glow) {
    ctx.strokeStyle = glow;
    ctx.globalAlpha = 0.15; ctx.lineWidth = halfT * 2 + 15; ctx.stroke();
    ctx.globalAlpha = 0.26; ctx.lineWidth = halfT * 2 + 7;  ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = halfT * 2;
  ctx.stroke();
  if (glow) {                                 // the lit filament down the middle
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = Math.max(1, halfT * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}
