/* ============================================================
   THE REWARD FLIGHT

   Anything the game pays out lands in a counter at the top of
   the screen, behind whatever panel just announced it. Without
   this the number simply differs by ten the next time you look
   at it. So the payout makes the journey: three marks leave the
   panel that announced them, arc up, and each chimes as it
   arrives.

   Two callers. The win card fires it through the effect below,
   once per card; the prize wheel calls flyReward() directly
   when a spin settles. Each currency flies its OWN mark to its
   OWN counter - a stamped gold coin to the coins, a lit white
   ball to the balls, a blue bar to the ramps - because a gold
   coin sailing into the ball tank would be saying the wrong
   thing.

   DOM, not canvas. The board's renderer only paints inside the
   stage, and both ends of this flight - a modal card and the
   HUD behind it - are outside it.

   The coins are a FLOURISH, not a count: three of them fly
   whether the payout was 10 or 150. The wallet was already
   credited when the level was recorded, so nothing here can be
   missed, interrupted or replayed into paying twice.

   What the COUNTER shows is held back to match, though, or the
   flight is decoration over a payment that visibly already
   happened - the number in the top bar climbs as the three marks
   merge into it. The ledger is still written first and this
   cannot affect it; see coinsInFlight.

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
import { flushCoins, holdCoins, landedCoin, launchedCoins } from './coinsInFlight';
import { Sound } from '../audio/Sound';
import type { FlightKind } from '../core/events';
import { BOARD, H } from '../physics/constants';
import { viewX, viewY } from '../render/view';
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

/* Where each payout flies, and what it looks like on the way. The marks are
   the same ones the HUD, the shop and the win card use.

   The last two land on BUTTONS rather than on counters, because that is
   honestly where those two things live: a booster goes into the bag, and a
   free spin goes to the gear, which is the wheel's door and lights up the
   moment the token arrives. Neither has a number to merge with, so each
   arrival is the button's own bump instead. */
const LANDS: Record<FlightKind, { to: string; mark: string }> = {
  coins:    { to: '.counter.coins .coin', mark: 'flycoin' },
  balls:    { to: '.counter.balls .pip',  mark: 'flyball' },
  ramps:    { to: '.counter.ramps',       mark: 'flyramp' },
  boosters: { to: '#btn-inventory',       mark: 'flyboost' },
  spin:     { to: '#btn-settings',        mark: 'flyspin' },
};

interface Pt { x: number; y: number; }

/* The layer is mounted once by <CoinFlight/> and reached from here, so the
   wheel can launch a flight without being handed a ref through three
   components that have no other reason to know about it. */
let layerEl: HTMLElement | null = null;

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

/** Fly a payout from `fromSel` to the counter that holds it. Safe to call
    when either end is missing - it simply does nothing.

    `from` may also be a viewport POINT, which is how a mystery box launches
    its reward out of the chest the ball just hit rather than out of a panel
    that is not on screen. */
export function flyReward(kind: FlightKind, fromSel: string | Pt): void {
  const land = LANDS[kind];
  const from = typeof fromSel === 'string' ? centreOf(fromSel) : fromSel;
  const to = centreOf(land.to);
  /* Nothing can fly - no layer, or one of the two ends is not on screen. The
     counter must not sit waiting for a mark that is never coming. */
  if (!layerEl || !from || !to) { if (kind === 'coins') flushCoins(); return; }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Sound.coin(0);
    bump(kind);
    return;
  }
  /* The counter is holding these coins back until they land, so the flight
     has to say how many are coming - see coinsInFlight. */
  if (kind === 'coins') launchedCoins(COINS);
  for (let i = 0; i < COINS; i++)
    window.setTimeout(() => launch(layerEl!, from, to, i, kind), i * STAGGER);
}

export function CoinFlight() {
  const { bus, controller } = useGame();
  useGameVersion();
  const host = useRef<HTMLDivElement>(null);
  /* The card object is new on every win, which makes it the identity to test:
     re-renders during the card's life must not relaunch the flight. */
  const flown = useRef<WinCard | null>(null);

  const card = controller.winCard;
  const showing = controller.phase === 'over' && !!card && card.coins > 0;

  /* The layer has to be in the document before anything can launch into it,
     and the wheel reaches it through the module rather than through props. */
  useEffect(() => {
    layerEl = host.current;
    return () => { layerEl = null; };
  }, []);

  useEffect(() => {
    if (!showing || !card || flown.current === card) return;
    flown.current = card;
    flyReward('coins', '#ov-coins');
  }, [showing, card]);

  /* ============================================================
     HOLDING THE PAYOUT BACK

     Every coin payout in the game is announced here before its
     flight starts, so this is the one place that can tell the
     counter to wait - and the reasons are listed rather than
     assumed: these three are exactly the ones a flight is
     launched for (the win card's, the wheel's, and a chest's or
     a wrapped target's). Anything else - a purchase, a grant, a
     save being loaded - has no mark in the air, so it flushes
     instead, which is also what keeps the shop showing the real
     balance the moment a player spends.
     ============================================================ */
  useEffect(() => bus.on('coins:changed', ({ delta, reason }) => {
    if (delta > 0 && (reason === 'clear' || reason === 'spin' || reason === 'box'))
      holdCoins(delta);
    else flushCoins();
  }), [bus]);

  /* ============================================================
     A MYSTERY BOX PAYING OUT

     The reward leaves the CHEST, not a card: the box is on the
     board, in the middle of a drop, and there is no panel for it
     to come out of. So the controller says what was won and
     where in BOARD coordinates, and this turns that into a point
     on screen using the canvas's own rect - the same mapping
     GameCanvas uses for the tap ripple, and the only place in
     the flight layer that knows the board has a coordinate
     system at all.
     ============================================================ */
  useEffect(() => bus.on('box:reward', ({ kind, x, y }) => {
    const board = document.getElementById('board');
    if (!board) return;
    const r = board.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // painted position, not authored position - see render/view.ts
    const vx = viewX(x), vy = viewY(y);
    flyReward(kind, { x: r.left + ((vx - BOARD.x0) / BOARD.w) * r.width,
                      y: r.top + (vy / H) * r.height });
  }), [bus]);

  return <div className="coinfly" ref={host} aria-hidden="true" />;
}

/* What each arrival lands ON. The three currencies take their counter; the
   bag and the gear take the hit themselves, since they are what holds the
   thing that just arrived. */
const TOOK: Record<FlightKind, string> = {
  coins: '.counter.coins',
  balls: '.counter.balls',
  ramps: '.counter.ramps',
  boosters: '#btn-inventory',
  spin: '#btn-settings',
};

/** The counter takes the hit, so the arrival lands on something - and, for
    coins, takes the coins with it: the chip's number climbs as they merge
    into it rather than having changed before they set off. */
function bump(kind: FlightKind): void {
  if (kind === 'coins') landedCoin();
  const chip = document.querySelector(TOOK[kind]);
  if (!chip) return;
  chip.classList.remove('took');
  void (chip as HTMLElement).offsetWidth;     // restart the animation
  chip.classList.add('took');
}

function launch(layer: HTMLElement, from: Pt, to: Pt, i: number, kind: FlightKind): void {
  const el = document.createElement('i');
  el.className = `flymark ${LANDS[kind].mark}`;

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
    bump(kind);
  };
  requestAnimationFrame(step);
}
