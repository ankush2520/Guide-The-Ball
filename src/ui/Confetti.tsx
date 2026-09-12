/* ============================================================
   THE WIN BURST

   One throw of paper when the win card appears, and nothing
   else. It is decoration, so it is held to two rules the rest
   of the game's feedback is held to: it must not cost the
   player anything to ignore, and it must not be on screen long
   enough to be in the way of the Next button.

   ITS OWN LAYER, ABOVE THE OVERLAY. The win card's scrim is the
   light one precisely so the board stays visible under it; a
   burst painted INSIDE that overlay would sit under the scrim
   and be tinted by it, which is exactly backwards for the one
   element meant to read as being in front of everything.

   DOM, not canvas, for the same reason the coin flight is: the
   board's renderer paints inside the stage, and this covers the
   whole viewport.

   ONE rAF FOR ALL OF IT, unlike the coin flight's one per coin.
   Three coins on three timers is three timers; forty pieces of
   paper on forty timers is forty, and they all want the same
   clock anyway.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import type { WinCard } from '../managers/GameController';

const PIECES = 38;
const LIFE = 2000;           // ms from throw to gone
const FADE = 620;            // ms of that spent fading out at the end
/* Tuned so a piece takes about as long to cross the viewport as the burst
   lasts. At the first value - near twice this - the paper was off the bottom
   of the screen by 1.2s and spent the rest of its life fading where nobody
   could see it, which is a third of the effect thrown away. */
const GRAVITY = 700;         // px/s/s

/* Five colours, all of them already in the game: the accent gold, the ramp's
   cyan, the target's green and the ball's own white and gold. They live in
   CSS (`.cfp0`..`.cfp4`) rather than here so they read the palette variables
   directly and cannot drift from them. */
const COLOURS = 5;

interface Piece {
  el: HTMLElement;
  x: number; y: number;      // px, viewport coordinates
  vx: number; vy: number;    // px/s
  rot: number; vrot: number; // deg, deg/s
  flip: number; vflip: number;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function Confetti() {
  const { controller } = useGame();
  useGameVersion();
  const host = useRef<HTMLDivElement>(null);
  /* The card object is new on every win, which makes it the identity to test:
     re-renders during the card's life must not re-throw the burst. The coin
     flight tracks its own launch the same way. */
  const thrown = useRef<WinCard | null>(null);
  /* The run in flight, so a burst can be cut short rather than left painting
     over whatever replaced the card that started it. */
  const run = useRef<{ raf: number; pieces: Piece[] } | null>(null);

  const card = controller.winCard;
  const showing = controller.phase === 'over' && !!card;

  useEffect(() => {
    if (!showing || !card || thrown.current === card) return;
    thrown.current = card;
    const layer = host.current;
    if (!layer) return;
    /* Skipped outright rather than shortened. There is no information in the
       burst - the card already says everything it is celebrating - so the
       honest reduced-motion version of it is nothing at all. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    run.current = throwBurst(layer, run.current);

    /* Both deps are stable for the whole life of one card, so this only fires
       when the card GOES - which is the moment the paper has to go with it.
       Without it, pressing Next inside the two seconds leaves the previous
       level's confetti falling over the next level's board. */
    return () => {
      const r = run.current;
      if (!r) return;
      cancelAnimationFrame(r.raf);
      for (const p of r.pieces) p.el.remove();
      run.current = null;
    };
  }, [showing, card]);

  return <div className="confetti" ref={host} aria-hidden="true" />;
}

function throwBurst(layer: HTMLElement,
                    prev: { raf: number; pieces: Piece[] } | null) {
  if (prev) {
    cancelAnimationFrame(prev.raf);
    for (const p of prev.pieces) p.el.remove();
  }

  const w = window.innerWidth;
  const pieces: Piece[] = [];

  for (let i = 0; i < PIECES; i++) {
    const el = document.createElement('i');
    el.className = `cfp cfp${i % COLOURS}`;
    /* Sized per piece. A burst of identical rectangles reads as a pattern
       rather than as paper, and the cheapest way out of that is two random
       dimensions rather than a second shape. */
    el.style.width = `${rand(4, 9).toFixed(1)}px`;
    el.style.height = `${rand(7, 14).toFixed(1)}px`;

    const p: Piece = {
      el,
      /* Spread across the full width and staggered ABOVE the top edge, so the
         burst arrives as a fall rather than as a row appearing at once. */
      x: rand(0, w),
      y: rand(-140, -12),
      vx: rand(-55, 55),
      vy: rand(50, 200),
      rot: rand(0, 360),
      vrot: rand(-420, 420),
      flip: rand(0, 6.28),
      vflip: rand(2.2, 6.5),
    };
    place(p, 1);
    layer.appendChild(el);
    pieces.push(p);
  }

  const start = performance.now();
  let last = start;

  const step = (now: number) => {
    /* Real elapsed time, not a fixed step. A dropped frame must move the
       paper further, not slow the whole burst down. Clamped so a backgrounded
       tab does not resume by teleporting everything off the bottom. */
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - start;
    const fade = t > LIFE - FADE ? 1 - (t - (LIFE - FADE)) / FADE : 1;

    for (const p of pieces) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.flip += p.vflip * dt;
      place(p, fade);
    }

    if (t < LIFE) {
      state.raf = requestAnimationFrame(step);
      return;
    }
    for (const p of pieces) p.el.remove();
  };

  const state = { raf: requestAnimationFrame(step), pieces };
  return state;
}

/* Position, tumble and the flat-on look. Scaling X by a cosine is the cheap
   half of a 3D flip: the piece narrows to a line and opens out again, which
   is what stops a falling rectangle from reading as a sliding one. */
function place(p: Piece, opacity: number): void {
  p.el.style.transform =
    `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) ` +
    `rotate(${p.rot.toFixed(1)}deg) scaleX(${Math.cos(p.flip).toFixed(3)})`;
  p.el.style.opacity = opacity < 1 ? Math.max(0, opacity).toFixed(3) : '1';
}
