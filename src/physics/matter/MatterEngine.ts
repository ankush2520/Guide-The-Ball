/* ============================================================
   MATTER.JS ENGINE

   The game's simulator, behind the PhysicsEngine interface.
   Matter owns collision detection, contact resolution,
   restitution and integration; this file's job is to build a
   world from a Level, run it a frame at a time, and layer the
   game's own mechanics (boosters, portals, wind, ice,
   breakables, pickups) on top.

   WHAT IS AND IS NOT MATTER
   -------------------------
   Matter has no terminal velocity, no global speed cap, no
   minimum bounce and no continuous collision detection. Left
   raw, a ball accelerates without limit and, past ~13.5px of
   travel per frame, passes straight THROUGH a 9px ramp without
   ever touching it - there is no contact to resolve.

   So a few guards are configurable, and default ON:

     terminalVy  a downward clamp, so the fall stays readable
     speedCap    the tunnelling guard - the real reason it exists
     minBounce   stops a glancing hit killing the ball on a ramp
     jitter      keeps the seeded obstacle scatter, which is a
                 GAME MECHANIC rather than a physics one

   Set them all to null for unguarded Matter (see MATTER_PURE).
   Expect the ball to tunnel and levels to become unwinnable -
   that is what the raw engine does on this board, not a bug.
   ============================================================ */
import {
  Engine, Bodies, Body, Composite, Events,
  type IEventCollision, type Body as MBody,
} from 'matter-js';
import type { Level, Segment, Circle } from '../../levels/types';
import type { BallState, PhysicsEngine } from '../PhysicsEngine';
import type { DropResult, Hit, HitKind, BounceRecord, SimulationResult } from '../types';
import { mulberry32, falses, closestOnSeg } from '../math';
import {
  BALL_R, RAMP_HT, WALL_HT, TERMINAL_VY, RESTITUTION, SLIP_REST, MIN_BOUNCE,
  SPEED_CAP, PORTAL_CD, STAR_R, MAX_STEPS, REST_STEPS, REST_PX,
  OB_JITTER, OB_MAX_DEV, H, BOARD,
} from '../constants';

const DELTA = 1000 / 60;

/* Solved empirically, not guessed: Matter's per-step acceleration is
   gravity.y * gravity.scale * delta^2, so at a 1/60s delta this scale
   reproduces the tuned GRAVITY of 0.375 px/step^2 exactly. */
export const MATTER_GRAVITY_SCALE = 0.00135;

export interface MatterConfig {
  gravityScale: number;
  restitution: number;
  slipRestitution: number;
  /** Downward clamp. null = none, and the ball accelerates without limit. */
  terminalVy: number | null;
  /** Overall speed clamp. null = none, and a fast ball tunnels thin ramps. */
  speedCap: number | null;
  /** Floor on post-bounce speed. null = none, and glancing hits can kill it. */
  minBounce: number | null;
  /** Keep the seeded random scatter on obstacle hits. */
  jitter: boolean;
}

/** Matter, with the guards that keep this board playable. */
export const MATTER_TUNED: MatterConfig = {
  gravityScale: MATTER_GRAVITY_SCALE,
  restitution: RESTITUTION,
  slipRestitution: SLIP_REST,
  terminalVy: TERMINAL_VY,
  speedCap: SPEED_CAP,
  minBounce: MIN_BOUNCE,
  jitter: true,
};

/** Matter with nothing on top. Kept so the cost of the guards can be
    measured rather than argued about - window.__gtb.simulatePureMatter(). */
export const MATTER_PURE: MatterConfig = {
  gravityScale: MATTER_GRAVITY_SCALE,
  restitution: RESTITUTION,
  slipRestitution: SLIP_REST,
  terminalVy: null,
  speedCap: null,
  minBounce: null,
  jitter: false,
};

/** What a body in the world represents, so a contact can be named. */
interface BodyTag { kind: HitKind; index: number; }

export class MatterBall implements BallState {
  px: number; py: number;
  steps = 0; hits = 0; segHits = 0;
  hit: Hit = { n: 0, x: 0, y: 0, nx: 0, ny: 0, kind: '', speed: 0 };
  bounces: BounceRecord[] = [];

  boostIn: boolean[];
  portalCd = 0;
  portalHold: { k: number; side: 'a' | 'b' } | null = null;
  broken: boolean[];
  justBroke: number[] = [];
  got: boolean[];
  stars = 0; boosts = 0; teleports = 0;

