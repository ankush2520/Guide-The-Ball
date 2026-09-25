/* A big solid OVAL, built for the physics as a closed polygon of wall
   segments. Walls are already real collidable geometry with honest normals,
   so an oval needs nothing new from the engine: it is just a lot of short
   walls. The segments are remembered in OVAL_SEGS so the wall renderer can
   skip them - the Oval entity paints the whole shape instead. */
import type { OvalDef, Segment } from './types';

export const OVAL_SEGS = new WeakSet<Segment>();

/** A point on the oval's rim at parameter t (radians). */
export function ovalPoint(o: OvalDef, t: number): { x: number; y: number } {
  const a = (o.angle ?? 0) * Math.PI / 180;
  const ex = o.rx * Math.cos(t), ey = o.ry * Math.sin(t);
  return { x: o.x + ex * Math.cos(a) - ey * Math.sin(a), y: o.y + ex * Math.sin(a) + ey * Math.cos(a) };
}

/** The rim as `n` wall segments, closed. */
export function ovalSegments(o: OvalDef, n = 64): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const p = ovalPoint(o, (i / n) * Math.PI * 2), q = ovalPoint(o, ((i + 1) / n) * Math.PI * 2);
    const s = { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
    OVAL_SEGS.add(s);
    out.push(s);
  }
  return out;
}
