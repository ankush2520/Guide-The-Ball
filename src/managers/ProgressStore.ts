/* ============================================================
   PROGRESS STORE - every localStorage read and write, in one
   place.

   The keys are UNCHANGED from the original build on purpose: a
   player who has already reached level 25 must still be there
   after the rewrite. Every accessor swallows its own errors -
   private mode and blocked storage are normal conditions, and
   losing a save must never be able to break the game.
   ============================================================ */

export const SAVE_KEY  = 'gtb.progress.v1';
export const BALLS_KEY = 'gtb.balls.v1';
export const SPIN_KEY  = 'gtb.spin.v1';

export interface SaveData {
  highest?: number;
  stars?: Record<number, number>;
  cleared?: Record<number, boolean>;
  pickups?: Record<number, number>;
  tutorialSeen?: boolean;
  obstacleTipSeen?: boolean;
  tips?: Record<string, boolean>;
}

export interface SpinData { last: number; pending: number; }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return (v && typeof v === 'object') ? v as T : fallback;
  } catch { return fallback; }
}

function writeJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* private mode / blocked storage - progress just won't persist */ }
}

export class ProgressStore {
  load(): SaveData { return readJSON<SaveData>(SAVE_KEY, {}); }
  save(data: SaveData): void { writeJSON(SAVE_KEY, data); }

  loadBalls(): number | null {
    const raw = readJSON<{ balls?: unknown }>(BALLS_KEY, {});
    /* No stored count at all means this is the first time the game has ever
       been opened. A corrupt one is treated the same way rather than as zero:
       a storage glitch must never leave a player locked out of their own game. */
    if (typeof raw.balls !== 'number' || !isFinite(raw.balls)) return null;
    return Math.max(0, raw.balls | 0);
  }
  saveBalls(balls: number): void { writeJSON(BALLS_KEY, { balls }); }

  loadSpin(): SpinData {
    const raw = readJSON<{ last?: unknown; pending?: unknown }>(SPIN_KEY, {});
    const last = isFinite(Number(raw.last)) ? Number(raw.last) : 0;
    return { last, pending: (raw.pending as number) | 0 };
  }
  saveSpin(last: number, pending = 0): void { writeJSON(SPIN_KEY, { last, pending }); }
}

export const progressStore = new ProgressStore();
