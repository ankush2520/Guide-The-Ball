/* ============================================================
   REWARD MANAGER

   Everything the player EARNS and everything they SPEND:
   stars for a clear, balls for the tank, coins for the wallet,
   spare ramps for the drawer, and the daily wheel.

   Coins are the hub. Clearing a level pays them, the wheel pays
   them, and they buy the other two at a fixed price. Nothing
   converts back, so there is no loop to balance.

   It listens on the bus rather than being called by the game
   loop - 'level:cleared' is a fact the game announces, and
   paying for it is this manager's business alone. That is what
   lets the payout rules change without the drop code moving.
   ============================================================ */
import type { GameBus, BallChangeReason, CoinChangeReason,
              RampChangeReason, PrizeKind } from '../core/events';
import { progressStore, type SaveData, type PendingPrize,
         SAVE_KEY, BALLS_KEY, SPIN_KEY, WALLET_KEY } from './ProgressStore';
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

/* ---- coins ---- */

/* The second currency, and the only one the player ever converts FROM: coins
   buy balls and spare ramps, nothing buys coins back. That one-way flow is
   what keeps the wallet easy to reason about - a coin is always worth exactly
   what the shop says, and there is no arbitrage loop to balance. */
export const STARTING_COINS = 100;
export const BALL_PRICE = 2;
export const RAMP_PRICE = 15;

/* What a clear pays, by Act (the same floor((id-1)/5) bands the ball bonus
   uses) and by stars earned. Playing well is worth roughly double a scrape,
   and the later Acts pay more because they cost more to reach. */
export const COIN_CLEAR = [
  [10, 14, 20],      // Act 1: 1, 2, 3 stars
  [14, 18, 24],
  [18, 22, 28],
  [22, 26, 32],
];

/* Replaying a level you have already cleared pays a quarter. Not nothing -
   grinding a hard board you enjoy should still be worth something - but far
   too little to make farming level 1 a better plan than playing the game. */
export const REPLAY_SHARE = 0.25;
export const REPLAY_MIN = 2;

/** What clearing `levelId` with `stars` pays, first time or on a replay. */
export function coinsFor(levelId: number, stars: number, firstClear: boolean): number {
  const act = clamp(Math.floor((levelId - 1) / 5), 0, COIN_CLEAR.length - 1);
  const full = COIN_CLEAR[act][clamp(stars, 1, 3) - 1];
  return firstClear ? full : Math.max(REPLAY_MIN, Math.round(full * REPLAY_SHARE));
}

/* ---- the wheel ---- */

export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SPIN_MS = 4200;               // length of the spin animation

export interface SpinPrize { kind: PrizeKind; n: number; w: number; }

/* Wedge order is the wheel's layout; `w` is the weight, and they are chosen
   to total 100 so a weight reads as its own percentage.

   The two jackpots - 150 coins and 3 ramps - are deliberately rare. Priced
   in coins (a ramp is 15, a ball is 2) the wheel is worth about 31 coins a
   day on average, which is a level's takings or fifteen balls: enough to be
   worth coming back for, not enough to replace playing. */
export const SPIN_PRIZES: SpinPrize[] = [
  { kind: 'coins', n:  20, w: 22 },
  { kind: 'balls', n:  10, w: 14 },
  { kind: 'ramps', n:   3, w:  6 },
  { kind: 'coins', n: 150, w:  3 },
  { kind: 'balls', n:   5, w: 20 },
  { kind: 'ramps', n:   1, w: 16 },
  { kind: 'coins', n: 100, w:  5 },
  { kind: 'coins', n:  50, w: 14 },
];

/* What the wheel gilds. Two of the eight wedges - the 150 and the 100 - so
   that landing on gold means something; 3 ramps is the next best prize and
   deliberately does NOT get it, or half the wheel would be a jackpot. */
export const JACKPOT_COINS = 60;

/** What a wedge is worth in coins, which is the only way to compare them. */
export function prizeValue(p: SpinPrize): number {
  return p.kind === 'coins' ? p.n
       : p.kind === 'balls' ? p.n * BALL_PRICE
       : p.n * RAMP_PRICE;
}

