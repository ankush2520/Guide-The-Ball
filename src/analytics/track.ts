/* ============================================================
   TRACKING - one function, track(event, data)

   What happened, in the player's own browser, for now:
   - console.debug in dev builds;
   - a capped ring buffer in localStorage ('gtb-events', the
     last EVENT_CAP events), readable as window.__gtb.events().

   Nothing leaves the device yet. When there is a server to send
   to (ketugames.com), it goes in ONE place - see FORWARD below -
   and nothing else in the game changes.
   ============================================================ */
export type TrackEvent =
  | 'level_start' | 'ball_lost' | 'level_restart' | 'level_win'
  | 'ad_offer_shown' | 'ad_watched' | 'ad_failed'
  | 'spring_used' | 'spare_ramp_used' | 'hint_used'
  | 'chest_opened' | 'cosmetic_bought' | 'session_end';

export interface Tracked { e: TrackEvent; t: number; d: Record<string, unknown>; }

const KEY = 'gtb-events';
const EVENT_CAP = 500;
const session = Date.now();

export function track(event: TrackEvent, data: Record<string, unknown> = {}): void {
  const rec: Tracked = { e: event, t: Date.now(), d: data };
  if (import.meta.env?.DEV) console.debug('[track]', event, data);
  try {
    const raw = localStorage.getItem(KEY);
    const list: Tracked[] = raw ? JSON.parse(raw) : [];
    list.push(rec);
    if (list.length > EVENT_CAP) list.splice(0, list.length - EVENT_CAP);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* blocked storage - tracking is never allowed to break the game */ }

  /* ---- FORWARD ----------------------------------------------------------
     The one spot to send events to a server later (ketugames.com), e.g.
       navigator.sendBeacon('https://ketugames.com/api/events', JSON.stringify(rec));
     Left off until there is an endpoint and a privacy note to go with it.
     ----------------------------------------------------------------------- */
}

/** Everything still in the ring buffer, oldest first. */
export function readEvents(): Tracked[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

/** Milliseconds since this page load - what session_end reports. */
export const sessionMs = (): number => Date.now() - session;
