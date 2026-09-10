/* ============================================================
   EVENT BUS - the observer pattern, typed.

   The original game was one file, so every system simply called
   every other one: drop() poked the DOM, finish() poked storage,
   land() poked the particle pool. That coupling is exactly what
   made the file impossible to split.

   Here the managers publish facts ("the ball landed", "a level
   was cleared") and never name their listeners. React subscribes
   for rendering, the audio layer subscribes for sound, and the
   reward manager subscribes for payouts - none of them know the
   others exist.
   ============================================================ */

export type Handler<T> = (payload: T) => void;
export type Unsubscribe = () => void;

/** A bus over a map of event name -> payload type. */
export class EventBus<Events extends Record<string, unknown>> {
  /* Sets, not arrays: subscribing the same handler twice is a bug that would
     otherwise double-fire, and unsubscribing is O(1). */
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Listen. Returns the unsubscribe - React effects return it directly. */
  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(fn as Handler<never>);
    return () => { set!.delete(fn as Handler<never>); };
  }

  /** Listen for exactly one occurrence, then detach. */
  once<K extends keyof Events>(event: K, fn: Handler<Events[K]>): Unsubscribe {
    const off = this.on(event, (payload) => { off(); fn(payload); });
    return off;
  }

  /** Publish. Iterates a COPY so a handler may safely unsubscribe - or
      subscribe - from inside its own callback without corrupting the walk. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<Events[K]>)(payload);
      } catch (err) {
        /* One broken listener must never stop the rest, and must never take
           the physics step down with it: the bus is emitted from inside the
           frame loop. */
        console.error(`[EventBus] handler for "${String(event)}" threw:`, err);
      }
    }
  }

  /** Drop every listener for one event, or the whole bus. Used by teardown. */
  clear<K extends keyof Events>(event?: K): void {
    if (event === undefined) this.handlers.clear();
    else this.handlers.delete(event);
  }

  /** Listener count - for tests and the debug hook, never for game logic. */
  count<K extends keyof Events>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
