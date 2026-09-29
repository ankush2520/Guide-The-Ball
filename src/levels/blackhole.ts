import type { BlackHoleDef } from './types';

/* ============================================================
   A BLACK HOLE'S RHYTHM - it is all about the drop timing

   Every black hole switches its gravity ON and OFF on a fixed
   rhythm, off the same level clock the lightning and the
   patrolling targets use (t = steps since the level was
   entered, see GameController.patrolClock / ball.t0 + steps).
   Same drop, same moment, same result - so the player can
   watch it, learn it, and time the drop through a quiet gap.

     OFF   the hole is dim and still - the ball can pass it by
     WARN  the last BH_WARN steps of OFF: the rim flickers and a
           countdown ring closes, so the switch is never a surprise
     ON    `on` steps of ripples rolling inward, and the pull

   The black CORE swallows the ball whatever the phase: a hole
   is always a hole. Only the gravity switches.
   ============================================================ */
export const BH_WARN = 36;

export interface HoleState {
  on: boolean;
  /** 0..1 through the warning before ON (0 when not warning). */
  warn: number;
  /** 0..1 of the way from the end of the last ON to the next one. */
  charge: number;
  /** 0..1 of the way through the current ON. */
  into: number;
}

export function holeState(h: BlackHoleDef, t: number): HoleState {
  const p = h.period ?? 0, on = h.on ?? 0;
  if (!p || on <= 0) return { on: true, warn: 0, charge: 1, into: 0 };
  const ph = (((t + (h.offset ?? 0)) % p) + p) % p;      // ON is the last `on` steps of the cycle
  const onStart = p - on;
  if (ph >= onStart) return { on: true, warn: 0, charge: 1, into: (ph - onStart) / on };
  const toOn = onStart - ph;
  return { on: false, warn: toOn <= BH_WARN ? 1 - toOn / BH_WARN : 0, charge: ph / onStart, into: 0 };
}
