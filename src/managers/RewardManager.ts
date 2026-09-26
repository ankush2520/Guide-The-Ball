/* ============================================================
   REWARD MANAGER

   Everything the player EARNS and everything they SPEND:
   stars for a clear, coins for the wallet, spare ramps and
   springs for the bag, and the daily wheel.

   Coins are the hub. Clearing a level pays them, the wheel pays
   them, and they buy the items at a fixed price. Nothing
   converts back, so there is no loop to balance.

   BALLS ARE NOT MONEY ANY MORE. Every level hands out its own
   few balls (ballsFor) and the controller counts them down;
   there is no tank to fill, buy or win. See the note there.

   It listens on the bus rather than being called by the game
   loop - 'level:cleared' is a fact the game announces, and
   paying for it is this manager's business alone. That is what
   lets the payout rules change without the drop code moving.
   ============================================================ */
import type {
  GameBus,
  CoinChangeReason,
  RampChangeReason,
  PrizeKind,
  FlightKind,
} from "../core/events";
import {
  progressStore,
  type SaveData,
  type PendingPrize,
  SAVE_KEY,
  SPIN_KEY,
  WALLET_KEY,
} from "./ProgressStore";
import { clamp } from "../physics/math";
import { countryOf } from "../levels";

/* ============================================================
   BALLS: A FEW PER LEVEL, NOT A TANK

   The old tank (75 balls, bought, won, drained one a drop) is
   gone. Every level hands out its own balls on entry; a miss
   uses one, a win ends the level, and running out opens the
   choice to restart (free) or watch an ad to carry on. So a ball
   is never money, and nothing in the economy can be spent on
   one or paid in one.

   The last four cities of a world (positions 17-20 - the oval
   exams) are the hardest boards in it, and get more. Read off
   the level's place in its COUNTRY, never its id, so a world
   that moves keeps the rule.
   ============================================================ */
export const BALLS_PER_LEVEL = 3;
export const BALLS_EXAM = 5;
/** First city of a world that counts as its exam. */
export const EXAM_FROM = 17;
/** What a watched "continue" ad refills. */
export const CONTINUE_BALLS = 3;

/** How many balls level `levelId` hands out on entry. */
export function ballsFor(levelId: number): number {
  const pos = levelId - countryOf(levelId).from + 1;
  return pos >= EXAM_FROM ? BALLS_EXAM : BALLS_PER_LEVEL;
}

/* ---- coins ---- */

/* The one currency, and the only thing the player ever converts FROM: coins
   buy spare ramps and springs, nothing buys coins back. That one-way flow is
   what keeps the wallet easy to reason about - a coin is always worth exactly
   what the shop says, and there is no arbitrage loop to balance. */
export const STARTING_COINS = 100;
export const RAMP_PRICE = 15;
/* Twice a spare ramp, and the factor is the point: a spring is worth two of
   them, which is a price a player can hold in their head. It is also the one
   item that is only CHARGED FOR WHEN IT WORKS - see spendSpring - so what it
   really prices is a solved board, not an attempt at one. */
export const SPRING_PRICE = 30;

/* ---- springs unlock at level 10 ---- */

/* Level 10 is where the game starts being about how FAST as well as where:
   the first world's exam (17-20) cannot be solved without a spring, so the
   spring has to be in the player's hands - and explained - well before it.
   It used to unlock at 21, which left 17-20 impossible for a real player.
   Before 10 the spring does not exist anywhere: not in the shop, not in the
   bag, and not in a mystery box's prize table. */
export const SPRING_UNLOCK_LEVEL = 10;
/** The same gate as an index into LEVELS, which is what progress is kept in. */
export const SPRING_UNLOCK_INDEX = SPRING_UNLOCK_LEVEL - 1;
/** What reaching level 10 for the first time is worth: two, free, on the
    house - one to learn on and one to keep. An item nobody has ever held is
    an item nobody buys. */
export const SPRING_GIFT = 2;

/* ============================================================
   SPARE RAMPS: A SCARCE RESCUE

   One spare at most on any level, and none at all on the first
   few (the lessons are about the level's own ramps). Placing one
   only RESERVES it - it is taken from the bag on a win, and a
   restart, leaving, or removing it hands it back. A clear that
   used one is capped below the top rating, and so is a clear
   with a hint: help can buy a solve, never a perfect one.
   ============================================================ */
export const SPARE_PER_LEVEL = 1;
/** Spares cannot be used on levels 1..SPARE_FROM-1. */
export const SPARE_FROM = 6;
/** The best rating a helped clear (spare ramp or hint) can earn. */
export const HELPED_MAX_STARS = 2;
/** Restarts in one level entry before the "Stuck?" offer appears. */
export const STUCK_AFTER_RESTARTS = 2;

