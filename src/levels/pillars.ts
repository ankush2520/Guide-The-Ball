/* A PILLAR, built for the physics as wall segments: a wall already collides
   with honest normals, so a column needs nothing new from the engine.

   The segments are inset by the wall half-thickness, because a wall's
   surface is WALL_HT out from its centre line: that way the surface the
   ball meets is exactly the edge the Pillar entity paints.

   It starts far above the board, so nothing - however hard a spring throws
   it - can go over the top; the only way past is round its foot. The
   segments are remembered in PILLAR_SEGS so the wall painter skips them. */
import type { PillarDef, Segment } from './types';
import { WALL_HT } from '../physics/constants';

export const PILLAR_SEGS = new WeakSet<Segment>();
/** Where every pillar starts: well above anything a ball can reach. */
export const PILLAR_TOP = -900;

export function pillarSegments(p: PillarDef, n = 14): Segment[] {
  const hw = p.w / 2 - WALL_HT;
  const cy = p.bottom - WALL_HT - hw;          // centre of the rounded foot
  const pts: { x: number; y: number }[] = [{ x: p.x - hw, y: PILLAR_TOP }, { x: p.x - hw, y: cy }];
  for (let i = 1; i < n; i++) {
    const t = Math.PI - (i / n) * Math.PI;      // left, round the bottom, to the right
    pts.push({ x: p.x + Math.cos(t) * hw, y: cy + Math.sin(t) * hw });
  }
  pts.push({ x: p.x + hw, y: cy }, { x: p.x + hw, y: PILLAR_TOP });
  const out: Segment[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const s = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    PILLAR_SEGS.add(s);
    out.push(s);
  }
  return out;
}
