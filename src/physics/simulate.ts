/* ============================================================
   SIMULATION - pure, no rendering, no sound, no events.

   Shared by the live game and the headless solver sweep, which
   is exactly why it must stay side-effect free: stepBall only
   RECORDS what it touched (ball.hit, ball.justBroke, the
   counters) and the frame loop reads those records to fire
   juice. Move a single Sound call in here and the solver starts
   making noise.
   ============================================================ */
import type { Level, Segment } from '../levels/types';
import type { SimulationResult } from './types';
import { Ball } from './Ball';
import { inDisc, inZone, inTarget, resolveCollisions } from './collisions';
import {
  GRAVITY, TERMINAL_VY, SUBSTEPS, RESTITUTION, SLIP_REST,
  PORTAL_CD, SPEED_CAP, STAR_R, BALL_R, MIN_BOUNCE,
} from './constants';

/** Advance one 1/60s step. Sets b.result when the run ends.

    The order inside a substep is deliberate and worth keeping:
      gravity -> wind -> move -> portal -> collide -> boost -> stars
    Wind is an acceleration, so it belongs beside gravity. A portal fires on
    where the ball ARRIVED, before anything can bounce it back out. A booster
    fires AFTER collisions so it always wins the substep - a booster that can
    be cancelled by a wall it is pushing you into is unreadable.

    With no zones, no portals, no boosters, no breakables and no stars, every
    added branch is skipped and this reduces to exactly the world 1 loop. */
export function stepBall(b: Ball, lv: Level, ramps: Segment[]): void {
  const c = lv.target, walls = lv.walls;
  for (let i = 0; i < SUBSTEPS; i++) {
    b.vy += GRAVITY / SUBSTEPS;          // gravity touches vy and nothing else
    if (b.vy > TERMINAL_VY) b.vy = TERMINAL_VY;

    // wind: a constant push for exactly as long as the centre is inside
    for (let k = 0; k < lv.wind.length; k++) {
      const z = lv.wind[k];
      if (inZone(b, z)) {
        b.vx += (z.ax || 0) / SUBSTEPS;
        b.vy += (z.ay || 0) / SUBSTEPS;
        b.clampSpeed();
      }
    }

    b.x += b.vx / SUBSTEPS;
    b.y += b.vy / SUBSTEPS;

    /* portals, on arrival. The ball must clear the end it came out of before
       anything may fire again, or the pair simply throws it back and forth. */
    if (b.portalHold) {
      const h = lv.portals[b.portalHold.k][b.portalHold.side];
      if (!inDisc(b, h, h.r)) b.portalHold = null;
    }
    if (b.portalCd > 0) b.portalCd--;
    if (!b.portalHold && b.portalCd === 0) {
      for (let k = 0; k < lv.portals.length; k++) {
        const p = lv.portals[k];
        let exit = null, side: 'a' | 'b' = 'a';
        if (inDisc(b, p.a, p.a.r)) { exit = p.b; side = 'b'; }
        else if (inDisc(b, p.b, p.b.r)) { exit = p.a; side = 'a'; }
        if (!exit) continue;
        b.x = exit.x; b.y = exit.y;
        // direction is preserved unless the exit states a facing of its own
        if (exit.facing !== undefined && exit.facing !== null) {
          const sp = Math.hypot(b.vx, b.vy) || MIN_BOUNCE;
          const a = exit.facing * Math.PI / 180;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        }
        b.portalCd = PORTAL_CD;
        b.portalHold = { k, side };
        b.teleports++;
        b.noteHit(exit.x, exit.y, 0, -1, 'portal');
        break;
      }
    }

    // a slippery floor gives back almost everything the bounce would cost
    let rest = RESTITUTION;
    for (let k = 0; k < lv.slippery.length; k++)
      if (inZone(b, lv.slippery[k])) { rest = SLIP_REST; break; }

    resolveCollisions(b, lv, ramps, walls, rest);

    // boosters: fire once, on entry, and overrule whatever just happened
    for (let k = 0; k < lv.boosters.length; k++) {
      const z = lv.boosters[k];
      const inside = inDisc(b, z, z.r);
      if (inside && !b.boostIn[k]) {
        const a = z.angle * Math.PI / 180;
        const sp = Math.min(z.speed, SPEED_CAP);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
        b.boosts++;
        b.noteHit(z.x, z.y, Math.cos(a), Math.sin(a), 'booster');
      }
      b.boostIn[k] = inside;
    }

    // stars are scenery to the physics - they never touch the trajectory
    for (let k = 0; k < lv.stars.length; k++) {
      if (b.got[k]) continue;
      const st = lv.stars[k];
      if (Math.hypot(b.x - st.x, b.y - st.y) <= STAR_R + BALL_R) {
        b.got[k] = true; b.stars++;
      }
    }

    b.clampSpeed();
    b.noteSpeed();
    if (inTarget(b, c)) { b.result = 'win'; b.hitX = c.x; b.hitY = c.y; return; }
    if (b.isOutOfBounds()) { b.result = 'out'; return; }
  }
  b.tickStallWatch();
}

/** Run a whole drop headlessly and report the outcome. */
export function simulate(lv: Level, ramps: Segment[], seed: number,
                         broken?: boolean[] | null): SimulationResult {
  const b = new Ball(lv, seed >>> 0, broken);
  while (!b.result) stepBall(b, lv, ramps);
  return b.toResult();
}
