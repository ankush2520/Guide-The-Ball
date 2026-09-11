/* ============================================================
   ATMOSPHERE - a drifting star field
   Fixed positions seeded once, so the field is identical on every
   load and every device. Plain arcs with no shadow: 46 of them
   cost nothing, which is the whole point of doing depth this way
   rather than with another blurred layer.
   ============================================================ */
import { H, BOARD } from '../physics/constants';
import { mulberry32 } from '../physics/math';

export const STAR_N = 46;

/* `sx` is 0..1 across the board rather than an absolute x: the board can be
   wider on a tablet than on a phone, and a field seeded in absolute pixels
   would leave the two margins empty. */
interface Speck { sx: number; y: number; r: number; drift: number; tw: number; phase: number; }

const SPECKS: Speck[] = (() => {
  const r = mulberry32(0x5eed);
  const out: Speck[] = [];
  for (let i = 0; i < STAR_N; i++)
    out.push({ sx: r(), y: r() * H, r: 0.6 + r() * 1.5,
               drift: 2 + r() * 7,           // px/sec downward - barely motion
               tw: 0.5 + r() * 1.4, phase: r() * Math.PI * 2 });
  return out;
})();

export function drawStarfield(ctx: CanvasRenderingContext2D, clock: number): void {
  ctx.save();
  ctx.fillStyle = '#cfe0ff';
  for (const s of SPECKS) {
    // drift down forever and wrap, so the field never runs out
    const y = (s.y + clock * s.drift) % (H + 20) - 10;
    ctx.globalAlpha = 0.09 + 0.13 * (0.5 + 0.5 * Math.sin(clock * s.tw + s.phase));
    ctx.beginPath(); ctx.arc(BOARD.x0 + s.sx * BOARD.w, y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