/** What helped a clear, if anything. */
export type Help = 'spare' | 'hint' | null;

/* ---- what the shop sells ---- */

/* BUNDLES, not straight multiples. A bulk row priced at exactly ten times the
   single is not an offer - there is no reason to ever press it over ten taps
   of the single, and it teaches the player that the shop holds no decision.
   So the quantity climbs faster than the price: the big ramp bundle is 14
   for the price of 10.

   RAMP_PRICE and SPRING_PRICE stay the LIST price - one unit, no discount.
   They are what the wheel values its wedges at and what the panels quote, so
   they must keep meaning "a ramp costs this", not "a ramp costs this if you
   buy one at a time and nothing else".

   Each bundle's price is a multiple of the one below it (45 = 3x15,
   150 = 10x15) and each is better value than the one below. Those two facts together are what make `bestBuy` exactly optimal
   with a plain greedy walk; break either and it becomes a knapsack that
   greedy can quietly get wrong. */
export interface Bundle {
  n: number;
  coins: number;
}

export const RAMP_BUNDLES: readonly Bundle[] = [
  { n: 1, coins: 15 },
  { n: 4, coins: 45 },
  { n: 14, coins: 150 },
];
/* The ramp table at twice the price, quantity for quantity, so the two shop
   sections state the same offer and a player only has to learn it once: four
   for the price of three, fourteen for the price of ten. */
export const SPRING_BUNDLES: readonly Bundle[] = [
  { n: 1, coins: SPRING_PRICE },
  { n: 4, coins: SPRING_PRICE * 3 },
  { n: 14, coins: SPRING_PRICE * 10 },
];

/** What `n` of something costs: the bundle price when `n` is exactly a bundle,
    the plain list price otherwise. Only the shop's own rows are discounted -
    the debug hook and any other caller can ask for any quantity and gets the
    honest per-unit sum rather than an interpolated bargain. */
function priced(bundles: readonly Bundle[], n: number, unit: number): number {
  const k = Math.max(0, n | 0);
  return bundles.find((b) => b.n === k)?.coins ?? k * unit;
}

/** The most units `coins` can actually buy, spending across as many bundles as
    it takes. Exact rather than approximate - see the divisibility note above -
    so the panels can promise a number the shop will really hand over. */
export function bestBuy(bundles: readonly Bundle[], coins: number): number {
  let left = Math.max(0, Math.floor(coins));
  let got = 0;
  for (let i = bundles.length - 1; i >= 0; i--) {
    const take = Math.floor(left / bundles[i].coins);
    got += take * bundles[i].n;
    left -= take * bundles[i].coins;
  }
  return got;
}

/* What a clear pays, by Act (the same floor((id-1)/5) bands the ball bonus
   uses) and by stars earned. Playing well is worth roughly double a scrape,
   and the later Acts pay more because they cost more to reach. */
export const COIN_CLEAR = [
  [10, 14, 20], // Act 1: 1, 2, 3 stars
  [14, 18, 24],
  [18, 22, 28],
  [22, 26, 32],
];

/* ============================================================
   A BOARD PAYS ONCE

   Replaying a cleared level pays NOTHING, and the reason is
   arithmetic rather than taste.

   Balls are free now, so a replay costs nothing at all - which
   makes ANY replay payout a machine that prints coins from the
   board the player has already solved, the fastest board in the
   game. A farm only has to be positive to be a farm.

   There is no rate that is both worth collecting and safe. One
   coin a replay is safe and beneath noticing; anything a player
   would cross the room for is farmable. So the honest rule is
   the simple one: the clear that first beats a board is what it
   pays, and after that the board is practice. The stars still
   improve, which is what a replay is actually for.

   Everything else on a level already worked this way - the
   chest, the gift in a target - so
   this makes the coins the last thing to stop being repeatable,
   rather than a rule invented for them.
   ============================================================ */
export const REPLAY_SHARE = 0;

/** What clearing `levelId` with `stars` pays, first time or on a replay. */
export function coinsFor(
  levelId: number,
  stars: number,
  firstClear: boolean,
): number {
  const act = clamp(Math.floor((levelId - 1) / 5), 0, COIN_CLEAR.length - 1);
  const full = COIN_CLEAR[act][clamp(stars, 1, 3) - 1];
  return firstClear ? full : Math.round(full * REPLAY_SHARE);
}

/* ---- the wheel ---- */

export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SPIN_MS = 4200; // length of the spin animation

/** What the WHEEL can pay. A spring is not on it: the wheel is a daily
    fixture from level 1, and it may not hand out an item that does not exist
    until level 10. Mystery boxes can, because they know what level they are
    on - see BOX_PRIZES. */
