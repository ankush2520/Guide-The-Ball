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
  /** The one free booster, handed over the first time level 21 is reached.
      A flag rather than a count: it records that the gift HAPPENED, which is
      the only thing that must never happen twice. */
  boosterGift?: boolean;
  /** Which levels have had their mystery box opened. A box is treasure, not
      income: claimed once per level, for good, so replaying an easy board
      cannot be farmed for rewards the way clearing it cannot be farmed for
      coins (see REPLAY_SHARE). */
  boxes?: Record<number, boolean>;
}

/** What a spin owes but has not yet paid - see RewardManager.loadSpin(). */
export interface PendingPrize { kind: 'coins' | 'balls' | 'ramps'; n: number; }
export interface SpinData {
  last: number;
  pending: PendingPrize | null;
  /** Spins owed OUTSIDE the daily cadence - a mystery box's free-spin token.
      Its own field precisely so it cannot disturb `last`, which is the only
      thing the 24-hour timer is measured from. */
  bonus: number;
  /* When the wheel last OPENED ITSELF. Separate from `last`, which only moves
     when a spin is actually taken: a player who is offered the wheel and
     closes it without spinning must not be offered it again on every reload
     for the next 24 hours. */
  offered: number;
}
export interface WalletData { coins: number | null; ramps: number; boosters: number; }

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
    const raw = readJSON<{ last?: unknown; pending?: unknown; offered?: unknown;
                           bonus?: unknown }>(SPIN_KEY, {});
    const last = isFinite(Number(raw.last)) ? Number(raw.last) : 0;
    const offered = isFinite(Number(raw.offered)) ? Number(raw.offered) : 0;
    // absent in every save written before mystery boxes existed
    const bonus = isFinite(Number(raw.bonus)) ? Math.max(0, Number(raw.bonus) | 0) : 0;
    const p = raw.pending;
    /* A bare number is a save from before the wheel paid anything but balls.
       It still owes those balls, so it is read rather than discarded. */
    if (typeof p === 'number' && p > 0)
      return { last, offered, bonus, pending: { kind: 'balls', n: p | 0 } };
    if (p && typeof p === 'object') {
      const { kind, n } = p as PendingPrize;
      if ((kind === 'coins' || kind === 'balls' || kind === 'ramps') && (n | 0) > 0)
        return { last, offered, bonus, pending: { kind, n: n | 0 } };
    }
    return { last, offered, bonus, pending: null };
  }
  saveSpin(last: number, pending: PendingPrize | null = null, offered = 0, bonus = 0): void {
    writeJSON(SPIN_KEY, { last, pending, offered, bonus });
  }

  /** `coins: null` means the game has never been opened - see loadBalls(). */
  loadWallet(): WalletData {
    const raw = readJSON<{ coins?: unknown; ramps?: unknown; boosters?: unknown }>(WALLET_KEY, {});
    const coins = (typeof raw.coins === 'number' && isFinite(raw.coins))
      ? Math.max(0, raw.coins | 0) : null;
    const num = (v: unknown) =>
      (typeof v === 'number' && isFinite(v)) ? Math.max(0, v | 0) : 0;
    /* `boosters` is absent from every wallet written before they existed, and
       reads as zero - which is exactly right: a save from before the item
       shipped owns none of them. */
    return { coins, ramps: num(raw.ramps), boosters: num(raw.boosters) };
  }
  saveWallet(coins: number, ramps: number, boosters = 0): void {
    writeJSON(WALLET_KEY, { coins, ramps, boosters });
  }
}

export const progressStore = new ProgressStore();