  restX: number; restY: number; restAt = 0;
  restMin = Infinity;
  spdMin = Infinity; spdMax = -Infinity; vyMax = 0;

  result: DropResult | null = null;
  readonly rng: () => number;

  /* the Matter world for THIS drop - one per run, disposed with it */
  readonly engine: Engine;
  readonly body: MBody;
  readonly tags = new Map<number, BodyTag>();
  readonly breakableBodies: (MBody | null)[];
  /** Contacts Matter reported this frame, drained after the step. */
  pending: { tag: BodyTag; nx: number; ny: number }[] = [];

  constructor(lv: Level, seed: number, broken: boolean[] | null | undefined,
              readonly cfg: MatterConfig) {
    this.px = lv.spawn.x; this.py = lv.spawn.y;
    this.restX = lv.spawn.x; this.restY = lv.spawn.y;
    this.boostIn = falses(lv.boosters.length);
    this.broken = broken ? broken.slice() : falses(lv.breakables.length);
    this.got = falses(lv.stars.length);
    this.rng = mulberry32(seed >>> 0);

    this.engine = Engine.create();
    this.engine.gravity.y = 1;
    this.engine.gravity.scale = cfg.gravityScale;

    /* The ball. No air drag and no surface friction: the board's feel comes
       from restitution alone, and friction would spin it and bleed speed in a
       way none of the levels were built around. */
    this.body = Bodies.circle(lv.spawn.x, lv.spawn.y, BALL_R, {
      restitution: cfg.restitution,
      friction: 0, frictionAir: 0, frictionStatic: 0,
      label: 'ball',
    });
    Composite.add(this.engine.world, this.body);

    const add = (b: MBody, kind: HitKind, index: number) => {
      this.tags.set(b.id, { kind, index });
      Composite.add(this.engine.world, b);
    };

    // level walls - real collidable geometry, not just a bounds check
    lv.walls.forEach((s, i) => add(segmentBody(s, WALL_HT), 'wall', i));
    lv.obstacles.forEach((o, i) => add(circleBody(o, cfg.restitution), 'obstacle', i));

    this.breakableBodies = lv.breakables.map((o, i) => {
      if (this.broken[i]) return null;          // already gone this session
      const b = circleBody(o, cfg.restitution);
      add(b, 'breakable', i);
      return b;
    });

    /* Record contacts as Matter reports them. The handler only COLLECTS -
       everything that changes the ball is applied after Engine.update returns,
       so the world is never mutated mid-solve. */
    Events.on(this.engine, 'collisionStart', (e: IEventCollision<Engine>) => {
      for (const pair of e.pairs) {
        const other = pair.bodyA === this.body ? pair.bodyB
                    : pair.bodyB === this.body ? pair.bodyA : null;
        if (!other) continue;
        const tag = this.tags.get(other.id);
        if (!tag) continue;
        /* The normal is taken from GEOMETRY, not from pair.collision.normal.
           Matter's normal follows its own bodyA/bodyB ordering, and getting
           that convention subtly wrong is invisible: the outward-cone clamp in
           scatter() forces the result into a plausible-looking cone either
           way, so a flipped normal produces bounces that pass every sanity
           check while being nowhere near a true reflection.

           Ball-minus-surface is unambiguous, so that is what outwardNormal()
           derives, for every body kind. */
        this.pending.push({ tag, nx: 0, ny: 0 });
      }
    });
  }

  /* ---- BallState, read straight off the Matter body ---- */
  get x(): number { return this.body.position.x; }
  set x(v: number) { Body.setPosition(this.body, { x: v, y: this.body.position.y }); }
  get y(): number { return this.body.position.y; }
  set y(v: number) { Body.setPosition(this.body, { x: this.body.position.x, y: v }); }
  get vx(): number { return this.body.velocity.x; }
  set vx(v: number) { Body.setVelocity(this.body, { x: v, y: this.body.velocity.y }); }
  get vy(): number { return this.body.velocity.y; }
  set vy(v: number) { Body.setVelocity(this.body, { x: this.body.velocity.x, y: v }); }
  get speed(): number { return Math.hypot(this.vx, this.vy); }

  setVelocity(vx: number, vy: number): void { Body.setVelocity(this.body, { x: vx, y: vy }); }
  setPosition(x: number, y: number): void { Body.setPosition(this.body, { x, y }); }

