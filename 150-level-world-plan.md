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
| 5 | 51-60 | Zunmara Ruins | lost Incan/Mayan-style ruins | Portals |
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

## Mechanics
- **Boosters** — deterministic-direction speed bumper.
- **Wind zones** — static region, constant push while ball is inside. Windemere (country 3) uses a randomized variant: gust direction/strength vary by level instead of being fixed, for extra unpredictability within an otherwise solvable, deterministic-per-seed drop.
- **Slippery zones** — less speed lost on bounces inside.
- **Portals** — paired teleporters, direction preserved.
- **Breakable blocks** — obstacle that vanishes after first hit, stays broken for the session.
- **Collectible stars** — optional scoring pickups, no effect on win/lose.
- **Fire obstacles** (new, Emberkeep) — an instant-fail hazard, distinct from the standard red obstacle. The standard obstacle bounces the ball off in a random direction (a nuisance); a fire obstacle ends the drop as an immediate loss on contact, no bounce. Needs its own visual identity (flame/ember styling, not just a recolored red circle) so the player can tell "this one kills me" apart from "this one just deflects me" at a glance — critical since red is already the established danger color in this game, so the two hazard types need to read as different severities without breaking the existing red = danger convention.
- **Moving targets** (new, Needlecrest) — the target zone slides back and forth horizontally between two bounds at a fixed rate, rather than sitting still. Deliberately horizontal-only (not full 2D) so it stays a solvable timing puzzle rather than tipping into a reflex/luck mechanic — the player plans the ramp layout knowing the target's position is a function of elapsed drop time, same "plan then watch" contract as everything else in the game.

## Production approach (unchanged from before)
Semi-procedural: templates per country's featured mechanic, generated variations, auto-verified via the Playwright solver-sweep before being accepted into LEVELS[]. Only the closing "boss" level(s) per country are hand-tuned. Fire obstacles and moving targets both need solver-sweep coverage same as every other mechanic — an instant-fail hazard and a moving goalpost are exactly the kind of thing that can accidentally make a level unwinnable, so these two mechanics get the sweep treatment even more strictly than most.
