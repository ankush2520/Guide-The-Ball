/* ============================================================
   REWARD MANAGER

   Everything the player EARNS: stars for a clear, balls for the
   tank, the first-clear bonus, and the daily wheel.

   It listens on the bus rather than being called by the game
   loop - 'level:cleared' is a fact the game announces, and
   paying for it is this manager's business alone. That is what
   lets the payout rules change without the drop code moving.
   ============================================================ */
import type { GameBus, BallChangeReason } from '../core/events';
import { progressStore, type SaveData,
         SAVE_KEY, BALLS_KEY, SPIN_KEY } from './ProgressStore';
import { clamp } from '../physics/math';

/* ---- balls ---- */

// Granted once, on the very first open. Generous on purpose: at one ball per
// drop, a player still learning to read a board burns several per level, and
// the economy should not be the thing they meet first. 75 carries a new
// player well past the point where the game has earned the right to ask.
export const STARTING_BALLS = 75;
export const AD_REWARD = 3;

// First-clear bonus by Act, indexed by floor((levelId - 1) / 5). A level
// solved first time pays for the drop that solved it; the deeper Acts pay for
// a couple of failed attempts as well, which is roughly what they cost.
export const CLEAR_BONUS = [1, 2, 2, 3];

/* ---- the wheel ---- */

export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SPIN_MS = 4200;               // length of the spin animation

// Wedge order is the wheel's layout; `w` is the weight. Deliberately weighted
// toward one and two, with the five a genuine rarity (~3%), so the jackpot
// stays worth wanting. Expected value is a shade under two balls a day.
export const SPIN_PRIZES = [
  { balls: 1, w: 26 }, { balls: 2, w: 20 }, { balls: 1, w: 26 }, { balls: 3, w: 12 },
  { balls: 2, w: 20 }, { balls: 1, w: 26 }, { balls: 5, w: 4  }, { balls: 3, w: 12 },
];

/** Two things are worth rewarding, and they pull against each other: solving
    it in few attempts, and solving it with fewer ramps than the level hands
    you. Retries cost a star; coming in under the ramp budget buys one back,
    so a scrappy solve that is genuinely efficient can still reach three. */
export function starsFor(nTries: number, rampsUsed: number, budget: number): number {
  let s = 3;
  if (nTries > 1) s--;
  if (nTries > 3) s--;
  if (rampsUsed < budget) s++;
  return clamp(s, 1, 3);
}

export function starNote(nTries: number, rampsUsed: number, budget: number, s: number): string {
  const bits = [`try ${nTries}`, `${rampsUsed}/${budget} ramp${budget === 1 ? '' : 's'}`];
  if (s === 3) return `Perfect - ${bits.join(', ')}.`;
  const want: string[] = [];
  if (nTries > 1) want.push('clear it first try');
  if (rampsUsed >= budget) want.push('use fewer ramps');
  return `Cleared on ${bits.join(', ')}. Next star: ${want.join(' or ')}.`;
}

export class RewardManager {
  balls = STARTING_BALLS;
  highest = 0;
  bestStars: Record<number, number> = {};
  bestPickups: Record<number, number> = {};
  clearedLevels: Record<number, boolean> = {};
  tutorialSeen = false;
  obstacleTipSeen = false;
  tipsSeen: Record<string, boolean> = {};

  spinLast = 0;
  /* Wheel animation state. It lives here rather than in the panel component
     because it is game state, not view state: whether a spin is in flight
     decides whether another may start, and the panel can be unmounted and
     remounted without that answer changing. */
  spinning = false;
  /* Cumulative, so a second spin carries on forward rather than snapping
     back. Starts half a wedge round so the pointer rests in the middle of one
     instead of sitting on a dividing line, which reads as a wheel mid-result. */
  wheelDeg = -(360 / SPIN_PRIZES.length) / 2;
  /* A landed prize holds the panel's subtitle until the panel is reopened -
     otherwise the once-a-second countdown refresh wipes "You won 2 balls!"
     off the screen a quarter second after it appears. */
  spinShown = 0;

