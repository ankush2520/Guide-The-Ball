import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Segment } from '../levels/types';
import { RAMP_HT, MIN_RAMP } from '../physics/constants';
import { drawSeg } from '../render/primitives';

/* The one entity the PLAYER creates. Physically identical to a wall - same
   segmentBounce, only a different half-thickness - but drawn as a live neon
   tube so the thing you placed never reads as level furniture. */
export class Ramp extends Entity<Segment> {
  readonly kind: EntityKind = 'ramp';

  get length(): number {
    const s = this.def;
    return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  }

  /** A draft shorter than MIN_RAMP will not be kept, and says so by going
      translucent while it is still being dragged. */
  get isValid(): boolean { return this.length >= MIN_RAMP; }

  draw({ ctx }: DrawContext): void {
    drawSeg(ctx, this.def, '#3ec8ff', RAMP_HT, 'rgba(62,200,255,.55)');
  }

  /** The in-progress drag: no glow, and dimmed until it is long enough. */
  drawDraft(ctx: CanvasRenderingContext2D): void {
    drawSeg(ctx, this.def, this.isValid ? '#3ec8ff' : 'rgba(62,200,255,.45)', RAMP_HT, null);
  }
}
