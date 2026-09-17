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
import type { Level, Segment } from '../levels/types';
import { LEVELS, countryOf, cityOf } from '../levels';
import type { Country } from '../levels/types';
import { EntityFactory, Entity } from '../entities/EntityFactory';
import { Ramp } from '../entities/Ramp';
import { clamp, falses, distToSeg } from '../physics/math';
import { MIN_RAMP, RAMP_HT, H, BOARD } from '../physics/constants';
import { RAMP_LEN } from '../items/items';

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

export class LevelManager {
  private index = 0;
  private ramps: Segment[] = [];

  /** Breakables survive re-drops inside ONE level entry and reset when the
      level is entered again. That keeps the point of the mechanic - learn the
      board, then solve it - which per-drop resetting would destroy. */
  sessionBroken: boolean[] = [];

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
  get count(): number { return LEVELS.length; }
  get isLast(): boolean { return this.index >= LEVELS.length - 1; }

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
    this.extraBudget = 0;
    this.sessionBroken = falses(this.level.breakables.length);
    this.cachedEntities = EntityFactory.createFromLevel(this.level);
  }

  /* ---------------- ramp editing ---------------- */

  /** Put a new ramp on the board from the inventory, and return its index
      (or -1 if the budget is spent).

      It lands in the middle of the board, a little tilted so it reads as a
      ramp rather than a shelf. If a ramp already sits there it steps down
      and then up the board until it has room, so a second ramp never lands
      exactly on top of the first and hides it. */
  placeRamp(): number {
    if (!this.canPlaceRamp) return -1;
    const cx = (BOARD.x0 + BOARD.x1) / 2, a = 20 * Math.PI / 180;
    const hx = Math.cos(a) * RAMP_LEN / 2, hy = Math.sin(a) * RAMP_LEN / 2;
    const ys = [360, 450, 270, 540, 180, 630];
    const free = (y: number) => this.ramps.every(r =>
      Math.hypot((r.x1 + r.x2) / 2 - cx, (r.y1 + r.y2) / 2 - y) > 70);
    const y = ys.find(free) ?? ys[this.ramps.length % ys.length];
    /* Listed right-to-left, which puts its × ABOVE it (deleteButtonAt takes
       the normal on the left of x1->x2). The space below the ramp is then
       free for the walkthrough's bubble, clear of the ball's drop line. */
    this.ramps.push({ x1: cx + hx, y1: y + hy, x2: cx - hx, y2: y - hy });
    return this.ramps.length - 1;
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

  /* Turn a ramp by one of its ends. The ramp pivots on its own middle and
     keeps its length: an item is a fixed size, so dragging an end points it
     rather than stretching it. A finger right on the pivot has no direction,
     so it leaves the ramp alone. Then the whole thing is nudged back inside
     the board, in case the turn swung an end over the edge. */
  rotateRamp(i: number, which: 1 | 2, p: { x: number; y: number }): void {
    const s = this.ramps[i];
    if (!s) return;
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    const dx = p.x - mx, dy = p.y - my;
    if (Math.hypot(dx, dy) < MIN_RAMP / 2) return;
    const half = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2;
    const a = Math.atan2(dy, dx) + (which === 1 ? Math.PI : 0);
    const ux = Math.cos(a) * half, uy = Math.sin(a) * half;
    s.x1 = mx - ux; s.y1 = my - uy; s.x2 = mx + ux; s.y2 = my + uy;
    this.moveRampBy(i, 0, 0);
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
