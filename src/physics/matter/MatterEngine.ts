/* ============================================================
   MATTER.JS ENGINE

   The game's simulator, behind the PhysicsEngine interface.
   Matter owns collision detection, contact resolution,
   restitution and integration; this file's job is to build a
   world from a Level, run it a frame at a time, and layer the
   game's own mechanics (boosters, wind, ice,
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
import { targetAt } from '../../levels/target';
import { strikeAt, STORM_R } from '../../levels/storm';
import { fishAt } from '../../levels/fish';
import type { BallState, PhysicsEngine } from '../PhysicsEngine';
import type { DropResult, Hit, HitKind, BounceRecord, SimulationResult } from '../types';
import { mulberry32, falses, closestOnSeg } from '../math';
import {
  BALL_R, RAMP_HT, WALL_HT, TERMINAL_VY, RESTITUTION, SLIP_REST, MIN_BOUNCE,
  SPEED_CAP, BOOST_GAIN, BOOST_CAP, BOOST_STEPS, STAR_R, BOX_R,
  MAX_STEPS, REST_STEPS, REST_PX,
  SPRING_GAIN, SPRING_CAP, SPRING_DECAY, SPRING_CD,
  BOOST_SUB_PX, BOOST_SUBSTEPS_MAX,
  OB_JITTER, OB_MAX_DEV, PLAY } from '../constants';

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
  /* Steps of boosted flight still owed. While it runs, the ball is held to
     BOOST_CAP rather than the board's general cap, and the downward clamp is
     off - otherwise the kick is undone by the same step that applied it. */
  boostCd = 0;
  /* ---- turbo: the boost RAMP's launch, and deliberately its own state ----

     The pads above are frozen physics (23 proved levels), so a launch off a
     bar gets its own ceiling and its own decay rather than widening theirs.
     `turboCap` IS the ceiling and the flag at once: above zero the ball is
     flying, held to that speed instead of the board's cap and exempt from the
     downward clamp, and it bleeds off by BOOST_DECAY every step until it
     falls back under the general cap and is switched off. Zero for any drop
     that never touches a bar, which is what keeps every other level's
     trajectory bit-identical. */
  turboCap = 0;
  /** Per-bar cooldown, so a two-sided bar cannot multiply a ball it has just
      launched back into itself. */

  /** Which of the player's ramps this drop has actually fired a spring on.
      Indexed by RAMP index, sized when the ramps are added (see syncRamps). */
  firedSpring: boolean[] = [];
  springCd: number[] = [];
  broken: boolean[];
  justBroke: number[] = [];
  got: boolean[];
  gotBox: boolean[];
  stars = 0; boosts = 0; springs = 0; boxes = 0;
  /** The last lightning strike that knocked this ball (see levels/storm). */
  struck = -1;

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
              readonly cfg: MatterConfig, readonly t0 = 0) {
    this.px = lv.spawn.x; this.py = lv.spawn.y;
    this.restX = lv.spawn.x; this.restY = lv.spawn.y;
    this.boostIn = falses(lv.boosters.length);
    this.broken = broken ? broken.slice() : falses(lv.breakables.length);
    this.got = falses(lv.stars.length);
    this.gotBox = falses(lv.boxes.length);
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
  /* Velocity is read straight off `body.velocity`, EXACTLY as it has been
     since this engine shipped. It is worth stating why, because the obvious
     "improvement" here changes the game: Matter's resolver applies its
     impulses to positionPrev and leaves body.velocity untouched, so on a frame
     with a contact this is the velocity going IN, not the one coming out, and
     every clamp in this file was tuned against that - swapping in
     Body.getVelocity() moves the landing point of a boosted drop.

     A subdivided frame is reconciled to these units by stepMatter() before
     anything reads them, so the subdivision is invisible here. */
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

  /* The only place the board's SIZE reaches the simulation. There are no
     side walls, so this is what makes leaving sideways a loss - and what
     makes a bigger board a more forgiving one rather than a different game.

     The PLAY area, not the board's own rect: the ball is lost at the edge of
     what the player can SEE, rather than at an inner line nothing marks. The
     two are the same rect until the app scales the scene down, and they are
     always the same in the harness - so every proof still stands. */
  isOutOfBounds(): boolean {
    return this.x < PLAY.x0 - BALL_R || this.x > PLAY.x1 + BALL_R ||
           this.y < PLAY.y0 - BALL_R || this.y > PLAY.y1 + BALL_R;
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
      stars: this.stars, boosts: this.boosts, springs: this.springs,
      boxes: this.boxes,
      broken: this.broken.slice(), bounces: this.bounces,
      x: this.x, y: this.y,
    };
  }
}