export type WheelKind = "coins" | "ramps";

export interface SpinPrize {
  kind: WheelKind;
  n: number;
  w: number;
}

/* Wedge order is the wheel's layout; `w` is the weight, and they are chosen
   to total 100 so a weight reads as its own percentage. No balls: a ball is
   not something the player can own any more. The 200-coin wedge is the rare
   jackpot, and 3 ramps the next best. */
export const SPIN_PRIZES: SpinPrize[] = [
  { kind: "coins", n: 20, w: 24 },
  { kind: "ramps", n: 1, w: 18 },
  { kind: "coins", n: 60, w: 14 },
  { kind: "coins", n: 200, w: 3 },
  { kind: "coins", n: 40, w: 22 },
  { kind: "ramps", n: 2, w: 10 },
  { kind: "coins", n: 100, w: 7 },
  { kind: "ramps", n: 3, w: 2 },
];

/* What the wheel gilds. Two of the eight wedges - the 200 and the 100 - so
   that landing on gold means something; 3 ramps is the next best prize and
   deliberately does NOT get it, or half the wheel would be a jackpot. */
export const JACKPOT_COINS = 60;

/** What a payout is worth in coins, which is the only way to compare kinds.
    The shop's list prices are the exchange rate, so this is the one place
    that has to move when one of them does. */
export function unitValue(kind: PrizeKind): number {
  return kind === "coins" ? 1 : kind === "ramps" ? RAMP_PRICE : SPRING_PRICE;
}

/** What a wedge is worth in coins, which is the only way to compare them. */
export function prizeValue(p: SpinPrize): number {
  return p.n * unitValue(p.kind);
}

export const PRIZE_UNIT: Record<FlightKind, string> = {
  coins: "coin",
  ramps: "ramp",
  springs: "spring",
  spin: "free spin",
};

/** "150 coins" / "1 ramp" - the wording the wheel and the flash both use. */
export function prizeLabel(kind: FlightKind, n: number): string {
  return `${n} ${PRIZE_UNIT[kind]}${n === 1 ? "" : "s"}`;
}

/* ============================================================
   WHAT A MYSTERY BOX PAYS

   ONE TABLE, weights totalling 100 so each reads as its own
   percentage - the same convention the wheel's wedges use.

   Weighted, not uniform: coins are the common drop and carry
   the table, a spring or a free spin is the one you tell
   someone about. Retuning the drop rates is editing these
   numbers and nothing else - rollBoxPrize() reads the table and
   knows nothing about what is in it.

   Worth roughly 14 coins an open at these weights, about what a
   level clear pays - and a box is claimed once per level, for
   good, so the whole game's boxes are a fixed purse rather than
   an income.
   ============================================================ */
export interface BoxPrize {
  kind: FlightKind;
  n: number;
  w: number;
}

export const BOX_PRIZES: readonly BoxPrize[] = [
  { kind: "coins", n: 10, w: 30 },
  { kind: "coins", n: 25, w: 16 },
  { kind: "ramps", n: 1, w: 14 },
  { kind: "springs", n: 1, w: 6 },
  { kind: "spin", n: 1, w: 4 },
];

/** Two things are worth rewarding, and they pull against each other: solving
    it in few attempts, and solving it with fewer ramps than the level hands
    you. Retries cost a star; coming in under the ramp budget buys one back,
    so a scrappy solve that is genuinely efficient can still reach three. */
export function starsFor(
  nTries: number,
  rampsUsed: number,
  budget: number,
): number {
  let s = 3;
  if (nTries > 1) s--;
  if (nTries > 3) s--;
  if (rampsUsed < budget) s++;
  return clamp(s, 1, 3);
}

export function starNote(
  nTries: number,
  rampsUsed: number,
  budget: number,
  s: number,
): string {
  const bits = [
    `try ${nTries}`,
    `${rampsUsed}/${budget} ramp${budget === 1 ? "" : "s"}`,
  ];
  if (s === 3) return `Perfect - ${bits.join(", ")}.`;
  const want: string[] = [];
  if (nTries > 1) want.push("clear it first try");
  if (rampsUsed >= budget) want.push("use fewer ramps");
  return `Cleared on ${bits.join(", ")}. Next star: ${want.join(" or ")}.`;
}

/** The dev unlock: DEV builds only, and only when asked for in storage. */
function unlockAll(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("gtb-unlock-all") === "1";
  } catch {
    return false;
  }
}

