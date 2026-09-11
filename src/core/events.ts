/* The game's event vocabulary. One place to read to learn what the game can
   announce - and the compiler enforces that every emit matches its payload. */
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
  'breakable:broke': { index: number };
  'portal:used':     { index: number };
  'booster:used':    { index: number };

  /* ---- economy ---- */
  'balls:changed':   { balls: number; delta: number; reason: BallChangeReason };
  'balls:empty':     Record<string, never>;
  'coins:changed':   { coins: number; delta: number; reason: CoinChangeReason };
  'ramps:changed':   { ramps: number; delta: number; reason: RampChangeReason };
  'spin:won':        { prizeIndex: number; kind: PrizeKind; n: number };

  /* ---- ui / teaching ---- */
  'phase:changed':   { phase: Phase };
  'flash':           { text: string };
  'flash:hide':      Record<string, never>;
  'tip:shown':       { key: string; text: string };
}

export type BallChangeReason = 'drop' | 'clear-bonus' | 'ad' | 'spin' | 'grant' | 'load' | 'buy';
export type CoinChangeReason = 'clear' | 'spin' | 'grant' | 'load' | 'buy';
export type RampChangeReason = 'spin' | 'grant' | 'load' | 'buy' | 'use';

/** What a wheel wedge pays. Coins buy the other two - see RewardManager. */
export type PrizeKind = 'coins' | 'balls' | 'ramps';

/** 'plan' -> 'drop' -> ('capture' -> 'over') | back to 'plan' on a miss. */
export type Phase = 'plan' | 'drop' | 'capture' | 'over';

/** The one bus the whole game shares. */
export type GameBus = EventBus<GameEvents>;
export const createGameBus = (): GameBus => new EventBus<GameEvents>();
