import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { Segment } from '../levels/types';
import { RAMP_HT, MIN_RAMP } from '../physics/constants';
import { drawSeg } from '../render/primitives';
import { RAMP } from '../render/palette';

/** How every placed ramp is painted - shared with the renderer's own loop. */
export const RAMP_STYLE = { fill: RAMP.base, shine: 'rgba(255,255,255,.75)',
                            outline: 2.5, shadow: true } as const;

/* The one entity the PLAYER creates. Physically identical to a wall - same
   segmentBounce, only a different half-thickness - but drawn as a glossy
   candy-blue bar so the thing you placed never reads as level furniture. */
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
    drawSeg(ctx, this.def, RAMP_HT, RAMP_STYLE);
  }

}
