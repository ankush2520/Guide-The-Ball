/* ============================================================
   LEVEL MANAGER

   Owns which level is in play and everything derived from it:
   the normalised level, its entities (built by the factory),
   the player's ramps, and the session state that must survive a
   re-drop but not a re-entry.

   It announces changes on the bus and never touches the DOM, so
   React, the renderer and the audio layer can all follow it
   without any of them knowing about each other.
   ============================================================ */
import type { GameBus } from '../core/events';
import type { BoosterDef, Level, Segment, Vec } from '../levels/types';
import { LEVELS, countryOf, cityOf } from '../levels';
import type { Country } from '../levels/types';
import { EntityFactory, Entity } from '../entities/EntityFactory';
import { Ramp } from '../entities/Ramp';
import { clamp, falses, distToSeg } from '../physics/math';
import { MIN_RAMP, MAX_RAMP, RAMP_HT, H, BOARD } from '../physics/constants';
import { BOOSTER_R, BOOSTER_SPEED, BOOSTER_ANGLE } from '../items/items';

/** How close a finger has to be to grab a ramp or one of its controls.
    Board coordinates throughout, so a grab radius means the same thing
    whatever size the canvas is being displayed at. The board is 480 wide and
    shows at roughly 265 CSS px on a phone, so these are about half their
    value under a fingertip. */
export const HANDLE_R = 10;
export const GRAB_R   = 20;
export const PICK_PAD = 12;
/* The × is the ONLY way to remove a ramp now that the Undo and Clear buttons
   are gone, so it is drawn at 2.5x the size it used to be: DEL_R 12 -> 30,
   which is ~17-23 CSS px of radius depending on the phone, i.e. a 34-46px
   target rather than the old 14-18px one.

   DEL_OFF moves with it. The button sits DEL_OFF from the ramp's centre line
   along the normal, so at the old offset a 30-radius circle would have sat ON
   the ramp: 50 - 30 leaves the same 20-unit gap the old 32 - 12 did.

   DEL_GRAB is deliberately NOT 2.5x. Scaling it with the rest would put a
   100-unit-wide invisible target on a 480-wide board, and since the × is
   tested before the ramp's own grips, it would swallow the drags that reshape
   and move the selected ramp. 36 keeps a small margin around the visible
   circle and nothing more. */
export const DEL_OFF  = 50;
export const DEL_R    = 30;
export const DEL_GRAB = 36;

/* The booster's aim knob sits this far outside its rim, on the nose. Far
   enough out that the finger holding it is not covering the disc whose
   direction it is setting - which is the whole reason it is a knob on a stalk
   and not a drag anywhere on the body. */
export const AIM_OFF  = 26;
export const AIM_R    = 11;
export const AIM_GRAB = 24;

export class LevelManager {
  private index = 0;
  private ramps: Segment[] = [];
  /* The player's own boosters. Kept apart from the level's own the same way
     ramps are kept apart from walls: identical physics, different owner. */
  private boosters: BoosterDef[] = [];
  /** Which of those have been PAID for out of the bag, by index. A booster is
      only charged for by a win that actually went through it (see
      GameController), so a placed one is on loan until then - and per-index
      rather than a count because a board can carry one that fired beside one
      that did not. */
  boosterPaid: boolean[] = [];
  /* The level with the player's boosters merged in, rebuilt only when one is
     added or removed. Moving or aiming one mutates the def IN PLACE, and this
     array holds the same objects by reference, so a drag needs no rebuild -
     the same contract the entities have with the level (see Entity). */
  private composed: Level | null = null;

  /** Breakables survive re-drops inside ONE level entry and reset when the
      level is entered again. That keeps the point of the mechanic - learn the
      board, then solve it - which per-drop resetting would destroy. */
  sessionBroken: boolean[] = [];
  /** Which mystery boxes are already open, for the same reason and with one
      difference: a box that was opened on a PREVIOUS visit starts open too,
      because it was claimed for good - see setBoxesClaimed. */
  sessionBoxes: boolean[] = [];

  /** Rebuilt only when the level changes, never per frame. */
  private cachedEntities: Entity[] = [];

  constructor(private bus: GameBus) {
    this.rebuild();
  }

  /* ---------------- reading ---------------- */

