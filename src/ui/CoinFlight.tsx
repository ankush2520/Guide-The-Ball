/* ============================================================
   THE COIN FLIGHT

   A win pays coins, and the payout lands in a counter at the
   top of the screen that the win card is sitting in front of.
   Without this the number simply differs by ten the next time
   you look at it. So the coins make the journey: they leave the
   card's payout chip, arc up, and each one chimes as it arrives.

   DOM, not canvas. The board's renderer only paints inside the
   stage, and both ends of this flight - a modal card and the
   HUD behind it - are outside it.

   The coins are a FLOURISH, not a count: three of them fly
   whether the payout was 10 or 150. The wallet was already
   credited when the level was recorded, so nothing here can be
   missed, interrupted or replayed into paying twice.

   THREE, AND NO SPIN. The first pass threw nine coins on
   randomised arcs with randomised tumble, and it read as
   confetti rather than as money arriving somewhere. What makes
   this legible is restraint: a small fixed fan, one shared
   curve, no rotation, and a shrink into the counter at the end
   so each coin visibly MERGES with the label rather than
   stopping on top of it.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Sound } from '../audio/Sound';
import type { WinCard } from '../managers/GameController';

const COINS = 3;
/* Both timings are the same 0.3x pass over the first draft, so the rhythm is
   unchanged and only the pace is: 105 -> 350 and 620 -> 2060. Slowing the
   flight alone would have bunched the three coins into one clump. The whole
   run is now STAGGER * (COINS - 1) + FLIGHT, about 2.8s. */
const STAGGER = 350;         // ms between launches - the chime's tempo
const FLIGHT = 2060;         // ms in the air
/* The fan they leave in, in px across the payout chip. Fixed rather than
   random: three coins on a deliberate spread stay readable as three coins,
   where three random offsets just look like a mistake. */
const FAN = 19;

interface Pt { x: number; y: number; }

const centreOf = (sel: string): Pt | null => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/* Quadratic bezier. The control point sits above and ahead of the launch, so
   the coin leaves in a lob rather than sliding along a straight line. */
const bez = (a: Pt, b: Pt, c: Pt, t: number): Pt => {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
           y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
};

/* Gentle out of the chip, quick through the middle, gentle into the counter.
   The old ease was a plain t*t, which threw each coin away from the card at
   its fastest and let it arrive slowest - the opposite of merging. */
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function CoinFlight() {
  const { controller } = useGame();
  useGameVersion();
  const host = useRef<HTMLDivElement>(null);
  /* The card object is new on every win, which makes it the identity to test:
     re-renders during the card's life must not relaunch the flight. */
  const flown = useRef<WinCard | null>(null);
  const timers = useRef<number[]>([]);

  const card = controller.winCard;
  const showing = controller.phase === 'over' && !!card && card.coins > 0;

  useEffect(() => {
    if (!showing || !card || flown.current === card) return;
    flown.current = card;

    const layer = host.current;
    const from = centreOf('#ov-coins');
    const to = centreOf('.counter.coins .coin');
    if (!layer || !from || !to) return;

    /* Reduced motion gets the sound and the counter's bump, but nothing
       flying across the screen. */
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { Sound.coin(0); bump(); return; }

    for (let i = 0; i < COINS; i++) {
      const id = window.setTimeout(() => launch(layer, from, to, i), i * STAGGER);
      timers.current.push(id);
    }
  }, [showing, card]);

  /* A card dismissed mid-flight must not leave timers firing into a torn-down
     layer, or chime after the player has already moved on. */
  useEffect(() => () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  }, []);

  return <div className="coinfly" ref={host} aria-hidden="true" />;
}

/** The counter takes the hit, so the arrival lands on something. */
function bump(): void {
  const chip = document.querySelector('.counter.coins');
  if (!chip) return;
  chip.classList.remove('took');
  void (chip as HTMLElement).offsetWidth;     // restart the animation
  chip.classList.add('took');
}

function launch(layer: HTMLElement, from: Pt, to: Pt, i: number): void {
  const el = document.createElement('i');
  el.className = 'flycoin';

  /* A fixed fan: left, centre, right of the payout chip. All three land on
     the SAME point, so the paths converge as they climb - which is what
     reads as three coins going into one counter. */
  const spread = (i - (COINS - 1) / 2) * FAN;
  const a = { x: from.x + spread, y: from.y };

  const place = (p: Pt, sc: number, op: number) => {
    el.style.transform =
      `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${sc})`;
    el.style.opacity = String(op);
  };

  /* Positioned BEFORE it joins the document. The layer is at the viewport's
     origin, so an un-transformed coin paints in the top-left corner - and it
     got one frame there, as a gold dot in the corner of the screen, every
     time one launched. */
  place(a, 1, 1);
  layer.appendChild(el);
  /* One shared curve, bowed toward the counter rather than straight up, so
     the coin is already travelling the counter's way when it gets there and
     arrives along the label instead of dropping onto it. */
  const ctrl = { x: a.x + (to.x - a.x) * 0.55,
                 y: Math.min(a.y, to.y) - 96 + spread * 0.5 };
  const start = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / FLIGHT);
    const e = easeInOut(t);
    const p = bez(a, ctrl, to, e);
    /* Merge, rather than land: full size for most of the trip, then shrink
       into the counter over the last third while fading out. The coin is
       gone at the instant it reaches the label, so the two become one. */
    const k = Math.max(0, (t - 0.62) / 0.38);
    place(p, 1 - 0.62 * k * k, 1 - 0.9 * k * k);
    if (t < 1) { requestAnimationFrame(step); return; }
    el.remove();
    Sound.coin(i);
    bump();
  };
  requestAnimationFrame(step);
}
