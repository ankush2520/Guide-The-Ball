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
`spawn`, `obstacles`, `target {x,y,r}` and `targetType`.

**Target types.** Wall segments are generated from `targetType` by `buildWalls()`
around the circular target and are **real collidable geometry** — the same
segment-bounce code as player ramps, so they mirror the ball's direction and
never change its speed. `OPEN`, `SIDE_WALL`, `POCKET`, `NARROW_GAP`, `ENCLOSED`.
For `NARROW_GAP`, `gapW` is the **clear window the ball can pass through**, not
the raw span between bars.

**Every target is static.** Levels 17, 19 and 20 used to glide between
waypoints; that was removed because a target sliding through the space a ramp
occupies made an ordinary collision read as a bug. Each level's walls are
therefore built once at boot into `lv.walls` and never rebuilt. The difficulty
those three levels lost is paid back with tighter ramp budgets and denser
boards — see the header comments on each. If movement is ever wanted back, the
constraint it needs is that no waypoint path may cross the region the player
draws ramps in.

Progress (highest level reached) persists in `localStorage` under
`gtb.progress.v1`; blocked storage degrades to "no saving", never a crash.
Tap the level name to open the level picker.

## Balls

Balls gate **attempts at levels, not drops**. Entering or restarting a level
costs one; once you are inside it, every adjust-and-drop is free, however many
it takes. The resource paces how much of the game you move through in a
sitting and never punishes you for iterating on the puzzle in front of you,
which is the whole activity. `gtb.balls.v1` holds `{balls}`.

`enterLevel()` is the only thing that spends, and the only thing an empty tank
blocks. Boot deliberately does *not* go through it — resuming the level you are
already sitting in is not entering one, and charging for it would let a reload
wall a player out of a game they are part-way through. There is nothing to farm
by reloading either, since retries inside a level are already free.

An empty tank never disables Drop Ball. A player on their last ball still gets
to finish the level they started, first-clear bonus included — which is often
exactly what refills the tank.

**Faucets**

| Source | Amount |
|---|---|
| First open, ever | 10 |
| First clear of a level (once, ever) | +1 / +2 / +2 / +3 by Act |
| Daily wheel | 1–5 |
| Rewarded ad | +3 |

Act 1 pays 1, matching the 1-per-entry cost, so walking it is ball-neutral;
every later Act pays more than it costs. A player who is progressing always
gains ground, and only a player who is stuck ever runs dry.

The first-clear bonus is keyed off a `cleared` map in `gtb.progress.v1`, not
off `highest`. Two reasons: `highest` stops at the last level index so it can
never register the finale as cleared, and the finale pays the most; and a map
is what makes "once, ever" literally true, so an easy cleared level cannot be
farmed for balls. Saves from before it existed are migrated on load — reaching
level N proves every level below it was cleared.

At zero, `#noballs` goes up on the blocked action (not as a persistent state)
and remembers what it interrupted, so topping up carries the player straight
into the level they were going for. It sits after the win overlay in the DOM so
it can appear over "Next", and before the wheel so the wheel is still reachable
from it.

**The "Watch Ad" button is a placeholder** that grants the balls outright.
It is marked `TODO` in `index.html` and must be wired to the portal's rewarded
video (`CrazyGames.SDK.ad.requestAd('rewarded')` / `PokiSDK.rewardedBreak()`)
before submission — and the balls must only be granted if the player actually
watched.

**"Buy Balls" is deliberately inert** — visible, disabled, "Coming Soon", with
no payment logic behind it. Web portals have no built-in purchase system the
way app stores do; real money would need a separate payment processor *and* a
player account system, neither of which exist here. Check what CrazyGames and
Poki actually permit before building either.

## Daily spin

One free spin every 24 hours, paying straight into the ball tank — which is
what makes the two features worth having together rather than separately.
`gtb.spin.v1` holds `{last, pending}`.

`SPIN_PRIZES` is the wedge layout *and* the weighting: ~97% of the weight is
1–3 balls and the 5-ball jackpot is ~3%, for an expected value just under two
balls a day. Tune the table, not the code.

**The result is decided before the wheel turns**, and the animation is then
aimed at it by `spinTarget(ix, from, jitter)` — never the other way round. A
wheel whose visual landing and actual payout are rolled independently reads as
rigged even when it is not. `spinTarget()` is pure and exported so the suite
checks every wedge from every starting angle rather than trusting one spin.

`pending` is why the prize is written to storage *before* the animation
starts: committing up front means closing the tab mid-spin cannot be used to
re-roll a bad prize, and the prize is then owed, so `loadSpin()` pays it on the
next load. A `last` stamp in the future hands back a spin rather than locking
the wheel forever.

The wheel is painted once into its own canvas and rotated with a CSS
transform, so the compositor animates it and the board's rAF loop is never
asked to draw the wheel as well.

    node tests/levels.mjs 0 19    # per-level winnability, precision, triviality

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