  noteHit(x: number, y: number, nx: number, ny: number, kind: HitKind): void {
    const h = this.hit;
    h.n++; h.x = x; h.y = y; h.nx = nx; h.ny = ny; h.kind = kind;
    h.speed = this.speed;
  }

  noteSpeed(): void {
    const m = this.speed;
    if (m < this.spdMin) this.spdMin = m;
    if (m > this.spdMax) this.spdMax = m;
    if (this.vy > this.vyMax) this.vyMax = this.vy;
  }

  /* The only place the board's WIDTH reaches the simulation. There are no
     side walls, so this is what makes leaving sideways a loss - and what
     makes a wider board a more forgiving one rather than a different game. */
  isOutOfBounds(): boolean {
    return this.x < BOARD.x0 - BALL_R || this.x > BOARD.x1 + BALL_R ||
           this.y < -BALL_R || this.y > H + BALL_R;
  }

  tickStallWatch(): void {
    this.steps++;
    if (this.steps - this.restAt >= REST_STEPS) {
      const moved = Math.hypot(this.x - this.restX, this.y - this.restY);
      if (moved < this.restMin) this.restMin = moved;
      if (moved < REST_PX) { this.result = 'timeout'; return; }
      this.restX = this.x; this.restY = this.y; this.restAt = this.steps;
    }
    if (this.steps >= MAX_STEPS) this.result = 'timeout';
  }

  /** Take a breakable out of the world for the rest of the run. */
  removeBreakable(i: number): void {
    const b = this.breakableBodies[i];
    if (!b) return;
    Composite.remove(this.engine.world, b);
    this.tags.delete(b.id);
    this.breakableBodies[i] = null;
  }

  dispose(): void {
    Events.off(this.engine, 'collisionStart', null as never);
    Composite.clear(this.engine.world, false, true);
    Engine.clear(this.engine);
  }

  toResult(): SimulationResult {
    return {
      result: this.result ?? 'timeout',
      steps: this.steps, hits: this.hits, segHits: this.segHits,
      spdMin: this.spdMin, spdMax: this.spdMax, vyMax: this.vyMax,
      restMin: this.restMin, secs: this.steps / 60,
      stars: this.stars, boosts: this.boosts, teleports: this.teleports,
      broken: this.broken.slice(), bounces: this.bounces,
      x: this.x, y: this.y,
    };
  }
}

/* A segment becomes a rotated static rectangle of the thickness the renderer
   draws it at (RAMP_HT / WALL_HT), so what the player sees is what collides. */