/* ============================================================
   ONE FRAME OF MATTER, SUBDIVIDED IF THE BALL IS FLYING

   Matter has no continuous collision detection, so a ball that
   travels further in one step than a bar is thick passes clean
   through it. Everything the base game and the authored pads can
   reach is under BOOST_CAP and therefore inside a ramp's
   thickness, which is why this was one call for the whole of the
   game's life so far.

   A boost ramp launches past that deliberately, so above
   BOOST_CAP the frame is run as several smaller Matter steps
   instead - enough of them that no single one advances more than
   BOOST_SUB_PX. Two things make that safe rather than a second
   physics model:

     - Matter's time correction rescales the Verlet velocity when
       the delta changes, so the ball keeps the speed it had.
     - Gravity is a force integrated over delta squared, and n
       steps of DELTA/n accumulate to the same velocity as one of
       DELTA. Nothing has to be re-tuned for the subdivision.

   And the GATE is what protects every proved level: at or below
   BOOST_CAP this is the single Engine.update it always was, bit
   for bit. Only a bar out of the bag can get a ball fast enough
   to take the other branch.
   ============================================================ */
function stepMatter(b: MatterBall): void {
  const sp = b.speed;
  /* The epsilon is load-bearing, not tidiness. A booster PAD sets the speed to
     exactly BOOST_CAP, and hypot(cos(a) * 13, sin(a) * 13) comes back as
     13.000000000000002 - so a bare `>` test subdivided the frame after every
     authored pad in the game and moved twenty-three proved levels by a
     pixel. Only something genuinely faster than the cap may take that branch. */
  if (sp <= BOOST_CAP + 1e-9) { Engine.update(b.engine, DELTA); return; }
  const n = Math.min(BOOST_SUBSTEPS_MAX, Math.ceil(sp / BOOST_SUB_PX));
  for (let i = 0; i < n; i++) {
    Engine.update(b.engine, DELTA / n);
    /* Stop the moment the ball is off the board. The remaining substeps would
       only carry it further out, and the frame's own out-of-bounds test - run
       after this returns - reads the same answer either way. */
    if (b.isOutOfBounds()) break;
  }
  /* BACK INTO FRAME UNITS. Inside the loop Matter is storing displacement per
     DELTA/n, so body.velocity is a fraction of the real speed and every clamp
     that reads it would be reading the wrong number. The true velocity is the
     displacement the resolver actually left behind - position minus
     positionPrev, scaled up - and writing it back with the body's delta reset
     makes body.velocity, positionPrev and the next frame's time correction all
     agree again. The ball is not moved: only its bookkeeping. */
  const v = Body.getVelocity(b.body);
  /* `deltaTime` is real Matter state - it is what Body.update writes and what
     getVelocity/setVelocity scale by - and simply missing from the typings. */
  (b.body as unknown as { deltaTime: number }).deltaTime = DELTA;
  Body.setVelocity(b.body, v);
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

  createBall(lv: Level, seed: number, broken?: boolean[] | null, t0 = 0): MatterBall {
    return new MatterBall(lv, seed, broken, this.cfg, t0);
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

    /* Where the ball was when this frame started. Taken here rather than read
       off b.px/b.py, which belong to the RENDERER's interpolation and are
       advanced by the controller, not by the simulation - so a headless drop
       never moves them. The swept pickup tests below need the real start of
       this frame and nothing else. */
    const fromX = b.x, fromY = b.y;

    b.pending.length = 0;
    stepMatter(b);

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
        /* ============================================================
           A SPRUNG RAMP FIRING

           Matter has already done the bounce - a sprung ramp is
           the same body as any other, and the player drew it - so
           the HEADING is settled and is not touched here. All
           that happens is the magnitude: what left is multiplied,
           held to SPRING_CAP, and the ceiling the rest of the
           step obeys is raised to match.

           Multiplying the OUTGOING vector rather than firing
           along an authored angle is the whole point of the item:
           where the ball goes is a consequence of how the player
           drew the ramp, and the spring only says how hard.
           ============================================================ */
        const sprung = c.tag.kind === 'ramp' && ramps[c.tag.index]?.spring;
        if (sprung && b.springCd[c.tag.index] === 0) {
          /* The multiplier is applied to the speed the ball came IN with, not
             to what the bounce left behind. Those differ by the restitution,
             and the promise the item makes - and the glossary prints - is
             "four times faster than it went in", so that is the number
             multiplied. Taking the outgoing speed instead quietly made it
             three and a half. */
          const sp = Math.min(Math.hypot(inX, inY) * SPRING_GAIN,
                              cfg.speedCap === null ? Infinity : SPRING_CAP);
          const m = b.speed;
          /* A contact that somehow left no velocity at all is fired straight
             back out along the surface normal: a spring must never swallow a
             ball, and there is no other direction available. */
          if (m > 1e-6) b.setVelocity(b.vx / m * sp, b.vy / m * sp);
          else b.setVelocity(c.nx * sp, c.ny * sp);
          b.turboCap = Math.max(b.turboCap, sp);
          b.springCd[c.tag.index] = SPRING_CD;
          b.firedSpring[c.tag.index] = true;
          b.springs++;
        }
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

    /* ---- boosters: fire once, on entry, and overrule the solve ---- */
    for (let k = 0; k < lv.boosters.length; k++) {
      const z = lv.boosters[k];
      const inside = Math.hypot(b.x - z.x, b.y - z.y) <= z.r;
      if (inside && !b.boostIn[k]) {
        const a = z.angle * Math.PI / 180;
        /* The kick is held to the BOOSTER's own ceiling, not the board's. The
           general cap is hypot(MAX_VX, TERMINAL_VY) - the fastest the base
           game can reach on its own - and every authored booster speed is
           already within a whisker of it, so clamping the gain to that cap
           would quietly turn a 2x into a few percent. What a boosted ball must
           still respect is the tunnelling limit, which is what BOOST_CAP is.
           A config with no cap at all (MATTER_PURE) keeps none here either. */
        const sp = cfg.speedCap === null
          ? z.speed * BOOST_GAIN
          : Math.min(z.speed * BOOST_GAIN, BOOST_CAP);
        b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
        b.boostCd = BOOST_STEPS;
        b.boosts++;
        b.noteHit(z.x, z.y, Math.cos(a), Math.sin(a), 'booster');
      }
      b.boostIn[k] = inside;
    }

    /* Did this frame cover more ground than a point test can be trusted with?
       A turbo ball can jump clean over a star, a fire, or the target itself
       between two frames, so those three switch to the swept test the boxes
       already use.

       THREE conditions, and each is load-bearing:

         turboCap  only a boost ramp can make a frame long enough to need
                   this, and gating on it is what keeps every level proved
                   against the point tests still proved - a drop that never
                   touches a bar takes the identical branch it always did.
         distance  below the tunnelling limit a point test cannot miss
                   anything anyway, so there is nothing to fix.

       There used to be a third: a PORTAL moved the ball discontinuously, and
       sweeping that "path" collected every star on the line between the two
       ends. Portals are gone, and with them the only way a frame's start and
       end were ever anything but the two ends of a real line. */
    const flew = b.turboCap > 0 &&
                 Math.hypot(b.x - fromX, b.y - fromY) > BOOST_CAP;
    const reached = (o: { x: number; y: number }, r: number) =>
      (flew ? segNear(fromX, fromY, b.x, b.y, o.x, o.y)
            : Math.hypot(b.x - o.x, b.y - o.y)) <= r;

    // stars are scenery to the physics - they never touch the trajectory
    for (let k = 0; k < lv.stars.length; k++) {
      if (b.got[k]) continue;
      if (reached(lv.stars[k], STAR_R + BALL_R)) { b.got[k] = true; b.stars++; }
    }

    /* Mystery boxes: scenery too, and for the same reason - a bonus pickup
       that nudged the ball would change the solution of every level it was
       added to, and these are added to all 150.

       Tested against the SWEPT segment rather than the point, unlike the
       stars above. A boosted ball covers over 20 units in a step and a box is
       26 across, so a point test misses one it went straight through - and a
       pickup the ball visibly passed through without collecting reads as a
       bug, where a star simply reads as a near miss. */
    for (let k = 0; k < lv.boxes.length; k++) {
      if (b.gotBox[k]) continue;
      const bx = lv.boxes[k];
      if (segNear(b.px, b.py, b.x, b.y, bx.x, bx.y) <= BOX_R + BALL_R) {
        b.gotBox[k] = true; b.boxes++;
      }
    }

    for (let k = 0; k < b.springCd.length; k++)
      if (b.springCd[k] > 0) b.springCd[k]--;

    /* The kick outlives the step that applied it. Both clamps below would
       otherwise take it straight back: terminalVy alone drags a downward
       booster from 24 to 9 in the frame it fired. A turbo launch is exempt
       from the downward clamp for exactly the same reason, for as long as its
       own ceiling is still above the board's. */
    if (b.boostCd > 0) b.boostCd--;
    if (b.boostCd === 0 && b.turboCap === 0 &&
        cfg.terminalVy !== null && b.vy > cfg.terminalVy)
      b.setVelocity(b.vx, cfg.terminalVy);
    capSpeed(b, cfg);
    /* The launch bleeding back into the board's own rules. AFTER the clamp, so
       the frame a bar fires on keeps the full exit speed, and geometric rather
       than a window that ends: a ceiling that dropped from 90 to 12.7 in one
       step reads as the ball hitting something invisible. */
    if (b.turboCap > 0) {
      b.turboCap *= SPRING_DECAY;
      if (b.turboCap <= (cfg.speedCap ?? 0)) b.turboCap = 0;
    }
    b.noteSpeed();

    /* ---- fire: contact ends the run, with no bounce to resolve ----

       Deliberately a distance test and NOT a Matter body. A body would have
       to be given a restitution and would deflect the ball on the frame it
       killed it, which is the one thing this hazard must never do - the whole
       point of it is that it is not a bumper. Tested after the solve for the
       same reason the target is: this is the ball's settled position for the
       step, so what ended the run is what the player watched it touch. */
    for (let k = 0; k < lv.fires.length; k++) {
      const f = lv.fires[k];
      if (reached(f, f.r + BALL_R)) {
        b.noteHit(f.x, f.y, 0, -1, 'fire');
        b.result = 'burned';
        return;
      }
    }

    /* ---- eater fish: one that reaches the ball swallows it - the run ends,
       like fire. Where the fish is comes off the step clock (levels/fish). */
    if (lv.fish) for (const f of lv.fish) {
      const at = fishAt(f, b.t0 + b.steps);
      if (reached(at, f.r + BALL_R)) { b.result = 'eaten'; return; }
    }

    /* ---- lightning: a live strike that reaches the ball ENDS the run, like
       fire. Off the same step clock as the patrol, so it is exactly where and
       when the board shows it. `struck` is kept so the game can play the
       crack for the strike that did it. */
    const strike = strikeAt(lv, b.t0 + b.steps);
    if (strike && reached(strike.p, STORM_R + BALL_R)) {
      b.struck = strike.key;
      b.result = 'zapped';
      return;
    }

    /* The target's position NOW, which on a patrolling board is not where it
       was authored. The clock is the drop's start phase plus the steps it has
       run - the target was already moving while the player planned, and t0
       is where it had got to when the ball was let go. See targetAt. */
    const c = targetAt(lv, b.t0 + b.steps);
    if (reached(c, c.r)) { b.result = 'win'; return; }
    if (b.isOutOfBounds()) { b.result = 'out'; return; }
    b.tickStallWatch();
  }

  simulate(lv: Level, ramps: readonly Segment[], seed: number,
           broken?: boolean[] | null, t0 = 0): SimulationResult {
    const b = this.createBall(lv, seed, broken, t0);
    while (!b.result) this.step(b, lv, ramps);
    const out = b.toResult();
    b.dispose();
    return out;
  }
}

