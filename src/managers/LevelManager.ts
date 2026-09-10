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
import { LEVELS, worldOf } from '../levels';
import type { World } from '../levels/types';
import { EntityFactory, Entity } from '../entities/EntityFactory';
import { Ramp } from '../entities/Ramp';
import { clamp, falses, distToSeg } from '../physics/math';
import { MIN_RAMP, MAX_RAMP, RAMP_HT, W, H } from '../physics/constants';

/** How close a finger has to be to grab a ramp or one of its controls.
    Board coordinates throughout, so a grab radius means the same thing
    whatever size the canvas is being displayed at. The board is 480 wide and
    shows at roughly 265 CSS px on a phone, so these are about half their
    value under a fingertip. */
export const HANDLE_R = 7;
export const GRAB_R   = 20;
export const PICK_PAD = 12;
export const DEL_OFF  = 32;
export const DEL_R    = 12;
export const DEL_GRAB = 20;

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
  get world(): World { return worldOf(this.level.id); }
  get entities(): readonly Entity[] { return this.cachedEntities; }
  get count(): number { return LEVELS.length; }
  get isLast(): boolean { return this.index >= LEVELS.length - 1; }

  /** The player's ramps, as the physics wants them: plain segments. */
  get rampSegments(): readonly Segment[] { return this.ramps; }
  get rampEntities(): Ramp[] { return this.ramps.map((s, i) => EntityFactory.createRamp(s, i)); }
  get rampsUsed(): number { return this.ramps.length; }
  get rampsLeft(): number { return this.level.maxBlocks - this.ramps.length; }
  get canPlaceRamp(): boolean { return this.ramps.length < this.level.maxBlocks; }

  /* ---------------- level changes ---------------- */

  setLevel(i: number): void {
    this.index = clamp(i, 0, LEVELS.length - 1);
    this.rebuild();
    this.bus.emit('level:changed', { level: this.level, index: this.index });
  }

  next(): void { if (!this.isLast) this.setLevel(this.index + 1); }

  private rebuild(): void {
    this.ramps = [];
    this.sessionBroken = falses(this.level.breakables.length);
    this.cachedEntities = EntityFactory.createFromLevel(this.level);
  }

  /* ---------------- ramp editing ---------------- */

  /** Keep a new ramp inside MAX_RAMP by shortening it, never by refusing the
      drag - a gesture that silently does nothing reads as a broken control. */
  truncate(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len <= MAX_RAMP) return to;
    return { x: from.x + dx / len * MAX_RAMP, y: from.y + dy / len * MAX_RAMP };
  }

  addRamp(seg: Segment): boolean {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < MIN_RAMP || !this.canPlaceRamp) return false;
    this.ramps.push(seg);
    return true;
  }

  removeRamp(i: number): void { if (i >= 0 && i < this.ramps.length) this.ramps.splice(i, 1); }
  undoRamp(): void { this.ramps.pop(); }
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

  /* Move one end of a ramp, keeping the segment inside the length limits the
     drawing tool enforces - an edited ramp must stay a ramp you could have
     drawn by hand. */
  moveRampEnd(i: number, which: 1 | 2, p: { x: number; y: number }): void {
    const s = this.ramps[i];
    if (!s) return;
    const ax = which === 1 ? s.x2 : s.x1, ay = which === 1 ? s.y2 : s.y1;
    let q = this.truncate({ x: ax, y: ay }, p);
    const dx = q.x - ax, dy = q.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < MIN_RAMP) {
      // too close to the anchor: push it back out along the same heading
      const a = len > 1e-6 ? Math.atan2(dy, dx) : -Math.PI / 2;
      q = { x: clamp(ax + Math.cos(a) * MIN_RAMP, 0, W),
            y: clamp(ay + Math.sin(a) * MIN_RAMP, 0, H) };
    }
    if (which === 1) { s.x1 = q.x; s.y1 = q.y; } else { s.x2 = q.x; s.y2 = q.y; }
  }

  /** Slide a whole ramp, clamped so neither end can leave the board. */
  moveRampBy(i: number, dx: number, dy: number): void {
    const s = this.ramps[i];
    if (!s) return;
    const loX = Math.min(s.x1, s.x2), hiX = Math.max(s.x1, s.x2);
    const loY = Math.min(s.y1, s.y2), hiY = Math.max(s.y1, s.y2);
    dx = clamp(dx, -loX, W - hiX);
    dy = clamp(dy, -loY, H - hiY);
    s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy;
  }

  /** Where the × sits: off the ramp's midpoint, along its normal, flipped to
      whichever side keeps it on the board. */
  deleteButtonAt(s: Segment): { x: number; y: number } {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m, ny = dx / m;
    let bx = mx + nx * DEL_OFF, by = my + ny * DEL_OFF;
    if (bx < DEL_R || bx > W - DEL_R || by < DEL_R || by > H - DEL_R) {
      bx = mx - nx * DEL_OFF; by = my - ny * DEL_OFF;
    }
    return { x: clamp(bx, DEL_R, W - DEL_R), y: clamp(by, DEL_R, H - DEL_R) };
  }

  /* Short ramps cannot afford a full-size grab circle at each end or the two
     would swallow the middle, leaving no way to translate one. */
  grabRadius(s: Segment): number {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return Math.min(GRAB_R, len * 0.38);
  }
}
