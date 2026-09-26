/* The game's event vocabulary. One place to read to learn what the game can
   announce - and the compiler enforces that every emit matches its payload. */
import type { ItemKind } from '../items/items';
import { EventBus } from './EventBus';
import type { Level, Vec } from '../levels/types';
import type { DropResult, HitKind } from '../physics/types';

/** Why a drop ended. `win` is the only outcome that earns the full beat. */
export interface DropEndedPayload {
  result: DropResult;
  level: Level;
  tries: number;
  rampsUsed: number;
}

export interface HitPayload extends Vec {
  kind: HitKind;
  nx: number;
  ny: number;
  speed: number;
}

export interface GameEvents extends Record<string, unknown> {
  /* ---- level flow ---- */
  'level:changed':   { level: Level; index: number };
  'level:cleared':   { level: Level; index: number; stars: number; firstClear: boolean };

  /* ---- the drop ---- */
  'drop:started':    { level: Level; seed: number; tries: number };
  'drop:ended':      DropEndedPayload;
  'ball:hit':        HitPayload;
  'ball:captured':   { level: Level };
  'star:collected':  { index: number; total: number };
  /* A mystery box the ball touched mid-drop. The REWARD is not in here: the
     roll happens once, in the controller, and is announced by 'box:reward' -
     so nothing that merely watches the board can pay a second time. */
  'box:collected':   { index: number };
  /* `x`/`y` are BOARD coordinates - where the chest was. The flight layer
     turns them into screen pixels; nothing below the UI has to know how. */
  'box:reward':      { kind: FlightKind; n: number; x: number; y: number };
  /* The OTHER flavour of mystery box: the gift a wrapped target held, once
     its reveal has played out and the ledger has been credited. Announced
     rather than acted on - the panel that showed it has already flown the
     reward - so anything that wants to watch what a gift paid can. */
  'gift:opened':     { kind: FlightKind; n: number };
  'breakable:broke': { index: number };
  'booster:used':    { index: number };

  /* ---- economy ---- */
  /* This level's balls are all used - the out-of-balls choice opens. */
  'balls:empty':     Record<string, never>;
  'coins:changed':   { coins: number; delta: number; reason: CoinChangeReason };
  'ramps:changed':   { ramps: number; delta: number; reason: RampChangeReason };
  'springs:changed':{ springs: number; delta: number; reason: RampChangeReason };
  /* A spin owed outside the daily cadence. The wheel's own cooldown is
     untouched by it - see RewardManager.grantBonusSpin(). */
  /* The free springs just went into the bag, after their intro card - the
     UI flies them in. */
  'springs:gifted':  { n: number };
  /* Something outside a panel asks the shell to open one (the need-a-spring
     strip's Shop button). */
  'panel:open':      { panel: 'shop' };
  /* A cosmetic was bought, unlocked or worn - the shop and the board re-read. */
  'cosmetics:changed': { id: string };
  'spin:granted':    { bonus: number };
  'spin:won':        { prizeIndex: number; kind: PrizeKind; n: number };

  /* ---- ui / teaching ---- */
  'phase:changed':   { phase: Phase };
  'flash':           { text: string };
  'item:placed':     { kind: ItemKind; index: number };
  'flash:hide':      Record<string, never>;
  'tip:shown':       { key: string; text: string };
}

export type CoinChangeReason = 'clear' | 'spin' | 'grant' | 'load' | 'buy' | 'box' | 'chest' | 'style';
export type RampChangeReason = 'spin' | 'grant' | 'load' | 'buy' | 'use' | 'box' | 'chest';

/** What the player can OWN, and therefore what a payout can land in. The
    wheel pays the first two; a mystery box can also pay a spring. */
export type PrizeKind = 'coins' | 'ramps' | 'springs';

/** What can FLY to somewhere on the HUD. A bonus spin is not a currency and
    has no counter of its own - it lands on the gear, which is where the
    wheel lives - so it is a flight kind and deliberately not a PrizeKind. */
export type FlightKind = PrizeKind | 'spin';

/** 'plan' -> 'drop' -> ('capture' -> 'over') | back to 'plan' on a miss. */
export type Phase = 'plan' | 'drop' | 'capture' | 'over';

/** The one bus the whole game shares. */
export type GameBus = EventBus<GameEvents>;
export const createGameBus = (): GameBus => new EventBus<GameEvents>();