export const PRIZE_UNIT: Record<PrizeKind, string> = {
  coins: 'coin', balls: 'ball', ramps: 'ramp',
};

/** "150 coins" / "1 ramp" - the wording the wheel and the flash both use. */
export function prizeLabel(kind: PrizeKind, n: number): string {
  return `${n} ${PRIZE_UNIT[kind]}${n === 1 ? '' : 's'}`;
}

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
  coins = STARTING_COINS;
  /** Spare ramps, spendable on ANY level on top of its own budget. */
  extraRamps = 0;
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
  /* The prize the wheel last landed on, held so the panel's once-a-second
     countdown refresh cannot wipe "You won 150 coins!" off the screen a
     quarter second after it appears. */
  spinShown: { kind: PrizeKind; n: number } | null = null;

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

    /* Same rule as the ball tank: no stored wallet at all is a first open and
       gets the starting grant; a corrupt one is treated the same way rather
       than as zero, so a storage glitch cannot leave a player broke. */
    const w = progressStore.loadWallet();
    if (w.coins === null) { this.coins = STARTING_COINS; this.extraRamps = 0; this.saveWallet(); }
    else { this.coins = w.coins; this.extraRamps = w.ramps; }

    this.loadSpin();
    this.bus.emit('balls:changed', { balls: this.balls, delta: 0, reason: 'load' });
    this.bus.emit('coins:changed', { coins: this.coins, delta: 0, reason: 'load' });
    this.bus.emit('ramps:changed', { ramps: this.extraRamps, delta: 0, reason: 'load' });
  }

  /** Wipe every persisted record and return to a first-open state. Used by
      the test suite; there is no in-game path to it. */
  resetAll(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(BALLS_KEY);
      localStorage.removeItem(SPIN_KEY);
      localStorage.removeItem(WALLET_KEY);
    } catch { /* blocked storage */ }
    this.highest = 0;
    this.bestStars = {}; this.bestPickups = {}; this.clearedLevels = {};
    this.tutorialSeen = false; this.obstacleTipSeen = false; this.tipsSeen = {};
    this.spinLast = 0;
    this.spinning = false;
    this.spinShown = null;
    progressStore.saveSpin(0, null);
    this.balls = STARTING_BALLS;
    progressStore.saveBalls(this.balls);
    this.coins = STARTING_COINS;
    this.extraRamps = 0;
    this.saveWallet();
    this.bus.emit('balls:changed', { balls: this.balls, delta: 0, reason: 'load' });
    this.bus.emit('coins:changed', { coins: this.coins, delta: 0, reason: 'load' });
    this.bus.emit('ramps:changed', { ramps: this.extraRamps, delta: 0, reason: 'load' });
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

  /* ---------------- the wallet ---------------- */

  private saveWallet(): void { progressStore.saveWallet(this.coins, this.extraRamps); }

  private setCoins(n: number, delta: number, reason: CoinChangeReason): void {
    this.coins = Math.max(0, n);
    this.saveWallet();
    this.bus.emit('coins:changed', { coins: this.coins, delta, reason });
  }

  private setRamps(n: number, delta: number, reason: RampChangeReason): void {
    this.extraRamps = Math.max(0, n);
    this.saveWallet();
    this.bus.emit('ramps:changed', { ramps: this.extraRamps, delta, reason });
  }

  grantCoins(n: number, reason: CoinChangeReason = 'grant'): void {
    if (!(n > 0)) return;
    this.setCoins(this.coins + n, n, reason);
  }

  grantRamps(n: number, reason: RampChangeReason = 'grant'): void {
    if (!(n > 0)) return;
    this.setRamps(this.extraRamps + n, n, reason);
  }

  /* ---------------- the shop ---------------- */

  ballCost(n: number): number { return Math.max(0, n | 0) * BALL_PRICE; }
  rampCost(n: number): number { return Math.max(0, n | 0) * RAMP_PRICE; }
  canAfford(cost: number): boolean { return cost > 0 && this.coins >= cost; }

  /* Both purchases take the coins and hand over the goods in one step, and
     both refuse outright rather than partially filling an order the player
     cannot afford - a shop that silently sells you four of the five you asked
     for is a shop that has spent your coins without being asked. */
  buyBalls(n: number): boolean {
    const cost = this.ballCost(n);
    if (!this.canAfford(cost)) return false;
    this.setCoins(this.coins - cost, -cost, 'buy');
    this.setBalls(this.balls + (n | 0), n | 0, 'buy');
    return true;
  }

  buyRamps(n: number): boolean {
    const cost = this.rampCost(n);
    if (!this.canAfford(cost)) return false;
    this.setCoins(this.coins - cost, -cost, 'buy');
    this.setRamps(this.extraRamps + (n | 0), n | 0, 'buy');
    return true;
  }

  /** Take one spare ramp out of the drawer for the level on screen. Spent the
      moment it is taken: the budget it joins is this level's, and handing it
      back on a level change would make "how many do I have" depend on where
      the player happened to navigate next. */
  spendExtraRamp(): boolean {
    if (this.extraRamps <= 0) return false;
    this.setRamps(this.extraRamps - 1, -1, 'use');
    return true;
  }

  /** Test-only, like setBallsForTest. */
  setWalletForTest(coins: number, ramps: number): void {
    const c = Math.max(0, coins | 0), r = Math.max(0, ramps | 0);
    this.setCoins(c, c - this.coins, 'grant');
    this.setRamps(r, r - this.extraRamps, 'grant');
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
              { stars: number; bonus: number; coins: number;
                note: string; firstClear: boolean } {
    if (!isLast && levelIndex + 1 > this.highest) this.highest = levelIndex + 1;

    const firstClear = !this.clearedLevels[levelIndex];
    let bonus = 0;
    if (firstClear) { this.clearedLevels[levelIndex] = true; bonus = this.clearBonus(levelId); }

    const stars = starsFor(tries, rampsUsed, budget);
    if (stars > (this.bestStars[levelIndex] | 0)) this.bestStars[levelIndex] = stars;

    /* Coins are paid on EVERY clear, unlike the ball bonus - they are the
       running income the shop is priced against. A replay pays a quarter, so
       a cleared level is still worth returning to and still nowhere near
       worth farming. */
    const coins = coinsFor(levelId, stars, firstClear);

    this.saveProgress();
    // granted after saveProgress() so the ledger and the wallet commit together
    if (bonus > 0) this.grant(bonus, 'clear-bonus');
    this.grantCoins(coins, 'clear');

    return { stars, bonus, coins,
             note: starNote(tries, rampsUsed, budget, stars), firstClear };
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
       flip side is that the prize is then owed, and this is where it is paid.
       Written straight into the fields rather than through the setters: the
       bus has no listeners yet this early, and loadAll() announces the totals
       once it has finished. */
    if (pending) {
      if (pending.kind === 'balls') { this.balls += pending.n; progressStore.saveBalls(this.balls); }
      else if (pending.kind === 'coins') { this.coins += pending.n; this.saveWallet(); }
      else { this.extraRamps += pending.n; this.saveWallet(); }
    }
    progressStore.saveSpin(this.spinLast, null);
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
    const p = SPIN_PRIZES[ix];
    this.spinLast = Date.now();
    this.spinning = true;
    this.spinShown = null;
    progressStore.saveSpin(this.spinLast, { kind: p.kind, n: p.n } as PendingPrize);
    return ix;
  }

  /** Pay a spin whose animation has finished, and clear the owed record. */
  settleSpin(ix: number): void {
    const p = SPIN_PRIZES[ix];
    this.spinning = false;
    this.spinShown = { kind: p.kind, n: p.n };
    progressStore.saveSpin(this.spinLast, null);
    if (p.kind === 'balls') this.grant(p.n, 'spin');
    else if (p.kind === 'coins') this.grantCoins(p.n, 'spin');
    else this.grantRamps(p.n, 'spin');
    this.bus.emit('spin:won', { prizeIndex: ix, kind: p.kind, n: p.n });
  }
}
