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

**Difficulty goes in the approach, never in the doorway.** Walls bounce the
ball predictably, so a tight *wall* gap is a skill test — `NARROW_GAP` gets down
to 38px and is fair. Obstacles scatter it at random, so a tight *obstacle* gap
is a lottery. Level 20 briefly had an obstacle on its cup's mouth that left
1.5px either side for an 18px ball: the winning line took nine obstacle bounces
and lost on one seed in seven. Section 2b of the suite now measures every
obligatory passage and fails if an obstacle takes most of one.

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

**One ball per drop, win or lose** — the cost is throwing it, not the result.
Moving between levels is free: the picker, Next and boot all cost nothing, and
the ball is spent at the moment it is actually used. `gtb.balls.v1` holds
`{balls}`.

At zero, Drop Ball stays **enabled** and the press raises `#noballs` instead of
dropping. A dead grey button tells a player they are stuck without telling them
what to do about it; this way the button still answers the tap. Being broke
never traps you on one level either — you can still move around the game, you
just cannot throw a ball.

**Faucets**

| Source | Amount |
|---|---|
| First open, ever | 10 |
| First clear of a level (once, ever) | +1 / +2 / +2 / +3 by Act |
| Daily wheel | 1–5 |
| Rewarded ad | +3 |

The first-clear bonus is keyed off a `cleared` map in `gtb.progress.v1`, not
off `highest`. Two reasons: `highest` stops at the last level index so it can
never register the finale as cleared, and the finale pays the most; and a map
is what makes "once, ever" literally true, so a cleared level cannot be farmed
for balls — grinding one now strictly *drains* the tank, since the drop costs
and the bonus does not come again. Saves from before it existed are migrated on
load: reaching level N proves every level below it was cleared.

### Balance note — this economy is structurally draining

Worth knowing before launch. With one ball per drop, a level only pays for
itself if it is cleared in **as many drops as its bonus**: first try in Act 1,
within two in Acts 2–3, within three in Act 4. Anything slower is a net loss.

That is a demanding bar on the back half. Level 18 has a ±1.5° winning ramp
window and level 19 has no single-ramp solution at all (`node tests/levels.mjs
0 19`), so first- or second-try clears there are not realistic. A player who
takes three or four attempts per level runs the opening ten down inside Act 1
and lives on the wheel and the ad from then on.

That may be exactly the intent — it is what drives ad views. If it is not, the
levers, cheapest first: raise `STARTING_BALLS`, raise `CLEAR_BONUS`, or bring
back a timed refill (removed when spending moved to per-drop; it is a
self-contained addition).

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

## Portal compliance (CrazyGames)

Asserted in section 15-17 of the suite, because these are pass/fail gates on
the portal's side rather than matters of taste.

- **Safe area** — the container pads for `env(safe-area-inset-*)` on **all
  four** sides, not just the bottom. The App runs the game genuinely
  fullscreen, and in landscape the cutout is on a *side*. Needs
  `viewport-fit=cover`, which the meta tag sets.
- **800x450 to 1920x1080** — checked at both ends plus three sizes between:
  no overflow, nothing clipped, nothing under 11px. `.app` is capped at
  `max(430px, 52vh)` rather than a flat 430px, because a 3:5 board is always
  height-driven — the flat cap left a 1080p desktop showing a 428px board with
  1490px of empty screen. Under ~900px tall the cap never binds anyway.
- **High refresh rates** — the loop is a fixed-timestep accumulator, so frame
  rate cannot reach the physics. Verified rather than assumed: `rAF` is
  replaced with a queue the test pumps by hand, and ball position, velocity
  and collision count come out bit-identical from 60Hz to 240Hz, matching the
  headless simulator to the last decimal.
- **One click to gameplay** — it is zero. Boot goes straight to the player's
  current level with no title screen; the first-run tutorial is a mimed hint
  drawn on the board, not a gate. Keep it that way if a menu is ever added.
- **No custom fullscreen** — the game references no fullscreen API at all.
  The portal owns that control; adding one is prohibited.
- **Escape / Ctrl+W** — never `preventDefault`-ed, idle or mid-drag. There is
  exactly one keyboard listener in the game (audio unlock) and it takes no
  event argument, so it cannot block anything. Every `preventDefault` in the
  file is pointer, touch or iOS pinch-gesture.

### Audio and iOS

Audio is built (synthesised WebAudio, no files). The rule that matters:
**only a real user gesture may CONSTRUCT the AudioContext.** iOS treats
construction outside one as an autoplay attempt and can leave that context
unable to start for the life of the page — sound silently dead forever, with
nothing in the console to say why.

So `Sound.unlock()` is wired to trusted input events only. Everything that is
*not* a gesture — `pageshow`, `visibilitychange`, and the SFX calls that come
off the physics loop — goes through `Sound.nudge()`, which resumes a context
that already exists and never builds one. `pageshow` in particular fires on
the ordinary first load; wiring it to `unlock()` is what made the game build
and resume a context before any input, which is the bug section 17 caught.

`ctx.onstatechange` is how an iOS interruption (a call, the lock screen) is
noticed, and `navigator.audioSession = 'playback'` stops the ring/silent
switch muting the game.

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