  constructor(private bus: GameBus, private levelCount: number) {
    this.loadAll();
  }

  /* ---------------- persistence ---------------- */

  private loadAll(): void {
    const s: SaveData = progressStore.load();
    this.highest = clamp((s.highest as number) | 0, 0, this.levelCount - 1);
    this.bestStars = (s.stars && typeof s.stars === 'object') ? s.stars : {};
    this.bestPickups = (s.pickups && typeof s.pickups === 'object') ? s.pickups : {};
    this.tutorialSeen = !!s.tutorialSeen;
    this.obstacleTipSeen = !!s.obstacleTipSeen;
    this.tipsSeen = (s.tips && typeof s.tips === 'object') ? s.tips : {};

    /* Which levels have ever been cleared, so the first-clear bonus is paid
       once and an easy level cannot be farmed for balls. Deliberately its own
       record rather than being read off `highest`: `highest` stops at the last
       level index, so it can never register the finale as cleared, and the
       finale pays the biggest bonus. Players from before this existed are
       migrated by the only thing their save does prove - reaching level N
       means clearing every level below it. */
    if (s.cleared && typeof s.cleared === 'object') this.clearedLevels = s.cleared;
    else {
      const seeded: Record<number, boolean> = {};
      for (let i = 0; i < this.highest; i++) seeded[i] = true;
      this.clearedLevels = seeded;
    }

    const stored = progressStore.loadBalls();
    if (stored === null) { this.balls = STARTING_BALLS; progressStore.saveBalls(this.balls); }
    else this.balls = stored;

    this.loadSpin();
    this.bus.emit('balls:changed', { balls: this.balls, delta: 0, reason: 'load' });
  }

