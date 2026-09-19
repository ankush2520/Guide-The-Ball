/* ============================================================
   COINS THAT HAVE NOT LANDED YET

   The wallet is credited the moment a payout is RECORDED - a
   level cleared, a wheel settled, a chest opened - and that is
   deliberate: the ledger is written and persisted before any
   animation starts, so nothing can be interrupted, replayed or
   closed into paying twice. See CoinFlight.

   Which left the counter in the top bar telling the truth too
   early. The coins were already in it before the first one had
   left the card, so the flight was three gold dots arriving at a
   number that had finished changing - decoration for a payment
   that had visibly already happened.

   So the LEDGER still changes at once and the DISPLAY lags it.
   This holds back the coins that are still in the air; the HUD
   subtracts what is held from the real balance, and each mark
   releases its share as it merges into the chip. The number
   climbs with the coins, which is what the flight was for.

   IT CAN ONLY EVER BE BEHIND, NEVER WRONG. Every path that could
   strand a held coin releases it: a flight that cannot start
   flushes immediately, a spend flushes (a player doing arithmetic
   in the shop must see the real balance), and a watchdog flushes
   anything still held when no mark has arrived in time. The worst
   case is the counter telling the truth sooner than it meant to.
   ============================================================ */
import { useSyncExternalStore } from 'react';

/* Comfortably longer than a whole flight - STAGGER * (COINS - 1) + FLIGHT is
   about 2.8s - and long enough to cover the one case where a payout waits for
   the player: a wrapped target's gift is opened BEFORE the win card, so the
   coins for that clear sit held while the player watches the unwrap and presses
   Take. Nothing should ever reach this; it is here so that a payout whose
   flight never happened cannot leave the counter wrong. */
const WATCHDOG_MS = 8000;

let held = 0;
/** Marks still in the air, so each arrival releases its share of the rest. */
let flying = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();
const notify = (): void => { for (const fn of [...listeners]) fn(); };

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** Coins the wallet has but the counter is not showing yet. */
export const coinsHeld = (): number => held;

function arm(): void {
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => { watchdog = null; flushCoins(); }, WATCHDOG_MS);
}

/** Hold back a payout that is about to fly. */
export function holdCoins(n: number): void {
  if (!(n > 0)) return;
  held += n;
  arm();
  notify();
}

/** A coins flight has launched `marks` marks, all of which will arrive. The
    watchdog is re-armed by it: the wait is over, the flight is what is being
    waited for now, and it must be given its whole 2.8s to finish. */
export function launchedCoins(marks: number): void {
  flying += Math.max(0, marks | 0);
  if (held > 0) arm();
}

/* One mark has merged into the counter. It releases its share of what is
   still held - the LAST one releasing everything left, so rounding can never
   strand a coin, and a payout smaller than the number of marks still ends up
   exact rather than short. */
export function landedCoin(): void {
  if (flying > 0) flying--;
  if (held <= 0) return;
  const share = Math.ceil(held / (flying + 1));
  held = Math.max(0, held - share);
  if (held === 0 && watchdog) { clearTimeout(watchdog); watchdog = null; }
  notify();
}

/** Show the real balance now: nothing is going to fly, or nothing more is. */
export function flushCoins(): void {
  flying = 0;
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  if (held === 0) return;
  held = 0;
  notify();
}

/** What the HUD subtracts. A primitive, so the store can be read directly. */
export function useCoinsHeld(): number {
  return useSyncExternalStore(subscribe, coinsHeld, coinsHeld);
}