/* ---------------- helpers ---------------- */

function syncRamps(b: MatterBall, ramps: readonly Segment[]): void {
  /* Sized here rather than at ball creation: the ramps are the PLAYER's and
     arrive with the first step, not with the level. */
  b.springCd = ramps.map(() => 0);
  b.firedSpring = ramps.map(() => false);
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

/* Distance from a point to the segment the ball travelled this step. The
   pickup pass uses it so a fast ball cannot tunnel straight through a box
   between two frames. */
function segNear(x1: number, y1: number, x2: number, y2: number,
                 px: number, py: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function inRect(x: number, y: number, z: { x: number; y: number; w: number; h: number }): boolean {
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

function capSpeed(b: MatterBall, cfg: MatterConfig): void {
  if (cfg.speedCap === null) return;
  /* Three ceilings, and the ball is held to the highest one in force.

     A booster PAD is an authored kick allowed to outrun the general cap for
     its window, but never the tunnelling limit BOOST_CAP - it gets no
     substepping, so 13 units a frame is as fast as it may collide honestly.

     A boost RAMP is allowed past that, because a frame above BOOST_CAP is
     subdivided (see stepMatter) and stays honest at any speed; its ceiling is
     the launch itself, decaying back to the general cap. */
  const cap = Math.max(cfg.speedCap,
                       b.boostCd > 0 ? BOOST_CAP : 0,
                       b.turboCap);
  const m = b.speed;
  if (m > cap) { const k = cap / m; b.setVelocity(b.vx * k, b.vy * k); }
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
