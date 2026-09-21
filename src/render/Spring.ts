/* ============================================================
   THE SPRING

   Drawn ON a ramp the player drew, which is the one thing about
   this item that has to read instantly: it is not a second piece
   of board, it is something FITTED to a line they already made.

   So it is painted along the ramp's own axis, standing off the
   ramp's upper face, and it moves with the ramp because it is
   read straight off the same four numbers the ramp is drawn
   from. There is nothing stored here at all.

   THE SHAPE IS A COIL, and a coil is the whole reason this
   works at a glance: a zig-zag says "this compresses", which is
   a promise about FORCE rather than about direction. The old
   item was a bar with chevrons on it, and chevrons had to work
   twice as hard because a bar looks exactly like a ramp - the
   coil has no such problem, because nothing else on the board
   is springy.

   BRASS, not the goal's green and not the ramp's blue. Green is
   the target and nothing else may wear it; blue is "an ordinary
   line that turns you", and the whole point of this thing is
   that the line is no longer ordinary. Brass reads as machinery
   against every sky in the game and against the blue it sits on.

   It breathes - the coil compresses and releases on a slow cycle
   - because a spring that never moves is a drawing of a spring.
   It is the only thing on a planning board that is alive, which
   is also what stops a fitted spring being missed.
   ============================================================ */
import type { Segment } from '../levels/types';
import { RAMP_HT } from '../physics/constants';
import { INK } from './palette';

/** The coil's brass, light through dark - the same three-stop shape every
    other piece on the board is built from. */
export const SPRING = { light: '#ffd98a', base: '#d69e2e', dark: '#8a5f12' };

/** Turns in the coil. Three, not four: the board is 480 units shown at ~370
    CSS px and then scaled again by the view, so a turn is only a couple of
    real pixels wide - four of them read as a scribble rather than as a coil. */
const TURNS = 3;
/** How far the coil stands off the ramp's face, fully extended. Sized against
    the BALL (radius 9) rather than against the ramp: the thing the player is
    being told is "this throws the ball", so the spring has to be a ball-sized
    object, not a texture on a line. */
const RISE = 17;
/** Along the ramp, how much of it the coil occupies. Kept well inside the
    ends so the grips a selected ramp puts there are never buried. */
const SPAN = 0.58;

/**
 * Paint the spring fitted to `seg`. `clock` is the render clock in seconds,
 * which drives the breathing; pass a constant for a still frame.
 */
export function drawSpring(ctx: CanvasRenderingContext2D,
                           seg: Segment, clock: number): void {
  const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;      // along the ramp
  /* The face the coil stands on. A ramp has two, and the ball may arrive at
     either - but a spring drawn on both sides would be twice the clutter for
     no extra truth, so it goes on the UPPER one, which is the side the ball
     comes from on all but a handful of layouts. */
  let nx = -uy, ny = ux;
  if (ny > 0) { nx = -nx; ny = -ny; }      // always the side pointing up-board

  /* Breathing. 0 is fully compressed, 1 fully extended - never all the way to
     either, so it always reads as a spring under load rather than as one that
     has gone slack or bottomed out. */
  const t = 0.72 + 0.28 * Math.sin(clock * 2.4);
  const rise = RISE * t;

  const span = Math.min(len * SPAN, 62);
  const mx = (seg.x1 + seg.x2) / 2, my = (seg.y1 + seg.y2) / 2;
  const x0 = mx - ux * span / 2, y0 = my - uy * span / 2;

  /* The coil itself: a zig-zag walked along the ramp, alternating between the
     face and the top plate. Drawn as ONE path so the outline pass below rings
     the whole thing rather than each leg. */
  const pts: [number, number][] = [];
  const legs = TURNS * 2;
  for (let i = 0; i <= legs; i++) {
    const along = span * (i / legs);
    const up = (i % 2 === 0 ? 0 : rise);
    pts.push([x0 + ux * along + nx * (up + RAMP_HT), y0 + uy * along + ny * (up + RAMP_HT)]);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // the ink outline, laid down first and over-drawn, exactly as every shape
  // on this board is built
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();

  ctx.strokeStyle = SPRING.base;
  ctx.lineWidth = 4.6;
  ctx.stroke();

  /* THE TOP PLATE - the flat the ball would meet if it landed square on the
     coil. It is what stops the zig-zag reading as a torn edge, and it moves
     with the breathing, which is what makes the motion legible as compression
     rather than as a wobble. */
  const px = x0 + nx * (rise + RAMP_HT + 1.5), py = y0 + ny * (rise + RAMP_HT + 1.5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + ux * span, py + uy * span);
  ctx.stroke();
  ctx.strokeStyle = SPRING.light;
  ctx.lineWidth = 5.5;
  ctx.stroke();

  ctx.restore();
}