export class RewardManager {
  coins = STARTING_COINS;
  /** Coins a player's old ball tank was converted into on this load, once -
      the controller says so and zeroes it. 0 on every later load. */
  migratedCoins = 0;
  /** Spare ramps, spendable on ANY level on top of its own budget. */
  extraRamps = 0;
  /** Springs in the bag. Unlike a ramp, one is only CHARGED FOR when the drop
      that used it wins - see spendSpring. */
  springs = 0;
  /** Whether the one free spring has been handed over yet. */
  springGift = false;
  /** Which levels have had their mystery box opened, by level INDEX. */
  claimedBoxes: Record<number, boolean> = {};
  /** And which have had the gift in their TARGET opened. Same shape, same
      once-per-level-for-good rule, separate record - see SaveData.gifts. */
  claimedGifts: Record<number, boolean> = {};
  /** Spins owed outside the daily cadence. See grantBonusSpin(). */
  bonusSpins = 0;

  /* ============================================================
     UNLOCK EVERYTHING - the dev switch

     In a DEV build only, set localStorage 'gtb-unlock-all' to '1'
     and every level in the game is open in the picker. It used to
     be a commented-out `return` - which shipped switched ON once,
     because the one line that turns it on looks exactly like the
     line that turns it off. Behind import.meta.env.DEV a production
     build cannot reach it at all, whatever is in storage.

     It is a VIEW over progress, not a change to it. The real
     high-water mark lives in `_highest` and is what gets written
     to localStorage, what records a clear, and what seeds an old
     save - so playing with this on cannot promote you, and
     commenting it back out returns you to exactly the level you
     had actually reached. That is the whole reason this is a
     getter rather than `highest = LEVELS.length - 1` somewhere
     at boot: that version writes itself into your save the first
     time the game autosaves, and there is no way back.
     ============================================================ */
  get highest(): number {
    return unlockAll() ? this.levelCount - 1 : this._highest;
  }
  set highest(n: number) {
    this._highest = n;
  }
  private _highest = 0;

  /** Where to resume on boot: the level actually reached, never the unlocked
      ceiling. Reading `highest` here would drop you straight into the LAST
      level in the game the moment the dev switch is on, which is the opposite
      of what unlocking everything is for - the point is to be able to go
      anywhere, not to be sent to the end. */
  get resumeAt(): number {
    return this._highest;
  }
  /* ============================================================
     THE BOOSTER GATE

     Read off the REAL high-water mark, never `highest` - that
     getter is the dev unlock's view and reports the last level
     in the game, which would open the shop's spring section on
     a brand new save.

     Two ways in, and they answer different questions. `_highest`
     is progression: a player who has worked their way to 10 has
     reached it whatever level they are standing on now. The gift
     flag is the record of actually having been there, which is
     what covers arriving by the picker.
     ============================================================ */
  get springsUnlocked(): boolean {
    return this.springGift || this._highest >= SPRING_UNLOCK_INDEX;
  }

  /* ============================================================
     THE SPRING GIFT, IN TWO HALVES

     springGiftDue() - on entering a level of 10 or deeper with the
     gift not yet given: the controller shows the "New power:
     Spring!" card first. claimSpringGift() - when that card is
     dismissed: THEN the springs are credited (and fly into the
     bag). Splitting them means a reload with the card still up
     shows the card again rather than having quietly paid already.
     ============================================================ */
  springGiftDue(levelId: number): boolean {
    return !this.springGift && levelId >= SPRING_UNLOCK_LEVEL;
  }

  claimSpringGift(): number {
    if (this.springGift) return 0;
    this.springGift = true;
    this.saveProgress();
    this.grantSprings(SPRING_GIFT, "grant");
    return SPRING_GIFT;
  }

  /** Whether the spring walkthrough (bag -> Use -> ramp) has been shown
      through to the end, or skipped. Once, ever. */
  springUnlockSeen = false;

  /** Has this level's mystery box already been taken? */
  boxClaimed(levelIndex: number): boolean {
    return !!this.claimedBoxes[levelIndex];
  }

  /** Has the gift in this level's target already been opened? */
  giftClaimed(levelIndex: number): boolean {
    return !!this.claimedGifts[levelIndex];
  }

  /* ============================================================
     CLAIMING THE GIFT IN A TARGET

     The chest's rule exactly: once per level, for good, written
     to storage the moment it is claimed. A board cleared again
     tomorrow shows no gift, the same way its chest shows an empty
     outline - treasure is treasure, and a win you can repeat must
     not be an income.

     Returns false if it was already taken, which is the caller's
     cue to run the ordinary win with no gift beat at all.
     ============================================================ */
  claimGift(levelIndex: number): boolean {
    if (this.claimedGifts[levelIndex]) return false;
    this.claimedGifts[levelIndex] = true;
    this.saveProgress();
    return true;
  }

