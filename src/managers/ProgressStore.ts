/* ============================================================
   PROGRESS STORE - every localStorage read and write, in one
   place.

   The keys are UNCHANGED from the original build on purpose: a
   player who has already reached level 25 must still be there
   after the rewrite. Every accessor swallows its own errors -
   private mode and blocked storage are normal conditions, and
   losing a save must never be able to break the game.
   ============================================================ */

export const SAVE_KEY   = 'gtb.progress.v1';
export const BALLS_KEY  = 'gtb.balls.v1';
export const SPIN_KEY   = 'gtb.spin.v1';
/* Coins and the spare-ramp drawer. Its own key rather than a field on the
   progress blob: like the ball tank, it is spent and earned constantly, and
   a wallet write must not have to rewrite the whole save to happen. */
export const WALLET_KEY = 'gtb.wallet.v1';

export interface SaveData {
  highest?: number;
  stars?: Record<number, number>;
  cleared?: Record<number, boolean>;
  pickups?: Record<number, number>;
  tutorialSeen?: boolean;
  obstacleTipSeen?: boolean;
  tips?: Record<string, boolean>;
}

/** What a spin owes but has not yet paid - see RewardManager.loadSpin(). */
export interface PendingPrize { kind: 'coins' | 'balls' | 'ramps'; n: number; }
export interface SpinData {
  last: number;
  pending: PendingPrize | null;
  /* When the wheel last OPENED ITSELF. Separate from `last`, which only moves
     when a spin is actually taken: a player who is offered the wheel and
     closes it without spinning must not be offered it again on every reload
     for the next 24 hours. */
  offered: number;
}
export interface WalletData { coins: number | null; ramps: number; }

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
    const raw = readJSON<{ last?: unknown; pending?: unknown; offered?: unknown }>(SPIN_KEY, {});
    const last = isFinite(Number(raw.last)) ? Number(raw.last) : 0;
    const offered = isFinite(Number(raw.offered)) ? Number(raw.offered) : 0;
    const p = raw.pending;
    /* A bare number is a save from before the wheel paid anything but balls.
       It still owes those balls, so it is read rather than discarded. */
    if (typeof p === 'number' && p > 0)
      return { last, offered, pending: { kind: 'balls', n: p | 0 } };
    if (p && typeof p === 'object') {
      const { kind, n } = p as PendingPrize;
      if ((kind === 'coins' || kind === 'balls' || kind === 'ramps') && (n | 0) > 0)
        return { last, offered, pending: { kind, n: n | 0 } };
    }
    return { last, offered, pending: null };
  }
  saveSpin(last: number, pending: PendingPrize | null = null, offered = 0): void {
    writeJSON(SPIN_KEY, { last, pending, offered });
  }

  /** `coins: null` means the game has never been opened - see loadBalls(). */
  loadWallet(): WalletData {
    const raw = readJSON<{ coins?: unknown; ramps?: unknown }>(WALLET_KEY, {});
    const coins = (typeof raw.coins === 'number' && isFinite(raw.coins))
      ? Math.max(0, raw.coins | 0) : null;
    const ramps = (typeof raw.ramps === 'number' && isFinite(raw.ramps))
      ? Math.max(0, raw.ramps | 0) : 0;
    return { coins, ramps };
  }
  saveWallet(coins: number, ramps: number): void { writeJSON(WALLET_KEY, { coins, ramps }); }
}

export const progressStore = new ProgressStore();
