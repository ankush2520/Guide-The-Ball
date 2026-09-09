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

## Worlds and mechanics

The game is planned as 14 worlds of levels 1-150. **World 1 (levels 1-20) is
hand-designed and frozen** - the mechanics below are written so that a level
with none of them runs the identical code path, and the harness output for
world 1 is byte-for-byte what it was before they existed.

`WORLDS[]` gives each world a level range, a name and a theme. A theme
recolours the **backdrop and the chrome accent only**. The entity palette -
red obstacle, green target, blue ramp - is the game's vocabulary and never
changes: a player who learned that red hurts must not relearn it in world 6.

| Entity | Behaviour |
|---|---|
| `boosters` | On entry, sets velocity to a fixed angle and speed. Deterministic, unlike the red obstacles' scatter. Fires once per entry, and the chevron drawn on it is the exact heading you leave on. |
| `wind` | Rectangular, never moves. Constant acceleration while the ball's centre is inside; gone the instant it leaves. |
| `slippery` | Rectangular. Raises restitution to `SLIP_REST` for bounces resolved inside it. |
| `portals` | A pair of ends. Direction is preserved unless the exit states a `facing`. |
| `breakables` | Bounces exactly like an obstacle - same code - then is gone for the rest of the session. |
| `stars` | Pickups. Never touch the trajectory; the suite asserts a run is bit-identical with and without them. |

**`SPEED_CAP` is the universal clamp**, set at exactly `hypot(MAX_VX,
TERMINAL_VY)` - the fastest the base game can already go. That makes it a
*provable* no-op for world 1 (a bounce is lossy, so nothing there reaches it)
while stopping boosters and wind from compounding into speeds that tunnel
through ramps and destroy the constant-feel trajectory model.

Two ordering rules inside a substep are load-bearing: a portal fires on where
the ball *arrived*, before anything can bounce it back out; and a booster
fires *after* collisions, so it always wins the substep. A booster that can be
cancelled by the wall it is pushing you into is unreadable.

`npm run mech` runs the per-mechanic isolation tests on purpose-built boards.

### Generating a world

    node tools/genlevels.mjs 2            # dry run, report only
    node tools/genlevels.mjs 2 --write    # splice into index.html

Levels 21+ are semi-procedural: a per-world template produces candidates from
a seeded RNG, and **nothing reaches `index.html` until it has passed the same
solver sweep the original twenty were held to**, extended for the new
mechanics. A candidate must be winnable on all seven obstacle seeds, not
winnable by blind guessing, inside that slot's difficulty band, and *fair* -
the winning line may not depend on random obstacle bounces, which is the
level-20 lesson encoded as a gate. Only the boss level of each world is
shaped by hand (via its own branch in the template).

Because the solver must find ramps a booster or portal throws the ball
towards, it sweeps the whole board, not just the spawn column. `tests/levels.mjs`
still only sweeps the spawn column, so from world 2 on its "1-ramp band"
column often reads `none` for a level that is perfectly solvable - the
generator is the authoritative gate.

**What the "mechanic matters" gate does and does not prove.** It proves the
featured mechanic is unavoidable on the natural drop line (drop with no ramps
and the ball goes through it) and that a verified solution routes through it.
It does *not* prove no route exists around it - proving that negative needs an
exhaustive multi-ramp search of a stripped board, and at a workable budget it
rejected every candidate. A player finding a second solution is a puzzle game
working, not a defect.

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

Audited against
[docs.crazygames.com/requirements/quality](https://docs.crazygames.com/requirements/quality/).
The mechanical items are asserted in sections 15-17 of the suite; the rest are
judgement calls recorded here so they are not silently forgotten.

**Met and tested.** Onboarding lands the player straight in gameplay (zero
clicks) and is a mime drawn on the board rather than a splash screen; it is
skippable and never blocks play. Every button carries a label. Escape and
Ctrl/Cmd+W are never swallowed. No custom fullscreen control exists. Layout
holds from 800x450 to 1920x1080. Audio levels are consistent and the master bus
has headroom (worst case 0.86 of 1.0; the loudest single event is an obstacle
hit at 0.46 after the sfx gain, not the win arpeggio, whose notes decay too
fast to stack).

**"Buttons must not be sized to encourage ads."** The out-of-balls screen used
to put a glowing full-width ad button over a bare "Not now" text link - 1.5x
the area, heavier type. All three offers are now the same box, the same type
and the same height. If a purchase offer or a second ad placement is ever
added, keep them peers.

**Open, and not code problems:**

- *"Not easily confused with similar-named games."* **Guide the Ball** is a
  generic name on a portal with a lot of ball games. This is the most likely
  thing to come back from review. Worth deciding before submission.
- *"Frequently maintained and updated"* and *"major features should not change
  after submission"* - a release-cadence commitment, not a build task. The
  economy and the level set should settle before submitting.
- *No keyboard controls exist.* The game is pointer/touch only, which is
  allowed, and "control bindings should adapt to keyboard layout" is therefore
  moot. If keys are ever added, that requirement wakes up.
- *The legend and hint are hidden below 700px tall*, so a landscape phone gets
  no reference text. The board is meant to carry itself there (green ring =
  goal, red = danger) and the onboarding mime still runs, but it is a
  deliberate trade worth re-checking if the art changes.


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