  /** Mark it taken, for good. Returns false if it already was, which is the
      caller's cue that this open pays nothing. */
  claimBox(levelIndex: number): boolean {
    if (this.claimedBoxes[levelIndex]) return false;
    this.claimedBoxes[levelIndex] = true;
    this.saveProgress();
    return true;
  }

  bestStars: Record<number, number> = {};
  bestPickups: Record<number, number> = {};
  clearedLevels: Record<number, boolean> = {};
  tutorialSeen = false;
  obstacleTipSeen = false;
  tipsSeen: Record<string, boolean> = {};

  spinLast = 0;
  /* When the wheel last opened itself. See ProgressStore.SpinData. */
  spinOffered = 0;

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

  constructor(
    private bus: GameBus,
    private levelCount: number,
  ) {
    this.loadAll();
  }

  /* ---------------- persistence ---------------- */

  private loadAll(): void {
    const s: SaveData = progressStore.load();
    this._highest = clamp((s.highest as number) | 0, 0, this.levelCount - 1);
    this.bestStars = s.stars && typeof s.stars === "object" ? s.stars : {};
    this.bestPickups =
      s.pickups && typeof s.pickups === "object" ? s.pickups : {};
    this.tutorialSeen = !!s.tutorialSeen;
    this.obstacleTipSeen = !!s.obstacleTipSeen;
    this.tipsSeen = s.tips && typeof s.tips === "object" ? s.tips : {};
    this.springGift = !!s.springGift;
    this.springUnlockSeen = !!s.springUnlockSeen;
    this.claimedBoxes = s.boxes && typeof s.boxes === "object" ? s.boxes : {};
    this.claimedGifts = s.gifts && typeof s.gifts === "object" ? s.gifts : {};

    /* Which levels have ever been cleared, so the first-clear bonus is paid
       once and an easy level cannot be farmed for balls. Deliberately its own
       record rather than being read off `highest`: `highest` stops at the last
       level index, so it can never register the finale as cleared, and the
       finale pays the biggest bonus. Players from before this existed are
       migrated by the only thing their save does prove - reaching level N
       means clearing every level below it. */
    if (s.cleared && typeof s.cleared === "object")
      this.clearedLevels = s.cleared;
    else {
      const seeded: Record<number, boolean> = {};
      // _highest, not highest: with the dev unlock on, the override would
      // migrate an old save into having "cleared" every level in the game
      // and pay out every first-clear bonus with it.
      for (let i = 0; i < this._highest; i++) seeded[i] = true;
      this.clearedLevels = seeded;
    }

    /* Same rule as the ball tank: no stored wallet at all is a first open and
       gets the starting grant; a corrupt one is treated the same way rather
       than as zero, so a storage glitch cannot leave a player broke. */
    const w = progressStore.loadWallet();
    if (w.coins === null) {
      this.coins = STARTING_COINS;
      this.extraRamps = 0;
      this.springs = 0;
      this.saveWallet();
    } else {
      this.coins = w.coins;
      this.extraRamps = w.ramps;
      this.springs = w.springs;
    }

    this.loadSpin();
    this.migrateBalls(s);
    this.bus.emit("coins:changed", {
      coins: this.coins,
      delta: 0,
      reason: "load",
    });
    this.bus.emit("ramps:changed", {
      ramps: this.extraRamps,
      delta: 0,
      reason: "load",
    });
    this.bus.emit("springs:changed", {
      springs: this.springs,
      delta: 0,
      reason: "load",
    });
  }

  /* ============================================================
     THE OLD BALL TANK, CASHED IN

     A save from before balls became free per level may still hold
     a tank of them. They are not thrown away: each is turned into
     one coin, ONCE, and the key is deleted. `migratedBalls` in the
     save is what makes it once - a player with an empty tank gets
     the flag too, so the check never runs again.
     ============================================================ */
  private migrateBalls(s: SaveData): void {
    if (s.migratedBalls) return;
    const old = progressStore.loadBalls();
    progressStore.clearBalls();
    if (old !== null && old > 0) {
      this.coins += old;
      this.saveWallet();
      this.migratedCoins = old;
    }
    this.saveProgress();
  }

