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
import type { Level, Segment, Vec } from '../levels/types';
import { LEVELS, countryOf, cityOf, rampAllowed } from '../levels';
import type { Country } from '../levels/types';
import { EntityFactory, Entity } from '../entities/EntityFactory';
import { Ramp } from '../entities/Ramp';
import { clamp, falses, distToSeg } from '../physics/math';
import { MIN_RAMP, MAX_RAMP, RAMP_HT, PLAY } from '../physics/constants';

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
  /* WHAT THE BALL PLAYS AGAINST. The same board that was authored: the
     player's own contributions - the ramps, and the springs on them - reach
     the engine as ramps, never as level furniture. */
  get playLevel(): Level { return this.level; }
  get count(): number { return LEVELS.length; }
  get isLast(): boolean { return this.index >= LEVELS.length - 1; }

  /* ---------------- the player's springs ----------------

     A spring is not a thing on the board, it is a PROPERTY OF A RAMP, so
     there is no list of them: the ramps are the list, and these read it. */

  /** Ramps currently carrying a spring. */
  get springsUsed(): number { return this.ramps.filter(r => r.spring).length; }
  /** Fitted but not yet paid for - held out of the bag while they sit on the
      board, so the count in the inventory is what is still available. */
  get springsReserved(): number {
    return this.ramps.filter(r => r.spring && !r.springPaid).length;
  }
  /** How many of this board's springs have actually been charged for. */
  get springsPaid(): number {
    return this.ramps.filter(r => r.spring && r.springPaid).length;
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
  /** The ramps themselves, read-only - what the engine plays against and what
      the renderer draws, springs and all. */
  get rampList(): readonly Segment[] { return this.ramps; }
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
    this.sessionBoxes = falses(this.level.boxes.length);
    this.rebuildEntities();
  }

  /* The level's own furniture, and only that: the player's ramps are drawn
     from the ramp list and a spring is a property of one of them, so neither
     is ever an entity. Rebuilt when the level CHANGES, never per frame. */
  private rebuildEntities(): void {
    this.cachedEntities = EntityFactory.createFromLevel(this.level)
      .sort((a, b) => a.layer - b.layer);
  }

  /** Show this level's boxes as already opened. Called by the controller on
      every level entry, because whether a box has been claimed is the reward
      ledger's business and this manager has no view of it. */
  setBoxesClaimed(claimed: boolean): void {
    if (claimed) this.sessionBoxes = this.level.boxes.map(() => true);
  }

  /* ---------------- the player's springs ----------------

     THE ITEM GOES ON A RAMP THE PLAYER DREW. There is no placing, no moving
     and no aiming here, because all three already happened when they drew the
     line: fitting a spring is one tap on one ramp, and everything that made
     the old bar an object of its own - a spawn position, a default angle, a
     grab radius, an aim knob, a delete button, a merged copy of the level -
     is gone with it.

     Which ramp a spring is on is stored ON THE RAMP (see Segment), so moving,
     reshaping or deleting that ramp carries the spring with it and no index
     can drift. */

  /** Fit a spring to ramp `i`. False if there is no such ramp or it already
      has one - the caller reads that as "nothing was spent". */
  springRamp(i: number): boolean {
    const s = this.ramps[i];
    if (!s || s.spring) return false;
    s.spring = true;
    s.springPaid = false;
    return true;
  }

  /** Take one back off. Returns true if the removed spring was still ON LOAN,
      which is the caller's cue to put it back in the bag; a paid-for one is
      not refunded, exactly as the bar it replaces was not. */
  unspringRamp(i: number): boolean {
    const s = this.ramps[i];
    if (!s || !s.spring) return false;
    const owed = !s.springPaid;
    s.spring = false;
    s.springPaid = false;
    return owed;
  }

  /** Whether ramp `i` is sprung - what the renderer and the tray ask. */
  isSprung(i: number): boolean { return !!this.ramps[i]?.spring; }


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

  /* ============================================================
     THE RAMP-PLACEMENT REGION

     The play area, minus the lane of any patrolling target (see
     levels/patrol.ts). Every door a ramp comes through - drawn,
     end-dragged, slid - checks it, so a ramp can never sit where
     the target is about to slide through it. An edit that would
     carry a ramp into the lane is refused outright rather than
     clamped: the ramp stays where it was, which the player can
     see, instead of being bent into a shape they did not draw.
     ============================================================ */
  rampAllowed(seg: Segment): boolean { return rampAllowed(this.level, seg); }

  addRamp(seg: Segment): boolean {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < MIN_RAMP || !this.canPlaceRamp || !this.rampAllowed(seg)) return false;
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
    q = { x: clamp(q.x, PLAY.x0, PLAY.x1), y: clamp(q.y, PLAY.y0, PLAY.y1) };
    const next = which === 1 ? { ...s, x1: q.x, y1: q.y } : { ...s, x2: q.x, y2: q.y };
    if (!this.rampAllowed(next)) return;
    if (which === 1) { s.x1 = q.x; s.y1 = q.y; } else { s.x2 = q.x; s.y2 = q.y; }
  }

  /** Slide a whole ramp, clamped so neither end can leave the board. */
  moveRampBy(i: number, dx: number, dy: number): void {
    const s = this.ramps[i];
    if (!s) return;
    const loX = Math.min(s.x1, s.x2), hiX = Math.max(s.x1, s.x2);
    const loY = Math.min(s.y1, s.y2), hiY = Math.max(s.y1, s.y2);
    dx = clamp(dx, PLAY.x0 - loX, PLAY.x1 - hiX);
    dy = clamp(dy, PLAY.y0 - loY, PLAY.y1 - hiY);
    if (!this.rampAllowed({ ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) return;
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
    if (bx < PLAY.x0 + DEL_R || bx > PLAY.x1 - DEL_R ||
        by < PLAY.y0 + DEL_R || by > PLAY.y1 - DEL_R) {
      bx = mx - nx * DEL_OFF; by = my - ny * DEL_OFF;
    }
    return { x: clamp(bx, PLAY.x0 + DEL_R, PLAY.x1 - DEL_R),
             y: clamp(by, PLAY.y0 + DEL_R, PLAY.y1 - DEL_R) };
  }

  /* Short ramps cannot afford a full-size grab circle at each end or the two
     would swallow the middle, leaving no way to translate one. */
  grabRadius(s: Segment): number {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return Math.min(GRAB_R, len * 0.38);
  }
}

/* ---- the bar, as geometry ----

   A boost ramp stores nothing but its two ends, so its middle and its angle
   are read back out of them rather than kept alongside - two copies of the
   same fact are two facts that can disagree, and the physics only ever reads
   the ends. */

