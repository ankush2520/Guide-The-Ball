# 150-Level Country Plan — Guide the Ball

Superseded naming: "worlds" are now "countries" (invented, inspired by real regions rather than literal real countries — keeps full creative freedom and avoids any risk of misrepresenting a real culture), levels within a country are "cities." Structure is otherwise unchanged from the original plan — no rework needed, it already matched what we landed on.

Country 1 (levels 1-20) is the original hand-designed plan, frozen. Countries 2-14 (13 x 10 = 130) extend it to 150 total, each introducing or combining new mechanics, each with its own visual reskin (recolored dark-neon theme + eventually an ambient music loop).

## Country table
| # | Levels | Country | Evokes | Mechanic focus |
|---|---|---|---|---|
| 1 | 1-20 | Verdholm | cozy alpine countryside | (existing — the learning arc) |
| 2 | 21-30 | Solmesa | sunbaked American Southwest mesa | Boosters |
| 3 | 31-40 | Windemere | windswept Mongolian/Patagonian steppe | Wind zones (randomized gusts — direction/strength vary per level, not just static push) |
| 4 | 41-50 | Frostvale | Nordic/Siberian tundra | Slippery zones |
| 5 | 51-60 | Zunmara Ruins | lost Incan/Mayan-style ruins | The gauntlet - dense obstacles |
| 6 | 61-70 | Emberkeep | Icelandic/Hawaiian volcanic fortress | Breakable blocks + **fire obstacles** (new — see below) |
| 7 | 71-80 | Nocturne Sands | starlit Saharan/Atacama desert | Collectible stars |
| 8 | 81-90 | Neonaka | Tokyo/Seoul-style neon city | Combine 2 mechanics |
| 9 | 91-100 | Coralis Deep | Pacific/Maldives coral realm | Combine 3 mechanics |
| 10 | 101-110 | Needlecrest | sharp Himalayan peaks | Precision spike + **moving targets** (new — see below) |
| 11 | 111-120 | Cascadia Falls | Iguazu/Victoria Falls canyons | Long chained boards |
| 12 | 121-130 | Ironvale | industrial forge city | High density, fewer ramps |
| 13 | 131-140 | Aerith Heights | floating Tibetan-style sky temples | Master combos |
| 14 | 141-150 | The Zenith | cosmic summit | Finale — level 150 is the true climax |

## City naming
Ordinals for now ("Solmesa I," "Solmesa II"...) — shippable immediately. Flavorful individual city names are a pure polish pass to layer in later once it's clear which levels are worth naming specially, no structural rework needed to add them.

## Music (deferred, hooks only for now)
Ambient loop + one accent sting per country, not full compositions — keeps file size reasonable against CrazyGames' fast-load requirements. Actual sourcing/creation happens whenever audio work is tackled on the roadmap; for now just wire up the per-country structure so it's a drop-in later.

## Booster economy (shipped)
The booster is both a level mechanic and a **player-owned item**, and the second half is what Solmesa unlocks. From level 21 it can be bought (30 coins, the ramp's table at twice the price) and placed on any board like a ramp: tap it out of the bag, drag to position, drag the knob on its nose to aim. One is given free the first time level 21 is reached, once ever. Before that the item does not exist anywhere — not in the bag, not in the shop, not in a mystery box's prize table — because a player meets a booster as furniture on the board first and only then as a thing they can own.

It is the one item **charged for only when it works**: placing costs nothing, missing costs nothing, and it leaves the bag only when the ball really fires through it and that drop wins. A spare ramp is the opposite (spent on placement) because what a ramp buys is a bigger budget whatever happens next, where a booster buys the solve.

Solmesa's closing board, level 30, **requires** one: its target sits at the height the ball is dropped from, right across the board, and a lossy bounce can never climb back there. Both halves of that — unsolvable by ramps, solvable by a booster — are swept in `tests/items.test.mjs` and gate the level shipping at all.

## Mystery boxes (shipped)
A chest on every one of the 150 levels, collected by touching it mid-drop. Scenery to the physics, exactly like a star, which is what made it safe to add to the frozen Verdholm twenty without re-verifying a solution. Placement is semi-procedural (`tools/genboxes.mjs`): a spot only qualifies if a traced drop actually reached it, and spots on the do-nothing drop line are rejected so collecting one is always a decision.

The reward is rolled at collection time from one weighted table — coins, balls, a spare ramp, a booster, or a free spin outside the daily cooldown — never authored per level. Boosters are removed from the table below level 21 rather than re-rolled. Each box is claimed once per level, for good, so the whole game's boxes are a fixed purse rather than an income.

## Mechanics
- **Boosters** — deterministic-direction speed bumper. Also a player-owned item from level 21; see Booster economy above.
- **Wind zones** — static region, constant push while ball is inside. Windemere (country 3) uses a randomized variant: gust direction/strength vary by level instead of being fixed, for extra unpredictability within an otherwise solvable, deterministic-per-seed drop.
- **Slippery zones** — less speed lost on bounces inside.
- **Breakable blocks** — obstacle that vanishes after first hit, stays broken for the session.
- **Collectible stars** — optional scoring pickups, no effect on win/lose.
- **Fire obstacles** (new, Emberkeep) — an instant-fail hazard, distinct from the standard red obstacle. The standard obstacle bounces the ball off in a random direction (a nuisance); a fire obstacle ends the drop as an immediate loss on contact, no bounce. Needs its own visual identity (flame/ember styling, not just a recolored red circle) so the player can tell "this one kills me" apart from "this one just deflects me" at a glance — critical since red is already the established danger color in this game, so the two hazard types need to read as different severities without breaking the existing red = danger convention.
- **Moving targets** (new, Needlecrest) — the target zone slides back and forth horizontally between two bounds at a fixed rate, rather than sitting still. Deliberately horizontal-only (not full 2D) so it stays a solvable timing puzzle rather than tipping into a reflex/luck mechanic — the player plans the ramp layout knowing the target's position is a function of elapsed drop time, same "plan then watch" contract as everything else in the game.

## Production approach (unchanged from before)
Semi-procedural: templates per country's featured mechanic, generated variations, auto-verified via the Playwright solver-sweep before being accepted into LEVELS[]. Only the closing "boss" level(s) per country are hand-tuned. Fire obstacles and moving targets both need solver-sweep coverage same as every other mechanic — an instant-fail hazard and a moving goalpost are exactly the kind of thing that can accidentally make a level unwinnable, so these two mechanics get the sweep treatment even more strictly than most.
