import type { Vec, Segment } from '../levels/types';

/** mulberry32 - the seeded PRNG the whole game is deterministic on. A drop
    replayed with the same seed produces a byte-identical trajectory, which
    is what the solver sweep relies on to prove a level winnable. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function closestOnSeg(px: number, py: number,
                             x1: number, y1: number,
                             x2: number, y2: number): Vec {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: x1 + t * dx, y: y1 + t * dy };
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function distToSeg(x: number, y: number, s: Segment): number {
  const c = closestOnSeg(x, y, s.x1, s.y1, s.x2, s.y2);
  return Math.hypot(x - c.x, y - c.y);
}

export const falses = (n: number): boolean[] => new Array<boolean>(n).fill(false);