  get levelIndex(): number { return this.index; }
  get level(): Level { return LEVELS[this.index]; }
  get country(): Country { return countryOf(this.level.id); }
  /** What the player sees this level called - see cityOf(). */
  get cityName(): string { return cityOf(this.level); }
  get entities(): readonly Entity[] { return this.cachedEntities; }
  /* WHAT THE BALL PLAYS AGAINST, which is not always what was authored: a
     booster the player put down is part of the board for this drop. Every
     caller in the drop path uses this; the renderer and the level picker use
     `level`, because what a board IS does not change when you furnish it. */
  get playLevel(): Level { return this.composed ?? this.level; }
  get count(): number { return LEVELS.length; }
  get isLast(): boolean { return this.index >= LEVELS.length - 1; }

  /** The player's boosters, as the physics wants them: plain defs. */
  get placedBoosters(): readonly BoosterDef[] { return this.boosters; }
  get boostersUsed(): number { return this.boosters.length; }
  /** Placed but not yet paid for - held out of the bag while they sit on the
      board, so the count in the inventory is what is still available. */
  get boostersReserved(): number {
    return this.boosters.reduce((n, _b, i) => n + (this.boosterPaid[i] ? 0 : 1), 0);
  }
  /** How many of this board's boosters have actually been charged for. */
  get boostersPaid(): number {
    return this.boosterPaid.reduce((n, p) => n + (p ? 1 : 0), 0);
  }

  /** The player's ramps, as the physics wants them: plain segments. */
  get rampSegments(): readonly Segment[] { return this.ramps; }
  get rampEntities(): Ramp[] { return this.ramps.map((s, i) => EntityFactory.createRamp(s, i)); }
  /* Spare ramps the player has spent ON THIS LEVEL, on top of what the level
     hands them. Reset by setLevel: a spare is bought into a board, not into
     the save, so navigating away does not carry it along.

     Kept separate from maxBlocks rather than added to it, because the star
     rating is judged against the level's DESIGNED budget - see starsFor. If
     spares inflated that number, fifteen coins would buy a third star. */
  extraBudget = 0;

  get rampsUsed(): number { return this.ramps.length; }
  /** The level's own budget. What the stars are measured against. */
  get levelBudget(): number { return this.level.maxBlocks; }
  /** The budget actually in force, spares included. */
  get budget(): number { return this.level.maxBlocks + this.extraBudget; }
  get rampsLeft(): number { return this.budget - this.ramps.length; }
  get canPlaceRamp(): boolean { return this.ramps.length < this.budget; }

  /* ---------------- level changes ---------------- */

  setLevel(i: number): void {
    this.index = clamp(i, 0, LEVELS.length - 1);
    this.rebuild();
    this.bus.emit('level:changed', { level: this.level, index: this.index });
  }

  next(): void { if (!this.isLast) this.setLevel(this.index + 1); }

  private rebuild(): void {
    this.ramps = [];
    this.boosters = [];
    this.boosterPaid = [];
    this.composed = null;
    this.extraBudget = 0;
    this.sessionBroken = falses(this.level.breakables.length);
    this.sessionBoxes = falses(this.level.boxes.length);
    this.rebuildEntities();
  }

  /* The entity list is the level's own furniture plus whatever the player has
     put down. Rebuilt when that CHANGES, never per frame. */
  private rebuildEntities(): void {
    const out = EntityFactory.createFromLevel(this.level);
    for (let i = 0; i < this.boosters.length; i++)
      out.push(EntityFactory.createPlacedBooster(this.boosters[i], i));
    this.cachedEntities = out.sort((a, b) => a.layer - b.layer);
  }

  /** Show this level's boxes as already opened. Called by the controller on
      every level entry, because whether a box has been claimed is the reward
      ledger's business and this manager has no view of it. */
  setBoxesClaimed(claimed: boolean): void {
    if (claimed) this.sessionBoxes = this.level.boxes.map(() => true);
  }

  /* ---------------- the player's boosters ---------------- */

  /** Put one on the board and return its index. It lands in the middle,
      pointing straight down - unaimed on purpose, so the first thing the
      player does with it is the thing that makes it theirs. */
  placeBooster(): number {
    const cx = (BOARD.x0 + BOARD.x1) / 2;
    const ys = [400, 300, 500, 220, 580];
    const free = (y: number) =>
      this.boosters.every(b => Math.hypot(b.x - cx, b.y - y) > BOOSTER_R * 2.4);
    const y = ys.find(free) ?? ys[this.boosters.length % ys.length];
    this.boosters.push({ x: cx, y, r: BOOSTER_R,
                         angle: BOOSTER_ANGLE, speed: BOOSTER_SPEED });
    this.boosterPaid.push(false);
    this.composeLevel();
    this.rebuildEntities();
    return this.boosters.length - 1;
  }

