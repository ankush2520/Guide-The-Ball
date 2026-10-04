import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { MoverDef } from '../levels/types';
import { moverAt } from '../levels/mover';
import { drawObstacle } from './Obstacle';

/* A MOVING BUMPER: the ordinary red obstacle, carried along its track.
   It only ever bounces the ball - it never ends a drop. Drawn off simT,
   the physics' own step clock, so where it is painted is where it hits. */
export class Mover extends Entity<MoverDef> {
  readonly kind: EntityKind = 'mover';

  draw({ ctx, simT }: DrawContext): void {
    const m = this.def;
    const at = moverAt(m, simT);
    drawObstacle(ctx, { x: at.x, y: at.y, r: m.r });
  }
}
