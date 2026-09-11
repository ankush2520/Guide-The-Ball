# Guide the Ball

A hyper-casual puzzle game. Place a limited number of ramps, then drop the ball
and watch whether your plan lands it in the target. Plan-first, not reflex-based.

**React + TypeScript, built with Vite.** Physics is **Matter.js**, behind a
pure simulation seam; see [Physics](#physics). `npm run build` emits a static
bundle in `dist/`, ready for CrazyGames / Poki / Softgames.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # static bundle in dist/
    npm test           # every suite: mechanics, board, UI, smoke
    npm run typecheck

## Deploying

The repo root `index.html` is the Vite **entry**, not the game: it points at
`/src/main.tsx`, which a browser cannot execute and which resolves off the
project sub-path anyway. Serving the repo root is a 404 — what gets published
is **`dist/`**.

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and
publishes it on every push to `main`. It needs the repository's Pages source
set to **GitHub Actions**:

    Settings -> Pages -> Build and deployment -> Source: GitHub Actions

`vite.config.ts` sets `base: './'`, so assets resolve relative to wherever the
page is served from — the build works unchanged at
`https://<user>.github.io/<repo>/`, at a domain root, or from a portal's own
sub-path. Nothing needs to know the repo name.

`dist/` stays out of git deliberately: a committed build goes stale silently,
and the workflow rebuilds it from source every time.

### Architecture

The game state lives in plain classes, not in React. React renders the chrome
and owns the panels; the board is a canvas driven by a fixed-timestep loop at
60Hz. Putting the ball's position in React state would re-render the tree sixty
times a second, so components subscribe to a version counter that only bumps
when something they actually show has changed.

    core/EventBus.ts      typed observer bus - managers publish, nothing calls back
    core/events.ts        the whole event vocabulary in one file
    physics/              Matter.js behind one interface; pure and silent
    entities/             one class per thing on a board + the factory
    managers/             LevelManager, RewardManager, GameController, storage
    render/               canvas painting, backdrop, tweens, particles, trail
    ui/                   React components
    levels/               level data, countries/cities, derived walls

Managers **emit** facts (`level:cleared`, `drop:ended`) and never name their
listeners. Entities are built by `EntityFactory` from a registry, so adding a
mechanic means writing one entity class and registering it — the render path
does not change.

## Countries and cities

The game is planned as **14 countries** spanning levels 1-150. Each country
owns a run of levels, one mechanic and one palette. Every level inside a
country is a **city**.

**Verdholm (levels 1-20) is hand-designed and frozen** - the mechanics below
are written so that a level with none of them runs the identical code path,
and the harness output for Verdholm is byte-for-byte what it was before they
existed. Its palette is frozen too: it is what the game's contrast was
originally tuned against.

`COUNTRIES[]` in [src/levels/countries.data.ts](src/levels/countries.data.ts)
gives each country a level range, a name, a mechanic and a palette. A country
recolours the **backdrop and the chrome accent only**. The entity palette -
red obstacle, green target, blue ramp - is the game's vocabulary and never
changes: a player who learned that red hurts must not relearn it in Neonaka.

The names are invented, inspired by real regions rather than naming any actual
place.

| # | Country | Levels | Mechanic | Backdrop |
|---|---|---|---|---|
| 1 | Verdholm | 1-20 | ramps only | the original navy — frozen |
| 2 | Solmesa | 21-30 | boosters | deep maroon into burnt orange |
| 3 | Windemere | 31-40 | wind zones | muted sage-teal |
| 4 | Frostvale | 41-50 | slippery zones | navy into ice-blue, whiter glow |
| 5 | Zunmara Ruins | 51-60 | portals | violet into gold |
| 6 | Emberkeep | 61-70 | breakable blocks | black into fiery red |
| 7 | Nocturne Sands | 71-80 | collectible stars | deep indigo-black |
| 8 | Neonaka | 81-90 | two mechanics combined | magenta-cyan, the most saturated |
| 9 | Coralis Deep | 91-100 | three mechanics combined | teal-turquoise |
| 10 | Needlecrest | 101-110 | precision spike | white-blue-grey, the cleanest |
| 11 | Cascadia Falls | 111-120 | long chained boards | deep green-blue |
| 12 | Ironvale | 121-130 | high density, fewer ramps | steel-grey, orange spark |
| 13 | Aerith Heights | 131-140 | master combos | soft lavender-gold |
| 14 | The Zenith | 141-150 | finale | cosmic black-gold-white |

Every entity clears a 3:1 contrast ratio against every country's backdrop; the
tightest is the red obstacle on Needlecrest at 3.68:1, which is the price of
that country being deliberately the lightest in the set.

### City names are derived, not written

A city's name is **country name + its position in that country**, in Roman
numerals - level 21 is `Solmesa I`, level 30 is `Solmesa X`. Nothing is
hardcoded per level, so all 150 cities are named without a naming pass.

Flavour names layer in later as a pure data change: set `city` on a level and
`cityOf()` returns it instead. Nothing else has to change.

    cityOf({ id: 23 })            // "Solmesa III"
    cityOf({ id: 23, city: 'Ashfall Reach' })   // "Ashfall Reach"

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
*provable* no-op for Verdholm (a bounce is lossy, so nothing there reaches it)
while stopping boosters and wind from compounding into speeds that tunnel
through ramps and destroy the constant-feel trajectory model.

Two ordering rules inside a substep are load-bearing: a portal fires on where
the ball *arrived*, before anything can bounce it back out; and a booster
fires *after* collisions, so it always wins the substep. A booster that can be
cancelled by the wall it is pushing you into is unreadable.

`npm run mech` runs the per-mechanic isolation tests on purpose-built boards.

### Teaching a mechanic

Two surfaces, because either one alone has a hole:

- **The legend is built per level** from what is actually on that board. A
  fixed list went stale the moment Solmesa added a booster to the game, and it
  was long enough that it was the first thing dropped when the window got
  short — so the one surface that could explain a booster was also the one
  most likely to be missing. Being per-level makes it shorter, so it now
  survives down to 620px of height instead of 700px.
- **The info panel** (*How to play*, behind the gear) is the reference: every entity with a
  full explanation, plus the controls, the balls economy and the level rating.
  Whatever is on the board you are currently looking at is flagged *on this
  level*. It replaced the legend that used to sit under the board — that
  duplicated the panel and cost the board a chunk of height.
- **First-sight tips.** Arriving at a board carrying a mechanic the player has
  never been told about flashes a one-line explanation, once, tracked in
  `tips` in the save. It fires on *arrival*, not on contact: the game is
  plan-first, so learning what a booster does by watching one fire is learning
  it a drop too late. The red obstacle keeps its on-contact tip, because
  "that scattered you randomly" only means anything once it has.

Tips must be short. The flash is one fixed-height line so that showing it can
never shift the board mid-drag, which means a long tip is silently truncated
with an ellipsis. Section 8b measures `scrollWidth` against `clientWidth` and
fails on any tip that does not fit — it caught the first draft of all six.

Both read from one `GLOSSARY[]` table, so a mechanic added there is explained
everywhere it needs to be. Section 8c asserts the panel flags exactly what
each level actually has.

### Modals

Every overlay — win card, level picker, out-of-balls, wheel, info — is
**viewport-level** (`position:fixed`), not a child of `.stage`. They used to
live inside the stage, which is sized to the board's 3:5 aspect: on a short
window that stage is barely 190px wide, so every card was cropped by it. The
info panel lost its heading and its Close button entirely.

`.card` is a flex column with `max-height:100%`; headings and button rows are
`flex:none` and the one long region per card carries `.scroll`. So a tall card
scrolls its middle instead of growing off the screen, at any window size.

Stacking is declared once, by id: picker 50, win 55, out-of-balls 60, settings
65, wheel 70, info 80. The wheel sitting above the out-of-balls screen is
deliberate — it is a way to get balls. Settings sits *below* the wheel and the
info panel for the same reason in reverse: it opens both, so closing either has
to land back on it rather than dismissing the pair. Note that a viewport-level
modal also covers the HUD, so the out-of-balls screen offers the wheel on the
card itself rather than relying on a topbar button being reachable behind it.

Card variants (`.infocard`, `.spincard`, `.setcard`) must be declared **after** `.card` in
the stylesheet. They are the same specificity, so declared earlier the base
rule silently wins — which is how the info panel shipped centre-aligned and
50px too narrow on its first run, and why the wheel card's width had never
taken effect at all.

The same trap caught the **size media queries**, which is why they are now the
last thing in the stylesheet. `@media (max-height:520px)` sat near the top,
above the `.hud`, `.hint`, `.iconbtn` and `button` rules it overrides; being no
more specific, almost everything it declared was dead. The block meant to
shrink the chrome on a landscape phone had never shrunk any of it. Anything
added there has to stay below the last base rule in the file.

### Generating a country

    node tools/genlevels.mjs 2            # dry run, report only
    node tools/genlevels.mjs 2 --write    # splice into src/levels/levels.data.ts

Levels 21+ are semi-procedural: a per-country template produces candidates from
a seeded RNG, and **nothing reaches the level data until it has passed the same
solver sweep the original twenty were held to**, extended for the new
mechanics. A candidate must be winnable on all seven obstacle seeds, not
winnable by blind guessing, inside that slot's difficulty band, and *fair* -
the winning line may not depend on random obstacle bounces, which is the
level-20 lesson encoded as a gate. Only the boss level of each country is
shaped by hand (via its own branch in the template).

Because the solver must find ramps a booster or portal throws the ball
towards, it sweeps the whole board, not just the spawn column. `tests/levels.mjs`
still only sweeps the spawn column, so from Solmesa on its "1-ramp band"
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

`RAW_LEVELS[]` in [src/levels/levels.data.ts](src/levels/levels.data.ts) holds
them: `id`, `name`, `maxBlocks`,
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
| First open, ever | 75 |
| First clear of a level (once, ever) | +1 / +2 / +2 / +3 by Act |
| Daily wheel | 5 or 10, on two of eight wedges |
| Rewarded ad | +3 |
| The shop | 2 coins each, unlimited |

The first-clear bonus is keyed off a `cleared` map in `gtb.progress.v1`, not
off `highest`. Two reasons: `highest` stops at the last level index so it can
never register the finale as cleared, and the finale pays the most; and a map
is what makes "once, ever" literally true, so a cleared level cannot be farmed
for balls — grinding one now strictly *drains* the tank, since the drop costs
and the bonus does not come again. Saves from before it existed are migrated on
load: reaching level N proves every level below it was cleared.

### Balance note — coins now absorb the drain

Worth knowing before launch. With one ball per drop, a level only pays for
itself if it is cleared in **as many drops as its bonus**: first try in Act 1,
within two in Acts 2–3, within three in Act 4. Anything slower is a net loss.

That is a demanding bar on the back half. Level 18 has a ±1.5° winning ramp
window and level 19 has no single-ramp solution at all (`node tests/levels.mjs
0 19`), so first- or second-try clears there are not realistic — every level
past the early Acts is a net drain.

The opening grant of 75 is what absorbs that. At three or four attempts a
level it covers roughly the first twenty levels on its own, so a new player
meets the whole of Verdholm before the economy ever asks them for anything.
After that the drain resumes and the wheel and the ad carry it.

**Coins are what closes that gap.** Every clear pays them — including replays,
at a quarter rate — and at 2 coins a ball a single three-star clear in Act 1
pays for ten drops. The drain is still real, but it is now a drain against an
income rather than against a fixed opening grant.

If it needs tuning, the levers, cheapest first: `COIN_CLEAR`, `BALL_PRICE`,
`STARTING_COINS`, then `STARTING_BALLS` / `CLEAR_BONUS`.

**The "Watch Ad" button is a placeholder** that grants the balls outright.
It is marked `TODO` in `src/ui/NoBallsPanel.tsx` and must be wired to the portal's rewarded
video (`CrazyGames.SDK.ad.requestAd('rewarded')` / `PokiSDK.rewardedBreak()`)
before submission — and the balls must only be granted if the player actually
watched.

**"Buy Balls" spends COINS, not money.** There is still no real-money purchase
path and no payment processor: web portals have no built-in purchase system the
way app stores do, and real money would need a processor *and* a player account
system, neither of which exist here. Check what CrazyGames and Poki actually
permit before building either.

## Coins, the shop and spare ramps

Coins are the hub currency, and the flow is **one-way**: clearing a level and
the wheel pay coins, coins buy balls and spare ramps, and nothing converts
back. That is what keeps the wallet legible — a coin is always worth exactly
what the shop says, and there is no arbitrage loop to balance.
`gtb.wallet.v1` holds `{coins, ramps}`, its own key rather than a field on the
progress blob for the same reason the ball tank has one: it is written
constantly, and a purchase must not have to rewrite the whole save.

| | |
|---|---|
| First open, ever | 100 coins |
| Ball | 2 coins |
| Spare ramp | 15 coins |

**What a clear pays** (`COIN_CLEAR`), by Act and by stars — playing well is
worth about double a scrape, and later Acts pay more because they cost more to
reach:

|  | 1★ | 2★ | 3★ |
|---|---|---|---|
| Act 1 | 10 | 14 | 20 |
| Act 2 | 14 | 18 | 24 |
| Act 3 | 18 | 22 | 28 |
| Act 4 | 22 | 26 | 32 |

Unlike the ball bonus, coins are paid on **every** clear. A replay of an
already-cleared level pays a quarter (minimum 2), which keeps a board you
enjoy worth returning to while leaving farming level 1 far worse than playing
on — 5 coins for a drop that cost a ball worth 2.

### Spare ramps

A level's own ramp budget is fixed and is **not** what a spare changes. The
budget in force is `level.maxBlocks + extraBudget`, where `extraBudget` is what
the player has spent on *this board*; `setLevel` resets it, because a spare is
bought into a board, not into the save.

The star for coming in under budget is judged against `levelBudget` — the
level's designed number — deliberately. If spares inflated that, fifteen coins
would buy a third star.

Spending is **explicit**: the Ramps chip in the HUD becomes a button when the
drawer has something in it, and one tap moves one ramp from drawer to board.
It is spent at the tap, not at the drop. The alternative — silently consuming
inventory as you draw past the budget — moves a balance the player did not ask
to move.

## Daily spin

One free spin every 24 hours. It pays **coins, balls or ramps** — the wedges
are, in order: 20 coins, 10 balls, 3 ramps, 150 coins, 5 balls, 1 ramp, 100
coins, 50 coins. `gtb.spin.v1` holds `{last, pending}`, where `pending` is now
`{kind, n}`; a bare number there is a debt recorded by the old balls-only
wheel and is still honoured on load (`tests/play.test.mjs` asserts it).

Weights total 100, so each reads as its own percentage. Wedges are only
comparable in coins (a ball is 2, a ramp is 15), which puts the wheel at about
**31 coins a day** — a level's takings. The two gilded jackpots, 150 and 100
coins, are 8% between them.

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

    index.html              Vite entry — a mount point, nothing else
    src/                    the game (see Architecture above)
    legacy/original-game.html   the pre-rewrite single-file build, kept for
                                reference
    tools/genlevels.mjs     semi-procedural generator + solver verification
    tools/harness.mjs       bundles the physics into a blank page, no server needed
    tests/mechanics.mjs     per-mechanic isolation tests
    tests/board.test.mjs    phone vs tablet board, over every level
    tests/play.test.mjs     UI, physics invariants, economy, portal compliance
    tests/smoke.test.mjs    end-to-end: boots, draws, drags a ramp, drops a ball
    tests/tune.mjs          physics tuning rig
    tests/levels.mjs        per-level design harness

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
- *The hint is hidden below 620px tall*, so a landscape phone gets
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
  no overflow, nothing clipped, nothing under 11px. The board is 3:5 and the
  column is height-driven, so the board's *width* is a result — leftover height
  times 0.6 — and sizing `.app` off the viewport instead only ever guesses at
  it. It guessed high, and the Drop row overhung the board it belonged to. So
  the chrome now matches a **measured** board: `GameCanvas` publishes the
  stage's resolved width as `--board-w`, and `.hud` / `.controls` / `.hint`
  take it. The dependency runs one way, so there is no layout loop. Below
  ~520px of height the board is narrower than three legible buttons, and there
  the chrome is allowed a 300px floor instead.
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

The game runs on **Matter.js**. Everything outside `src/physics/` talks to the
`PhysicsEngine` interface and never names a concrete simulator — that seam is
what keeps `simulate()` pure enough for the headless solver sweep.

    src/physics/PhysicsEngine.ts        the seam
    src/physics/matter/MatterEngine.ts  Matter.js
    src/physics/engines.ts              the factory

### Matter.js

Matter owns collision detection, contact resolution and integration. Gravity is
**calibrated, not guessed**: Matter's per-step acceleration is
`gravity.y × gravity.scale × delta²`, so at a 1/60s delta a scale of `0.00135`
gives a fall of 0.375 px/step² exactly.

Matter has no terminal velocity, no speed cap, no minimum bounce and **no
continuous collision detection**. Left raw, the ball accelerates without limit
and, past ~13.5px of travel per frame, passes straight *through* a 9px ramp —
there is no contact to resolve. So a few guards sit on top and default on
(`MATTER_TUNED`); set them all to `null` (`MATTER_PURE`) for unguarded Matter
and expect tunnelling. `window.__gtb.simulatePureMatter()` runs a drop that way
if you want to measure the difference rather than argue about it.

Two rules are layered on deliberately, because they are **game mechanics rather
than physics**: the obstacle scatter (the glossary promises "a mirror
reflection plus bounded scatter", and the player plans around it), and the
graze rule — Matter reports a contact for as long as shapes overlap, so a ball
already travelling *away* from a surface keeps generating pairs. Those are not
impacts, and treating them as such aimed bounces back into the obstacle they
had just left.

### Two board shapes

The design box is **480x800 (3:5)** — a phone — and every level is authored in
those coordinates. A tablet or a desktop is not a phone, and on one the board
was a narrow strip down the middle of the window, so there the board is
**600x800 (3:4)**: the level content stays exactly where it was authored and
the board extends 60px past the box on each side.

    src/physics/constants.ts   BOARD.pad / .w / .x0 / .x1, and setBoardPad()
    src/core/GameContext.tsx   TABLET — which profile a viewport gets
    src/ui/GameCanvas.tsx      sizes the stage from BOARD.w / H

The profile is chosen from the viewport's **shorter side** (`min(vw,vh) >=
640`), which is what makes it survive a rotation: an iPad is over the
threshold both ways round and a phone is under it both ways round, so neither
ever changes shape mid-level.

**This cannot unmake a solved level, and that is a gate rather than a claim.**
There are no side walls — the board's width reaches the simulation in exactly
one place, `isOutOfBounds`, where leaving sideways is a loss — so a wider board
can only postpone that. `npm run test:board` sweeps 245 ramp layouts across all
30 levels on three seeds under both profiles and asserts that **every layout
that wins on the phone board still wins on the tablet board, landing on the
same pixel.** 22,050 runs, 385 of them wins.

The margins are new room to draw ramps in, not new puzzle content: obstacles
and targets stay in the middle 480px until the levels are re-authored for the
wider board.

### Determinism

Everything random is driven by a seeded PRNG (`mulberry32`), so a drop replayed
with the same seed is byte-identical. That is what lets `tools/genlevels.mjs`
prove a level winnable headlessly and have the on-screen drop reproduce it, and
what `tests/mechanics.mjs` leans on when it asserts a trajectory is unchanged.

### The rule that matters

`step()` is pure — no sound, no particles, no events. It only **records** what
it touched (`ball.hit`, `ball.justBroke`, the counters) and `GameController`
reads those records to fire juice. That is what lets the solver sweep run
thousands of drops headlessly and silently.

Re-run `npm test` after touching any physics constant — a change there
invalidates the winnability proof for every level, and the sweep is what
catches it.