  /** Wipe every persisted record and return to a first-open state. Used by
      the test suite; there is no in-game path to it. */
  resetAll(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(BALLS_KEY);
      localStorage.removeItem(SPIN_KEY);
    } catch { /* blocked storage */ }
    this.highest = 0;
    this.bestStars = {}; this.bestPickups = {}; this.clearedLevels = {};
    this.tutorialSeen = false; this.obstacleTipSeen = false; this.tipsSeen = {};
    this.spinLast = 0;
    this.spinning = false;
    this.spinShown = 0;
    progressStore.saveSpin(0, 0);
    this.balls = STARTING_BALLS;
    progressStore.saveBalls(this.balls);
    this.bus.emit('balls:changed', { balls: this.balls, delta: 0, reason: 'load' });
  }

  saveProgress(): void {
    progressStore.save({
      highest: this.highest, stars: this.bestStars, cleared: this.clearedLevels,
      pickups: this.bestPickups, tutorialSeen: this.tutorialSeen,
      obstacleTipSeen: this.obstacleTipSeen, tips: this.tipsSeen,
    });
  }

  /* ---------------- balls ---------------- */

  private setBalls(n: number, delta: number, reason: BallChangeReason): void {
    this.balls = Math.max(0, n);
    progressStore.saveBalls(this.balls);
    this.bus.emit('balls:changed', { balls: this.balls, delta, reason });
  }

  grant(n: number, reason: 'clear-bonus' | 'ad' | 'spin' | 'grant' = 'grant'): void {
    if (!(n > 0)) return;
    this.setBalls(this.balls + n, n, reason);
  }

  /** Set the tank outright. Test-only: the game itself only ever grants or
      spends, so that the ledger and the balls can never disagree. */
  setBallsForTest(n: number): void {
    this.setBalls(Math.max(0, n | 0), Math.max(0, n | 0) - this.balls, 'grant');
  }

  /** One ball per DROP, win or lose - the fiction is a crate of physical
      balls, and one you threw away is gone either way. Returns false if the
      tank is empty, which is the caller's cue to open the stop screen. */
  spendBall(): boolean {
    if (this.balls <= 0) { this.bus.emit('balls:empty', {}); return false; }
    this.setBalls(this.balls - 1, -1, 'drop');
    return true;
  }

  /** What clearing level `id` pays the FIRST time, and only the first time. */
  clearBonus(id: number): number {
    return CLEAR_BONUS[clamp(Math.floor((id - 1) / 5), 0, CLEAR_BONUS.length - 1)];
  }

  /* ---------------- clearing a level ---------------- */

  /** Record a win and pay what it is worth. Returns the stars earned and the
      bonus paid, so the win card can say so. */
  recordClear(levelIndex: number, levelId: number, isLast: boolean,
              tries: number, rampsUsed: number, budget: number):
              { stars: number; bonus: number; note: string; firstClear: boolean } {
    if (!isLast && levelIndex + 1 > this.highest) this.highest = levelIndex + 1;

    const firstClear = !this.clearedLevels[levelIndex];
    let bonus = 0;
    if (firstClear) { this.clearedLevels[levelIndex] = true; bonus = this.clearBonus(levelId); }

    const stars = starsFor(tries, rampsUsed, budget);
    if (stars > (this.bestStars[levelIndex] | 0)) this.bestStars[levelIndex] = stars;

    this.saveProgress();
    // granted after saveProgress() so the ledger and the balls commit together
    if (bonus > 0) this.grant(bonus, 'clear-bonus');

    return { stars, bonus, note: starNote(tries, rampsUsed, budget, stars), firstClear };
  }

  recordPickups(levelIndex: number, stars: number): void {
    if (stars > (this.bestPickups[levelIndex] | 0)) {
      this.bestPickups[levelIndex] = stars;
      this.saveProgress();
    }
  }

  /* ---------------- the daily wheel ---------------- */

  private loadSpin(): void {
    const { last, pending } = progressStore.loadSpin();
    const now = Date.now();
    this.spinLast = last;
    // a clock that has moved backwards just hands the player a spin; the worst
    // case is one extra spin, where the alternative is a wheel locked forever
    if (this.spinLast > now) this.spinLast = 0;
    /* A spin commits its result to storage BEFORE the wheel starts turning, so
       closing the tab mid-animation cannot be used to re-roll a bad prize. The
       flip side is that the prize is then owed, and this is where it is paid. */
    if (pending > 0) { this.balls += pending; progressStore.saveBalls(this.balls); }
    progressStore.saveSpin(this.spinLast, 0);
  }

  spinReady(now = Date.now()): boolean { return now - this.spinLast >= SPIN_COOLDOWN_MS; }
  msToSpin(now = Date.now()): number {
    return clamp(SPIN_COOLDOWN_MS - (now - this.spinLast), 0, SPIN_COOLDOWN_MS);
  }

  /** Weighted pick over SPIN_PRIZES. Returns the WEDGE INDEX, not the prize. */
  pickPrize(): number {
    let total = 0;
    for (const p of SPIN_PRIZES) total += p.w;
    let r = Math.random() * total;
    for (let i = 0; i < SPIN_PRIZES.length; i++) {
      r -= SPIN_PRIZES[i].w;
      if (r <= 0) return i;
    }
    return SPIN_PRIZES.length - 1;
  }

  /** Commit the result BEFORE the animation runs - see loadSpin(). */
  beginSpin(): number {
    const ix = this.pickPrize();
    this.spinLast = Date.now();
    this.spinning = true;
    this.spinShown = 0;
    progressStore.saveSpin(this.spinLast, SPIN_PRIZES[ix].balls);
    return ix;
  }

  /** Pay a spin whose animation has finished, and clear the owed record. */
  settleSpin(ix: number): void {
    this.spinning = false;
    this.spinShown = SPIN_PRIZES[ix].balls;
    progressStore.saveSpin(this.spinLast, 0);
    this.grant(SPIN_PRIZES[ix].balls, 'spin');
    this.bus.emit('spin:won', { prizeIndex: ix, balls: SPIN_PRIZES[ix].balls });
  }
}
