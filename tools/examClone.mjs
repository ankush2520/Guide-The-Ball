/**
 * A world's PILLAR EXAM (positions 17-20) taken from an exam that already
 * ships, rather than generated and proved again.
 *
 * Every earlier world's 17-20 are the same four boards, re-dressed: a pillar
 * between the drop's lane and the target's, the target patrolling up and
 * down under it, the Bouncy Ramp needed. A clone keeps the source's geometry
 * exactly - optionally MIRRORED left-right, which the physics is symmetric
 * under - so a board that was winnable stays winnable. On top it can:
 *   - turn fire into red obstacles of the same size (worlds without fire),
 *   - add gold stars (optional pickups: scenery to the physics).
 * Nothing here runs the solver; hand-test the result.
 */
import { starsFor, rng, MIN_GAP } from './windLevels.mjs';

const W = 480;

export function cloneExam(src, { id, name, mirror = false, noFire = false, stars = 0 }){
  const L = structuredClone(src);
  L.id = id; L.name = name;
  delete L.city;
  if (mirror){
    const m = x => W - x;
    const mc = o => ({ ...o, x: m(o.x) });
    L.spawn = mc(L.spawn);
    for (const k of ['obstacles', 'breakables', 'fires', 'boxes', 'stars'])
      if (L[k]) L[k] = L[k].map(mc);
    if (L.pillars) L.pillars = L.pillars.map(mc);
    L.target = mc(L.target);
    if (L.targetMove) L.targetMove = { ...L.targetMove, x0: m(L.targetMove.x0), x1: m(L.targetMove.x1) };
    if (L.wind) L.wind = L.wind.map(z => ({ ...z, x: W - z.x - z.w, ax: -z.ax }));
    if (L.wallSide) L.wallSide = L.wallSide === 'left' ? 'right' : 'left';
  }
  if (noFire && L.fires){ L.obstacles = [...(L.obstacles || []), ...L.fires]; delete L.fires; }
  if (stars){
    const r = rng(id * 7919);
    const t = L.target, tm = L.targetMove;
    const lane = tm ? [{ x: tm.x0, y: tm.y0, r: t.r }, { x: tm.x1, y: tm.y1 ?? tm.y0, r: t.r }] : [t];
    const blockers = [...(L.obstacles || []), ...(L.breakables || []), ...(L.fires || []).map(f => ({ ...f, r: f.r * 1.6 })),
                      ...(L.boxes || []).map(b => ({ ...b, r: 16 }))];
    /* clear of the pillar's whole column, not just its foot */
    const offPillar = s => (L.pillars || []).every(p => Math.abs(s.x - p.x) >= p.w / 2 + s.r + MIN_GAP || s.y > p.bottom + s.r + MIN_GAP);
    L.stars = starsFor(r, stars, L.spawn, lane, blockers, [], offPillar);
  }
  return L;
}