function segmentBody(s: Segment, halfT: number): MBody {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len = Math.hypot(dx, dy) || 1;
  return Bodies.rectangle((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, len, halfT * 2, {
    isStatic: true, angle: Math.atan2(dy, dx), friction: 0, restitution: 0,
  });
}

function circleBody(o: Circle, restitution: number): MBody {
  return Bodies.circle(o.x, o.y, o.r, { isStatic: true, friction: 0, restitution });
}

export class MatterEngine implements PhysicsEngine {
  constructor(readonly cfg: MatterConfig = MATTER_TUNED) {}

  createBall(lv: Level, seed: number, broken?: boolean[] | null): MatterBall {
    return new MatterBall(lv, seed, broken, this.cfg);
  }

  dispose(ball: BallState): void { (ball as MatterBall).dispose(); }

  step(ballState: BallState, lv: Level, ramps: readonly Segment[]): void {
    const b = ballState as MatterBall;
    const cfg = this.cfg;

    /* Player ramps can change between drops but never DURING one, so they are
       added on the first step rather than rebuilt every frame. */
    if (b.steps === 0 && !b.tags.size) { /* walls already added in ctor */ }
    if (b.steps === 0) syncRamps(b, ramps);

    // wind is an acceleration, so it goes on before the solve
    for (const z of lv.wind) {
      if (inRect(b.x, b.y, z)) {
        b.setVelocity(b.vx + (z.ax || 0), b.vy + (z.ay || 0));
        capSpeed(b, cfg);
      }
    }

    /* Ice: Matter takes the GREATER of the two restitutions on a pair, so
       raising the ball's is enough to make every surface inside the zone
       bouncier without touching the surfaces themselves. */
    let rest = cfg.restitution;
    for (const z of lv.slippery) if (inRect(b.x, b.y, z)) { rest = cfg.slipRestitution; break; }
    b.body.restitution = rest;

    /* The velocity going IN. Matter resolves the contact its own way, but the
       obstacle scatter is specified against a TRUE mirror reflection (see
       scatter()), and that has to be computed from the incoming vector. */
    const inVx = b.vx, inVy = b.vy;

    b.pending.length = 0;
    Engine.update(b.engine, DELTA);

    /* ---- contacts Matter reported, applied now the solve is over ----

       `inX/inY` walks forward through the frame. A frame can carry more than
       one contact - a ramp and then an obstacle - and mirroring the SECOND
       one about the velocity the frame started with reflects a vector the
       ball no longer had. Each contact therefore updates the incoming vector
       for the next. */
    let inX = inVx, inY = inVy;
    for (const c of b.pending) {
      const n = outwardNormal(b, c.tag, lv, ramps);
      c.nx = n.x; c.ny = n.y;

      /* Only a real reflection is an impact. Matter reports a contact for as
         long as the shapes overlap, so a ball already travelling AWAY from a
         surface - pushed clear on an earlier frame, or resolved out of a deep
         penetration - keeps generating pairs. Those are grazes: no bounce, no
         scatter, no shatter. Only an approaching contact - dot < 0 against
         the outward normal - counts as a hit. */
      if (inX * n.x + inY * n.y >= 0) continue;
      if (c.tag.kind === 'wall' || c.tag.kind === 'ramp') {
        b.segHits++;
        if (cfg.minBounce !== null) enforceMinBounce(b, c.nx, c.ny, cfg.minBounce);
        b.noteHit(b.x, b.y, c.nx, c.ny, c.tag.kind);
        inX = b.vx; inY = b.vy;
      } else if (c.tag.kind === 'obstacle' || c.tag.kind === 'breakable') {
        b.hits++;
        if (cfg.jitter) scatter(b, c.nx, c.ny, inX, inY);
        if (cfg.minBounce !== null) enforceMinBounce(b, c.nx, c.ny, cfg.minBounce);
        b.noteHit(b.x, b.y, c.nx, c.ny, c.tag.kind);
        if (c.tag.kind === 'breakable' && !b.broken[c.tag.index]) {
          b.broken[c.tag.index] = true;
          b.justBroke.push(c.tag.index);
          b.removeBreakable(c.tag.index);
        }
        inX = b.vx; inY = b.vy;
      }
    }

    /* ---- portals, on arrival ---- */
    if (b.portalHold) {
      const h = lv.portals[b.portalHold.k][b.portalHold.side];
      if (Math.hypot(b.x - h.x, b.y - h.y) > h.r) b.portalHold = null;
    }
    if (b.portalCd > 0) b.portalCd--;
    if (!b.portalHold && b.portalCd === 0) {
      for (let k = 0; k < lv.portals.length; k++) {
        const p = lv.portals[k];
        let exit = null, side: 'a' | 'b' = 'a';
        if (Math.hypot(b.x - p.a.x, b.y - p.a.y) <= p.a.r) { exit = p.b; side = 'b'; }
        else if (Math.hypot(b.x - p.b.x, b.y - p.b.y) <= p.b.r) { exit = p.a; side = 'a'; }
        if (!exit) continue;
        b.setPosition(exit.x, exit.y);
        if (exit.facing !== undefined && exit.facing !== null) {
          const sp = b.speed || (cfg.minBounce ?? 1);
          const a = exit.facing * Math.PI / 180;
          b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
        }
        b.portalCd = PORTAL_CD;
        b.portalHold = { k, side };
        b.teleports++;
        b.noteHit(exit.x, exit.y, 0, -1, 'portal');
        break;
      }
    }

    /* ---- boosters: fire once, on entry, and overrule the solve ---- */
    for (let k = 0; k < lv.boosters.length; k++) {
      const z = lv.boosters[k];
      const inside = Math.hypot(b.x - z.x, b.y - z.y) <= z.r;
      if (inside && !b.boostIn[k]) {
        const a = z.angle * Math.PI / 180;
        const sp = cfg.speedCap === null ? z.speed : Math.min(z.speed, cfg.speedCap);
        b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
        b.boosts++;
        b.noteHit(z.x, z.y, Math.cos(a), Math.sin(a), 'booster');
      }
      b.boostIn[k] = inside;
    }

    // stars are scenery to the physics - they never touch the trajectory
    for (let k = 0; k < lv.stars.length; k++) {
      if (b.got[k]) continue;
      const st = lv.stars[k];
      if (Math.hypot(b.x - st.x, b.y - st.y) <= STAR_R + BALL_R) { b.got[k] = true; b.stars++; }
    }

    if (cfg.terminalVy !== null && b.vy > cfg.terminalVy) b.setVelocity(b.vx, cfg.terminalVy);
    capSpeed(b, cfg);
    b.noteSpeed();

    const c = lv.target;
    if (Math.hypot(b.x - c.x, b.y - c.y) <= c.r) { b.result = 'win'; return; }
    if (b.isOutOfBounds()) { b.result = 'out'; return; }
    b.tickStallWatch();
  }

  simulate(lv: Level, ramps: readonly Segment[], seed: number,
           broken?: boolean[] | null): SimulationResult {
    const b = this.createBall(lv, seed, broken);
    while (!b.result) this.step(b, lv, ramps);
    const out = b.toResult();
    b.dispose();
    return out;
  }
}

/* ---------------- helpers ---------------- */

function syncRamps(b: MatterBall, ramps: readonly Segment[]): void {
  ramps.forEach((s, i) => {
    const body = segmentBody(s, RAMP_HT);
    b.tags.set(body.id, { kind: 'ramp', index: i });
    Composite.add(b.engine.world, body);
  });
}

/* The outward surface normal at a contact, from the ball's centre. Circles
   give it directly; segments give it through the closest point on the line. */
function outwardNormal(b: MatterBall, tag: BodyTag, lv: Level,
                       ramps: readonly Segment[]): { x: number; y: number } {
  let cx: number, cy: number;
  if (tag.kind === 'obstacle' || tag.kind === 'breakable') {
    const o = tag.kind === 'obstacle' ? lv.obstacles[tag.index] : lv.breakables[tag.index];
    cx = o.x; cy = o.y;
  } else {
    const s = tag.kind === 'wall' ? lv.walls[tag.index] : ramps[tag.index];
    if (!s) return { x: 0, y: -1 };
    const p = closestOnSeg(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
    cx = p.x; cy = p.y;
  }
  const dx = b.x - cx, dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  return d < 1e-6 ? { x: 0, y: -1 } : { x: dx / d, y: dy / d };
}

function inRect(x: number, y: number, z: { x: number; y: number; w: number; h: number }): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

function capSpeed(b: MatterBall, cfg: MatterConfig): void {
  if (cfg.speedCap === null) return;
  const m = b.speed;
  if (m > cfg.speedCap) { const k = cfg.speedCap / m; b.setVelocity(b.vx * k, b.vy * k); }
}

function enforceMinBounce(b: MatterBall, nx: number, ny: number, floor: number): void {
  const m = b.speed;
  if (m >= floor) return;
  if (m > 1e-6) { const k = floor / m; b.setVelocity(b.vx * k, b.vy * k); }
  else b.setVelocity(nx * floor, ny * floor);
}

/* The obstacle scatter is a GAME MECHANIC, not a physics one: "red bounces you
   randomly" is a rule the player is taught, plans around, and reads about in
   the glossary - which promises a mirror reflection plus bounded scatter.

   So the outgoing angle is built from the TRUE mirror of the incoming vector
   about the contact normal, jittered by up to OB_JITTER and then clamped to an
   outward cone so the ball can never be sent back into what it just hit. The
   mechanic is therefore defined here, in game terms, rather than falling out
   of whatever the rigid-body solver happened to resolve.

   Matter's own resolved velocity is used only for its MAGNITUDE - the engine
   still decides what the collision costs. */
function scatter(b: MatterBall, nx: number, ny: number,
                 inVx: number, inVy: number): void {
  const sp = b.speed;
  if (sp < 1e-6) return;
  const inAng = Math.atan2(inVy, inVx);
  const nAng = Math.atan2(ny, nx);
  // mirror the incoming vector about the surface normal
  const dot = inVx * nx + inVy * ny;
  const rx = inVx - 2 * dot * nx, ry = inVy - 2 * dot * ny;
  let a = Math.atan2(ry, rx) + (b.rng() * 2 - 1) * OB_JITTER;
  let rel = a - nAng;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));      // wrap to [-PI, PI]
  if (rel > OB_MAX_DEV) rel = OB_MAX_DEV;
  else if (rel < -OB_MAX_DEV) rel = -OB_MAX_DEV;
  a = nAng + rel;
  b.bounces.push({ inAng, nAng, outAng: a });
  b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
}