  /** Wipe every persisted record and return to a first-open state. Used by
      the test suite; there is no in-game path to it. */
  resetAll(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SPIN_KEY);
      localStorage.removeItem(WALLET_KEY);
    } catch {
      /* blocked storage */
    }
    this.highest = 0;
    this.bestStars = {};
    this.bestPickups = {};
    this.clearedLevels = {};
    this.tutorialSeen = false;
    this.obstacleTipSeen = false;
    this.tipsSeen = {};
    this.springGift = false;
    this.springUnlockSeen = false;
    this.claimedBoxes = {};
    this.claimedGifts = {};
    this.spinLast = 0;
    this.spinOffered = 0;
    this.bonusSpins = 0;
    this.spinning = false;
    this.spinShown = null;
    progressStore.saveSpin(0, null, 0, 0);
    this.coins = STARTING_COINS;
    this.extraRamps = 0;
    this.springs = 0;
    this.saveWallet();
    this.saveProgress();
    this.bus.emit("coins:changed", {
      coins: this.coins,
      delta: 0,
      reason: "load",
    });
    this.bus.emit("ramps:changed", {
      ramps: this.extraRamps,
      delta: 0,
      reason: "load",
    });
    this.bus.emit("springs:changed", {
      springs: this.springs,
      delta: 0,
      reason: "load",
    });
  }

  saveProgress(): void {
    progressStore.save({
      // the REAL mark - the dev unlock must never persist itself
      highest: this._highest,
      stars: this.bestStars,
      cleared: this.clearedLevels,
      pickups: this.bestPickups,
      tutorialSeen: this.tutorialSeen,
      obstacleTipSeen: this.obstacleTipSeen,
      tips: this.tipsSeen,
      springGift: this.springGift,
      boxes: this.claimedBoxes,
      gifts: this.claimedGifts,
      migratedBalls: true,
      springUnlockSeen: this.springUnlockSeen,
    });
  }

  /* ---------------- the wallet ---------------- */

  private saveWallet(): void {
    progressStore.saveWallet(this.coins, this.extraRamps, this.springs);
  }

  private setCoins(n: number, delta: number, reason: CoinChangeReason): void {
    this.coins = Math.max(0, n);
    this.saveWallet();
    this.bus.emit("coins:changed", { coins: this.coins, delta, reason });
  }

  private setRamps(n: number, delta: number, reason: RampChangeReason): void {
    this.extraRamps = Math.max(0, n);
    this.saveWallet();
    this.bus.emit("ramps:changed", { ramps: this.extraRamps, delta, reason });
  }

  grantCoins(n: number, reason: CoinChangeReason = "grant"): void {
    if (!(n > 0)) return;
    this.setCoins(this.coins + n, n, reason);
  }

  grantRamps(n: number, reason: RampChangeReason = "grant"): void {
    if (!(n > 0)) return;
    this.setRamps(this.extraRamps + n, n, reason);
  }

  private setBoosters(
    n: number,
    delta: number,
    reason: RampChangeReason,
  ): void {
    this.springs = Math.max(0, n);
    this.saveWallet();
    this.bus.emit("springs:changed", {
      springs: this.springs,
      delta,
      reason,
    });
  }

  grantSprings(n: number, reason: RampChangeReason = "grant"): void {
    if (!(n > 0)) return;
    this.setBoosters(this.springs + n, n, reason);
  }

  /* ---------------- the shop ---------------- */

  rampCost(n: number): number {
    return priced(RAMP_BUNDLES, n, RAMP_PRICE);
  }
  springCost(n: number): number {
    return priced(SPRING_BUNDLES, n, SPRING_PRICE);
  }
  canAfford(cost: number): boolean {
    return cost > 0 && this.coins >= cost;
  }

  /* Both purchases take the coins and hand over the goods in one step, and
     both refuse outright rather than partially filling an order the player
     cannot afford - a shop that silently sells you four of the five you asked
     for is a shop that has spent your coins without being asked. */
  buyRamps(n: number): boolean {
    const cost = this.rampCost(n);
    if (!this.canAfford(cost)) return false;
    this.setCoins(this.coins - cost, -cost, "buy");
    this.setRamps(this.extraRamps + (n | 0), n | 0, "buy");
    return true;
  }

  /** Refuses outright before level 10, the same way it refuses an order the
      wallet cannot cover. The shop hides the section as well, but the gate
      belongs HERE: a panel that is merely not rendered is not a rule. */
  buySprings(n: number): boolean {
    if (!this.springsUnlocked) return false;
    const cost = this.springCost(n);
    if (!this.canAfford(cost)) return false;
    this.setCoins(this.coins - cost, -cost, "buy");
    this.setBoosters(this.springs + (n | 0), n | 0, "buy");
    return true;
  }

  /** Take the spare ramp a WINNING clear used out of the bag - see the
      SPARE RAMPS note: placing one only reserved it. */
  spendExtraRamp(): boolean {
    if (this.extraRamps <= 0) return false;
    this.setRamps(this.extraRamps - 1, -1, "use");
    return true;
  }

  /* ============================================================
     A BOOSTER IS PAID FOR ON THE WIN

     Deliberately NOT the ramp's rule. A spare ramp is spent the
     moment it is taken out of the drawer, because what it buys
     is a bigger budget on this board whatever happens next.

     A spring buys the SOLVE. Fitting one costs nothing, missing
     with one costs nothing - the player is free to drop, watch,
     move it and drop again all day - and it is only taken out of
     the bag when the drop it was part of actually wins. Which is
     why this is its own path and not a second caller of the
     ramp's: the two are spent at different moments on purpose.
     ============================================================ */
  spendSpring(): boolean {
    if (this.springs <= 0) return false;
    this.setBoosters(this.springs - 1, -1, "use");
    return true;
  }

  /** Test-only: set the wallet outright. */
  setWalletForTest(coins: number, ramps: number, springs?: number): void {
    const c = Math.max(0, coins | 0),
      r = Math.max(0, ramps | 0);
    this.setCoins(c, c - this.coins, "grant");
    this.setRamps(r, r - this.extraRamps, "grant");
    if (springs !== undefined) {
      const b = Math.max(0, springs | 0);
      this.setBoosters(b, b - this.springs, "grant");
    }
  }

  /* ---------------- clearing a level ---------------- */

  /** Record a win and pay what it is worth. Returns the stars earned and the
      coins paid, so the win card can say so. */
  recordClear(
    levelIndex: number,
    levelId: number,
    isLast: boolean,
    tries: number,
    rampsUsed: number,
    budget: number,
    help: Help = null,
  ): {
    stars: number;
    coins: number;
    note: string;
    firstClear: boolean;
  } {
    // compared against the real mark so genuine progress still advances
    // normally while the dev unlock is on
    if (!isLast && levelIndex + 1 > this._highest)
      this._highest = levelIndex + 1;

    const firstClear = !this.clearedLevels[levelIndex];
    if (firstClear) this.clearedLevels[levelIndex] = true;

    /* A spare ramp or a hint caps the rating: help buys a solve, and the
       note says what the third star wants instead. */
    const raw = starsFor(tries, rampsUsed, budget);
    const stars = help ? Math.min(raw, HELPED_MAX_STARS) : raw;
    if (stars > (this.bestStars[levelIndex] | 0))
      this.bestStars[levelIndex] = stars;

    /* Coins are the running income the shop is priced against, and they are
       paid by the clear that FIRST beats a board - see coinsFor. A replay
       pays nothing: replays are free, so any repeat payout is a farm. */
    const coins = coinsFor(levelId, stars, firstClear);

    this.saveProgress();
    // granted after saveProgress() so the ledger and the wallet commit together
    this.grantCoins(coins, "clear");

    return {
      stars,
      coins,
      note: help === 'spare'
        ? "Cleared with a spare ramp. Solve it without help for 3 stars."
        : help === 'hint'
          ? "Cleared with a hint. Solve it without help for 3 stars."
          : starNote(tries, rampsUsed, budget, stars),
      firstClear,
    };
  }

  recordPickups(levelIndex: number, stars: number): void {
    if (stars > (this.bestPickups[levelIndex] | 0)) {
      this.bestPickups[levelIndex] = stars;
      this.saveProgress();
    }
  }

  /* ---------------- the daily wheel ---------------- */

  private loadSpin(): void {
    const { last, pending, offered, bonus } = progressStore.loadSpin();
    const now = Date.now();
    this.spinLast = last;
    this.bonusSpins = bonus;
    this.spinOffered = offered > now ? 0 : offered;
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
      /* An owed ball prize from before balls were free is paid in coins, one
         for one - the same rate the tank itself was cashed in at. */
      if (pending.kind === "balls" || pending.kind === "coins") {
        this.coins += pending.n;
        this.saveWallet();
      } else {
        this.extraRamps += pending.n;
        this.saveWallet();
      }
    }
    progressStore.saveSpin(this.spinLast, null, this.spinOffered, this.bonusSpins);
  }

  /* ============================================================
     THE COOLDOWN, AND THE WAY PAST IT

     `dailyReady` is the 24-hour clock and the only thing that
     ever moves `spinLast`. `spinReady` is the question the gear
     and the Spin button actually ask - "may I spin now?" - and a
     bonus token answers yes without the clock having anything to
     do with it.

     Keeping them apart is what lets a mystery box hand out a
     spin without shortening, lengthening or resetting the daily
     one. A token spent today leaves tomorrow's free spin due at
     exactly the moment it was already due.
     ============================================================ */
  dailyReady(now = Date.now()): boolean {
    return now - this.spinLast >= SPIN_COOLDOWN_MS;
  }

  spinReady(now = Date.now()): boolean {
    return this.bonusSpins > 0 || this.dailyReady(now);
  }

  /** A spin owed outside the daily cadence - a mystery box's free-spin
      token. Stacks, so two boxes in a row are two spins. */
  grantBonusSpin(n = 1): void {
    if (!(n > 0)) return;
    this.bonusSpins += n | 0;
    progressStore.saveSpin(this.spinLast, null, this.spinOffered, this.bonusSpins);
    this.bus.emit("spin:granted", { bonus: this.bonusSpins });
  }

  /* ---- letting itself in ----

     A daily reward nobody remembers to collect is not a daily reward, so once
     a spin is available the wheel opens on its own. ONCE per availability,
     though: `offered` is moved past `spinLast` when it opens, and only a spin
     (which moves `spinLast` forward again) re-arms it. Closing the wheel
     without spinning therefore leaves it alone until the next day, rather
     than raising it again on the next reload. */
  /* The DAILY one only. A bonus token must not make the wheel let itself in:
     the token was won on the board a moment ago, the flash and the gear
     already say so, and a modal that opens itself mid-play is the one thing
     this whole mechanism was built to avoid doing twice. */
  shouldOfferSpin(now = Date.now()): boolean {
    return this.dailyReady(now) && this.spinOffered <= this.spinLast;
  }

  markSpinOffered(now = Date.now()): void {
    this.spinOffered = now;
    progressStore.saveSpin(this.spinLast, null, this.spinOffered, this.bonusSpins);
  }
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

  /** Commit the result BEFORE the animation runs - see loadSpin().

      The FREE daily spin is always spent first when it is due; a token is
      only drawn on when it is the only way this spin could happen. That
      ordering is what keeps a token worth what it says: spending one on a day
      the wheel was free anyway would quietly buy nothing. */
  beginSpin(): number {
    const ix = this.pickPrize();
    const p = SPIN_PRIZES[ix];
    if (this.dailyReady()) this.spinLast = Date.now();
    else if (this.bonusSpins > 0) this.bonusSpins--;
    else return ix;                     // not spinnable; the UI never calls it
    this.spinning = true;
    this.spinShown = null;
    progressStore.saveSpin(
      this.spinLast,
      { kind: p.kind, n: p.n } as PendingPrize,
      this.spinOffered,
      this.bonusSpins,
    );
    return ix;
  }

  /** Pay a spin whose animation has finished, and clear the owed record. */
  settleSpin(ix: number): void {
    const p = SPIN_PRIZES[ix];
    this.spinning = false;
    this.spinShown = { kind: p.kind, n: p.n };
    progressStore.saveSpin(this.spinLast, null, this.spinOffered, this.bonusSpins);
    if (p.kind === "coins") this.grantCoins(p.n, "spin");
    else this.grantRamps(p.n, "spin");
    this.bus.emit("spin:won", { prizeIndex: ix, kind: p.kind, n: p.n });
  }

  /* ---------------- mystery boxes ---------------- */

  /** The table this level is allowed to roll on. Boosters are REMOVED rather
      than re-rolled: a prize that cannot be paid must not be able to come up
      at all, or the weights stop meaning what BOX_PRIZES says they mean. */
  boxTableFor(levelId: number): readonly BoxPrize[] {
    const ok = this.springsUnlocked && levelId >= SPRING_UNLOCK_LEVEL;
    return ok ? BOX_PRIZES : BOX_PRIZES.filter((p) => p.kind !== "springs");
  }

  /** Weighted pick over that table - the same walk the wheel uses. */
  rollBoxPrize(levelId: number, rnd = Math.random()): BoxPrize {
    const table = this.boxTableFor(levelId);
    let total = 0;
    for (const p of table) total += p.w;
    let r = clamp(rnd, 0, 0.999999) * total;
    for (const p of table) {
      r -= p.w;
      if (r <= 0) return p;
    }
    return table[table.length - 1];
  }

  /** Hand over what a box rolled. One place, so every kind of box prize is
      paid the same way and the 'box' reason is what the ledger shows - the
      chest on the board and the gift inside a target both come through here,
      which is what keeps the two flavours worth the same thing.

      Takes the kind and the amount rather than a whole table row: the weight
      is how a prize was PICKED and has nothing to do with paying it. */
  payBoxPrize(p: { kind: FlightKind; n: number }): void {
    switch (p.kind) {
      case "coins":
        this.grantCoins(p.n, "box");
        break;
      case "ramps":
        this.grantRamps(p.n, "box");
        break;
      case "springs":
        this.grantSprings(p.n, "box");
        break;
      case "spin":
        this.grantBonusSpin(p.n);
        break;
    }
  }
}