  boosterAt(i: number): BoosterDef | undefined { return this.boosters[i]; }

  removeBooster(i: number): void {
    if (i < 0 || i >= this.boosters.length) return;
    /* The paid flag goes with it. A paid-for booster is not refunded by
       picking it back up - the win it bought already happened - which is why
       the two arrays are spliced together and never re-indexed apart. */
    this.boosters.splice(i, 1);
    this.boosterPaid.splice(i, 1);
    this.composeLevel();
    this.rebuildEntities();
  }

  /** The nearest placed booster to a tap, or -1. */
  pickBooster(x: number, y: number): number {
    let pick = -1, bestD = Infinity;
    for (let i = 0; i < this.boosters.length; i++) {
      const b = this.boosters[i];
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + PICK_PAD && d < bestD) { bestD = d; pick = i; }
    }
    return pick;
  }

  /** Slide one, clamped so the whole disc stays on the board. */
  moveBoosterBy(i: number, dx: number, dy: number): void {
    const b = this.boosters[i];
    if (!b) return;
    b.x = clamp(b.x + dx, BOARD.x0 + b.r, BOARD.x1 - b.r);
    b.y = clamp(b.y + dy, b.r, H - b.r);
  }

  /** Point one at `p`. The disc never moves - only the heading changes - so
      aiming is as reversible as turning a ramp by its end. */
  aimBoosterTo(i: number, p: Vec): void {
    const b = this.boosters[i];
    if (!b) return;
    const dx = p.x - b.x, dy = p.y - b.y;
    if (Math.hypot(dx, dy) < 6) return;            // no direction in a pivot
    b.angle = Math.atan2(dy, dx) * 180 / Math.PI;
  }

  /** Where the aim knob sits: on the nose, just outside the rim. */
  boosterHandleAt(b: BoosterDef): Vec {
    const a = b.angle * Math.PI / 180;
    return { x: b.x + Math.cos(a) * (b.r + AIM_OFF),
             y: b.y + Math.sin(a) * (b.r + AIM_OFF) };
  }

  /** Where its × sits: opposite the nose, flipped to whichever side keeps it
      on the board - the same rule the ramp's delete button follows.

      Pushed out further than the ramp's, and it has to be: the ramp's offset
      is measured from a 9-unit-thick bar, this one from a 60-unit disc, so at
      the ramp's distance the × would sit ON the booster it removes. */
  boosterDeleteAt(b: BoosterDef): Vec {
    const a = b.angle * Math.PI / 180;
    const off = b.r + DEL_R + 14;
    let bx = b.x - Math.cos(a) * off, by = b.y - Math.sin(a) * off;
    if (bx < BOARD.x0 + DEL_R || bx > BOARD.x1 - DEL_R || by < DEL_R || by > H - DEL_R) {
      bx = b.x + Math.cos(a + Math.PI / 2) * off;
      by = b.y + Math.sin(a + Math.PI / 2) * off;
    }
    return { x: clamp(bx, BOARD.x0 + DEL_R, BOARD.x1 - DEL_R),
             y: clamp(by, DEL_R, H - DEL_R) };
  }

  /* One object, rebuilt only when the LIST changes. Null when the player has
     placed nothing, so an untouched board hands the physics the level itself
     and not a copy of it. */
  private composeLevel(): void {
    this.composed = this.boosters.length === 0 ? null
      : { ...this.level, boosters: [...this.level.boosters, ...this.boosters] };
  }

  /* ---------------- ramp editing ---------------- */

  /* ============================================================
     A RAMP IS DRAWN, NOT SPAWNED

     One drag sets where it is, how long it is and which way it
     points, all at once - which is the whole reason the ramp is
     the player's expressive tool and the booster is not. There
     is no default length to place and then correct.

     Everything below is the vocabulary that drag needs: the
     length limits it is held to (MIN_RAMP so a stray tap is not
     a ramp, MAX_RAMP so one is not a wall), and an editing rule
     that keeps an edited ramp inside them - an edited ramp must
     stay a ramp you could have drawn by hand.
     ============================================================ */

  /** Clamp `q` so the segment from `p` is never longer than MAX_RAMP. */
  truncate(p: Vec, q: Vec): Vec {
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len <= MAX_RAMP) return q;
    return { x: p.x + dx / len * MAX_RAMP, y: p.y + dy / len * MAX_RAMP };
  }

  addRamp(seg: Segment): boolean {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < MIN_RAMP || !this.canPlaceRamp) return false;
    this.ramps.push(seg);
    return true;
  }

  removeRamp(i: number): void { if (i >= 0 && i < this.ramps.length) this.ramps.splice(i, 1); }
  clearRamps(): void { this.ramps = []; }

  /** The nearest ramp to a tap, or -1. */
  pickRamp(x: number, y: number): number {
    let pick = -1, bestD = Infinity;
    for (let i = 0; i < this.ramps.length; i++) {
      const d = distToSeg(x, y, this.ramps[i]);
      if (d <= RAMP_HT + PICK_PAD && d < bestD) { bestD = d; pick = i; }
    }
    return pick;
  }

  rampAt(i: number): Segment | undefined { return this.ramps[i]; }

  /* Move ONE END of a ramp, the other staying where it is - so a drag on an
     end changes the length and the angle together, exactly as the drag that
     drew it did. The end is held inside the same limits the drawing tool
     enforces: never past MAX_RAMP from its anchor, and pushed back out along
     its own heading if the finger comes closer than MIN_RAMP. */
  moveRampEnd(i: number, which: 1 | 2, p: Vec): void {
    const s = this.ramps[i];
    if (!s) return;
    const ax = which === 1 ? s.x2 : s.x1, ay = which === 1 ? s.y2 : s.y1;
    let q = this.truncate({ x: ax, y: ay }, p);
    const dx = q.x - ax, dy = q.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < MIN_RAMP) {
      const a = len > 1e-6 ? Math.atan2(dy, dx) : -Math.PI / 2;
      q = { x: ax + Math.cos(a) * MIN_RAMP, y: ay + Math.sin(a) * MIN_RAMP };
    }
    q = { x: clamp(q.x, BOARD.x0, BOARD.x1), y: clamp(q.y, 0, H) };
    if (which === 1) { s.x1 = q.x; s.y1 = q.y; } else { s.x2 = q.x; s.y2 = q.y; }
  }

  /** Slide a whole ramp, clamped so neither end can leave the board. */
  moveRampBy(i: number, dx: number, dy: number): void {
    const s = this.ramps[i];
    if (!s) return;
    const loX = Math.min(s.x1, s.x2), hiX = Math.max(s.x1, s.x2);
    const loY = Math.min(s.y1, s.y2), hiY = Math.max(s.y1, s.y2);
    dx = clamp(dx, BOARD.x0 - loX, BOARD.x1 - hiX);
    dy = clamp(dy, -loY, H - hiY);
    s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy;
  }

  /* The board can narrow under the player - a desktop window dragged in past
     the tablet threshold - and a ramp drawn out in the old margins would be
     left hanging off the edge. Pulling it in is a translation, so its length
     and angle survive: the player's work is moved, not discarded. */
  reclampRamps(): void {
    for (let i = 0; i < this.ramps.length; i++) this.moveRampBy(i, 0, 0);
    for (let i = 0; i < this.boosters.length; i++) this.moveBoosterBy(i, 0, 0);
  }

  /** Where the × sits: off the ramp's midpoint, along its normal, flipped to
      whichever side keeps it on the board. */
  deleteButtonAt(s: Segment): { x: number; y: number } {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m, ny = dx / m;
    let bx = mx + nx * DEL_OFF, by = my + ny * DEL_OFF;
    if (bx < BOARD.x0 + DEL_R || bx > BOARD.x1 - DEL_R ||
        by < DEL_R || by > H - DEL_R) {
      bx = mx - nx * DEL_OFF; by = my - ny * DEL_OFF;
    }
    return { x: clamp(bx, BOARD.x0 + DEL_R, BOARD.x1 - DEL_R),
             y: clamp(by, DEL_R, H - DEL_R) };
  }

  /* Short ramps cannot afford a full-size grab circle at each end or the two
     would swallow the middle, leaving no way to translate one. */
  grabRadius(s: Segment): number {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return Math.min(GRAB_R, len * 0.38);
  }
}
