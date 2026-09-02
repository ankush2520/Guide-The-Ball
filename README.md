# Guide the Ball

A hyper-casual puzzle game. Place a limited number of ramps, then drop the ball
and watch whether your plan lands it in the target. Plan-first, not reflex-based.

**The entire game is [`index.html`](index.html)** — inline CSS and JS, zero
dependencies, no build step. Open it in a browser and it runs. Zip it and it's
ready for CrazyGames / Poki / Softgames.

## Run

    npm run dev        # http://localhost:5173
    npm test           # Playwright suite + solver sweep

`npm` is only needed for the tests; the game itself has no toolchain.

## Levels

`LEVELS[]` in [index.html](index.html) holds all 20: `id`, `name`, `maxBlocks`,
`spawn`, `obstacles`, `target {x,y,r}`, `targetType`, and an optional `move`.

**Target types.** Wall segments are generated from `targetType` by `buildWalls()`
around the circular target and are **real collidable geometry** — the same
segment-bounce code as player ramps, so they mirror the ball's direction and
never change its speed. `OPEN`, `SIDE_WALL`, `POCKET`, `NARROW_GAP`, `ENCLOSED`.
For `NARROW_GAP`, `gapW` is the **clear window the ball can pass through**, not
the raw span between bars.

**Moving targets** (levels 17, 19, 20 only) glide in straight lines between
fixed waypoints at constant speed, looping `A→B→A` or `A→B→C→A`. Pure linear
interpolation — nothing in this game rotates or orbits.

    move: { points:[{x,y},{x,y}], speed: 60 }   // speed in px/sec

`targetAt(lv, t)` is evaluated every step from `b.t0 + steps/60`, and any
attached walls are rebuilt from the live centre, so they travel with the target
as a rigid unit. The clock runs during planning too, so the path is visible
before you commit. `simulate(ramps, seed, level, t0)` takes the drop phase, so
the solver can sweep drop timing.

Progress (highest level reached) persists in `localStorage` under
`gtb.progress.v1`; blocked storage degrades to "no saving", never a crash.
Tap the level name to open the level picker.

    node tests/levels.mjs 0 19    # per-level winnability, precision, timing

## Layout

    index.html         the game — everything
    tools/serve.mjs    zero-dep static server for `npm run dev`
    tests/play.test.mjs  Playwright suite: UI, physics invariants, solver sweep
    tests/tune.mjs     physics tuning rig — compares SPEED values on level health
    tests/levels.mjs   per-level design harness — winnability, precision, triviality

## Physics

The ball's **speed is constant for the entire drop** — only direction changes.
Gravity applies a downward nudge to the direction, and the velocity vector is
re-normalised back to `SPEED` every frame and after every collision. This is
deliberate: you commit to ramp placement before watching, so unpredictable
acceleration would make the ball's path impossible to reason about.

`CURVE` is set to **0**: the ball travels in perfectly straight lines and only
changes direction when it hits something. A ramp sets an angle and the ball
holds that angle. Raising `CURVE` bends the path into a downward arc instead
(0.00756 gives a hard 227°/sec curve, which erases the ramp angle in a quarter
of a second). `GRAV_BIAS` is derived as `CURVE × SPEED²`, so trajectory shape
stays fixed when only the speed changes.

The cost of `CURVE = 0` is that a ball knocked horizontal can bounce between the
walls forever; those runs end on the 14s timeout (~8% of careless layouts).

Obstacle hits mirror off the circle like a real bounce, then scatter by up to
`OB_JITTER`, clamped to an outward cone so the ball never re-enters what it hit.

Re-run `npm test` after touching any physics constant — the solver sweep checks
the level stays winnable with a sensible ramp but not winnable by accident.
