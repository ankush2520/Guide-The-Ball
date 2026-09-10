/* Build the static wall segments around a CIRCULAR target.
     OPEN        - nothing.
     SIDE_WALL   - one tall bar guarding a side; entry must come from elsewhere.
     POCKET      - an L (one side + a lid), so entry must be from the open side.
     NARROW_GAP  - bars on both sides plus a lid with a single small opening.
     ENCLOSED    - both sides + a floor, open only at the top: a cup.
   Walls are rebuilt from the target's centre, which is fixed: every target in
   the game is stationary. These are REAL collidable geometry, not decoration. */
import type { RawLevel, Circle, Segment } from './types';
import { WALL_HT, BALL_R } from '../physics/constants';

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 });

export function buildWalls(lv: RawLevel, target?: Circle): Segment[] {
  const c = target || lv.target;
  const d = c.r + 16;                    // standoff from the outer ring
  const up = lv.wallH || 112;            // how far side bars rise
  const side = lv.wallSide || 'left';
  switch (lv.targetType) {
    case 'SIDE_WALL':
      return side === 'left' ? [seg(c.x - d, c.y + d, c.x - d, c.y - up)]
                             : [seg(c.x + d, c.y + d, c.x + d, c.y - up)];
    case 'POCKET':
      return side === 'left'
        ? [seg(c.x - d, c.y + d, c.x - d, c.y - d), seg(c.x - d, c.y - d, c.x + d, c.y - d)]
        : [seg(c.x + d, c.y + d, c.x + d, c.y - d), seg(c.x - d, c.y - d, c.x + d, c.y - d)];
    case 'NARROW_GAP': {
      /* gapW is the CLEAR window the ball centre can pass through, not the raw
         span between bars - the bar ends are pushed out by the ball radius and
         the wall thickness so the number means what it says when tuning. */
      const gx = c.x + (lv.gapX || 0);
      const half = (lv.gapW || 46) / 2 + WALL_HT + BALL_R;
      return [seg(c.x - d, c.y + d, c.x - d, c.y - up), seg(c.x + d, c.y + d, c.x + d, c.y - up),
              seg(c.x - d, c.y - d, gx - half, c.y - d), seg(gx + half, c.y - d, c.x + d, c.y - d)];
    }
    case 'ENCLOSED':
      return [seg(c.x - d, c.y + d, c.x - d, c.y - up), seg(c.x + d, c.y + d, c.x + d, c.y - up),
              seg(c.x - d, c.y + d, c.x + d, c.y + d)];
    default:
      return [];
  }
}
