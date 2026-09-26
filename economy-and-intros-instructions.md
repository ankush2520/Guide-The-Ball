# Claude Code instructions: Economy rework + "New thing" intros

Project: Guide the Ball (React + TS + Vite + Matter.js)

Read these first; they are the files this work touches:
`src/managers/RewardManager.ts`, `src/managers/GameController.ts`, `src/managers/ProgressStore.ts`,
`src/items/items.ts`, `src/ui/NoBallsPanel.tsx`, `ShopPanel.tsx`, `SpinPanel.tsx`, `WinOverlay.tsx`,
`Hud.tsx`, `Coach.tsx`, `CoinFlight.tsx`, `InfoPanel.tsx`, `src/ui/glossary.ts`, `src/levels/types.ts`,
`src/levels/storm.ts`, `src/levels/fish.ts`.

Ground rules:
- Keep the existing code style: one source of truth per rule, and block comments that explain *why*.
- Every number below (prices, payouts, counts) lives in ONE constants block, so it can be retuned later
  without hunting. Treat the numbers as starting values.
- Do NOT change any level layout in `levels.data.ts` except the `needsSpring`-related unlock noted in Part C.
- Do not run test suites or solver sweeps. Ankush tests first himself.
- Work in the order of the Parts below. Commit after each Part with a clear message.

---

## Part A: Release blockers

**A1. Turn off the dev "unlock everything" switch.**
In `RewardManager.highest` getter, `return this.levelCount - 1;` is currently ACTIVE. Comment it out and
restore `return this._highest;`. Better: gate it behind `import.meta.env.DEV && localStorage 'gtb-unlock-all'`
so it can never ship switched on by accident.

**A2. Real ads, through one wrapper.**
Create `src/ads/Ads.ts`, the only file that talks to an ad SDK:
- `rewarded(placement: string): Promise<boolean>` resolves `true` ONLY if the player watched to the end.
  - CrazyGames SDK v3: `window.CrazyGames.SDK.ad.requestAd('rewarded', { adStarted, adFinished, adError })`
  - Poki: `PokiSDK.rewardedBreak()` (promise resolves with success boolean)
  - No SDK (own site ketugames.com / local dev): in dev, resolve `true` after a fake 1s delay; in production
    with no SDK, `available()` returns false and every ad button is hidden.
- `midgame(): Promise<void>` → CrazyGames `requestAd('midgame', …)` / Poki `PokiSDK.commercialBreak()`.
- `gameplayStart()` / `gameplayStop()` → the platform's gameplay events (call on drop/plan start and on
  pause, menus, ads).
- Mute all game audio in `adStarted` and restore it after, for both SDKs.
- Check the current CrazyGames and Poki SDK docs for exact names before wiring. Reward is granted ONLY on
  `true`.
- Every ad button is the SAME size and weight as the non-ad button beside it (existing CrazyGames rule
  already noted in `NoBallsPanel.tsx`).

**A3. Springs vs levels 17-20.** 17-20 are `needsSpring:true` but springs unlock at 21, so a real player
cannot finish 17. This is fixed by Part C (unlock moves to level 10).

---

## Part B: 3 balls per level (replaces the global ball tank)

**Remove the global ball economy completely:** `balls`, `STARTING_BALLS`, `AD_REWARD`, `CLEAR_BONUS`,
`BALL_PRICE`, `BALL_BUNDLES`, the ball section of the shop, ball wedges on the wheel, ball prizes in
`BOX_PRIZES`, and the `balls:changed` flow. Remove every ball-based reason in `BallChangeReason`.

**Save migration:** a player with an old save gets their leftover balls converted into coins at 1 coin per
ball, once, with a small "Balls are now free every level! +N coins" message. Then delete the balls key.

**New rule:**
- `ballsFor(level)`: 3 balls per level; 5 balls on positions 17-20 of every world (levels 17-20, 37-40,
  57-60, 77-80 …), computed from the level's position in its country, not hard-coded ids.
- HUD shows ball pips (●●○) for the current level.
- A drop that misses uses one ball. A win ends the level.
- `tries` (used for stars) counts every drop since ENTERING the level, across restarts and continues. It
  resets only when the player leaves the level.

**Out of balls → `OutOfBallsPanel`** (replaces `NoBallsPanel`), two equal buttons:
1. **"Watch ad: +3 balls (keep your ramps)"** → `Ads.rewarded('continue')`; on success refill 3 balls and
   keep all drawn ramps and springs exactly where they are.
2. **"Restart level"** → free and instant: clears drawn ramps, returns placed spring/spare ramp to the bag
   (they were not spent, see Parts C/D), refills balls.
- No midgame ad on restart. Failure must never be followed by a forced ad.
- If `Ads.available()` is false, only "Restart level" shows.

Replaying an already-cleared level follows the same 3-ball rule.

---

## Part C: Springs come early, and the player is TOLD

- `SPRING_UNLOCK_LEVEL = 10` (was 21). `SPRING_GIFT = 2` (was 1). Update every comment that says 21.
- **The gift moment** on first entry to level 10: before the board becomes playable, show a
  **"New power: Spring!"** card (see Part M style) with a spring illustration and the line
  *"Put it on a ramp you drew and the ball launches 4x harder. Only used up if you win."*
  Then 2 springs fly into the bag using `CoinFlight` (`kind: 'springs'`), with the bag icon bouncing
  and a "+2" label.
- Then a **Coach** walkthrough (reuse `Coach.tsx`): step 1 point at the bag "Tap Use", step 2 point at
  the player's ramp "Tap your ramp to put the spring on it". Skippable, shown once.
- Levels 17-20 keep `needsSpring`. Their every-visit flash stays; when the bag is empty add a button
  **"Watch ad: get 1 spring"** (`Ads.rewarded('spring')`) next to "Shop", equal size.
- Mystery boxes may drop springs from level 10 onward (`boxTableFor`). The daily wheel stays spring-free.
- A spring is still only charged when the drop that used it WINS (existing `spendSpring` rule).

---

## Part D: Spare (extra) ramps become a scarce rescue

- **Max 1 spare ramp per level.**
- **Not available on levels 1-5** (hide the spare-ramp control there).
- **Only spent on a win**, same rule as springs: placing one reserves it; restart, leaving the level, or
  removing it returns it to the bag. Change `useExtraRamp()` accordingly.
- **Using a spare ramp caps that clear at 2 stars.** Show it in the star note:
  *"Cleared with a spare ramp. Solve it without help for 3 stars."*
- Sources: shop, mystery boxes, daily wheel, star chests, and the "Stuck?" offer below.
- **"Stuck?" offer:** after the player has restarted the SAME level entry twice, show a small, dismissible
  strip: **"Stuck? [Hint (ad)] [Spare ramp (ad)]"**. Never shown earlier. Once per level entry.

---

## Part E: Hint (rewarded ad), using the solver's proven solution

- New tool `tools/genhints.mjs`: for every shipped level, use the existing harness/solver (as in
  `genlevels.mjs` verify) to find ONE winning plan (ramp segment(s), spring use if `needsSpring`, and the
  drop step for timed levels). Write them to a separate file `src/levels/hints.data.ts`
  (`Record<levelId, Hint>`). It must NOT modify `levels.data.ts`. Levels with no found plan get no entry.
- HUD gets a **lightbulb Hint button**. Tap → `Ads.rewarded('hint')` → draw the hint ramp(s) as a faint,
  dashed "ghost" for the rest of this level entry. On moving-target / fish / thunder levels also pulse the
  spawn point on the proven drop timing.
- The **first hint in the game is free** (teaches the feature). After that, ad each time.
- Using a hint caps that clear at 2 stars (same message style as Part D).
- Hide the button on levels with no hint entry.

---

## Part F: Coin rebalance (starting values; the simulator in Part L will tune them)

- **Pay by WORLD, not by the old 5-level act.** `COIN_CLEAR` indexed by `floor((id-1)/20)`, first clear
  only (`REPLAY_SHARE` stays 0):

  | World | 1★ | 2★ | 3★ |
  |---|---|---|---|
  | 1 (1-20) | 10 | 14 | 20 |
  | 2 (21-40) | 14 | 19 | 26 |
  | 3 (41-60) | 18 | 24 | 32 |
  | 4 (61-80) | 22 | 29 | 38 |
  | 5+ (81+) | 26 | 34 | 45 |

- **Prices:** `RAMP_PRICE = 40`, `SPRING_PRICE = 60`. Keep the bundle shape (1 / 4-for-3 / 14-for-10) and
  the divisibility rule so `bestBuy` stays exact.
- `STARTING_COINS` stays 100.
- **Mystery box table** (no balls now, weights total 100): coins 15 (w35), coins 35 (w22), ramp 1 (w18),
  spring 1 (w12, only if unlocked, else coins 15), free spin (w8), coins 80 (w5).
- **Wheel** (no balls now, weights total 100): coins 20 (w24), coins 40 (w22), coins 60 (w14),
  ramp 1 (w18), ramps 2 (w10), coins 100 (w7), coins 200 (w3 jackpot), ramps 3 (w2).

---

## Part G: More rewarded-ad moments (all optional, all equal-size buttons)

1. **Win screen: double coins.** `WinOverlay` shows two equal buttons: "Collect 26" and
   "Watch ad: collect 52". Only on first clears (replays pay 0).
2. **Daily wheel: spin again.** After the daily spin, once per day: "Watch ad: spin again".
3. **Spring on need-spring levels** (Part C), **continue** (Part B), **hint** (Part E),
   **spare ramp** (Part D).

Track which placement each ad came from (Part K).

---

## Part H: Star chests

- Every **30 stars** total unlocks a chest. Show a progress bar ("18 / 30 ★") on the level select screen
  and a small one on the win screen.
- Chest contents (fixed per chest number, not random, so it can't be farmed): coins 100-300 growing with
  chest number, plus 1 spring or 1-2 spare ramps, and every 3rd chest a cosmetic (Part I).
- Opening animation reuses the mystery-box / gift reveal. Claimed chests persist in the save.
- Stars are capped (max 3 per level), so this rewards replaying for 3 stars without being farmable.

---

## Part I: Cosmetics (the main coin sink)

- New "Style" tab in the shop: **ball skins** (6 to start), **trail colours** (4), **ramp colours** (4),
  all in the toon/pastel style of the current palette.
- Prices 200 to 2,000 coins; a few are **chest-only** (Part H).
- Purely visual; zero physics effect. Selected items persist in the save and apply in `Renderer`
  (ball, `Trail.ts`, ramp stroke).

---

## Part J: Midgame (interstitial) ads

- Only at natural breaks: when the player taps **Next** after a win, call `Ads.midgame()` and let the
  platform SDK throttle frequency.
- Never during play, never right after a fail or restart, never on the first 3 levels.
- Call `gameplayStop()` before and `gameplayStart()` after.

---

## Part K: Tracking

Create `src/analytics/track.ts` with one function `track(event, data)`. Events:
`level_start`, `ball_lost`, `level_restart`, `level_win` (stars, tries, usedSpareRamp, usedHint,
usedSpring), `ad_offer_shown` / `ad_watched` / `ad_failed` (with placement), `spring_used`,
`spare_ramp_used`, `hint_used`, `chest_opened`, `cosmetic_bought`, `session_end` (on `visibilitychange`).
For now: `console.debug` in dev + a capped ring buffer in localStorage (`gtb-events`, last 500) + a
`window.__gtb.events()` getter. Leave one clearly marked spot to forward events to a server later
(ketugames.com).

---

## Part L: Economy simulator (planning tool, not a test)

`tools/econsim.mjs`: simulates a "typical", a "struggling" and a "skilled" player through all levels
using the numbers from RewardManager (import them, don't copy). Assumed tries per level rise with level
position. Output a table per level (coins, springs, spare ramps held, what they could buy, how often
each ad offer would appear), plus a CSV at `tools/out/econ.csv`. Flag levels where a player would have
0 springs on a `needsSpring` level, or more than 1,500 unspent coins.

---

## Part M: "New thing" intro cards (every mechanic, every world)

Right now `MECH_TIPS` only shows a one-line flash for 2.6s, only ONE per level, and it is missing fire,
thunder, eater fish, moving target, oval, and springs. Replace it with proper intro cards.

**One registry.** Merge `MECH_TIPS` into `src/ui/glossary.ts` so each glossary entry also has:
`key`, `has(level)`, `title`, `intro` (max ~15 words, friendly toon tone), `icon` (small canvas or SVG
drawing of the thing using the entity's own draw code or colours), and `highlight(level)` returning the
board objects to pulse. The glossary's long text stays for the Info panel.

**Behaviour:**
- When a level loads and it contains a thing the player has never been introduced to, show an
  **intro card before the board is playable**: icon, title, one-line intro, "Got it" button.
- While the card is up, the matching objects on the board **pulse with a glow ring** so the player sees
  exactly which one it is.
- Several new things on one level → one card after another (small "1/2" dots).
- Once seen, persist in `tipsSeen`; never shown again automatically.
- The Info/"?" button reopens the cards for everything on the current board.
- Obstacle's existing on-contact tip can stay as a flash.
- Per-level facts (needs a spring, gift in target) stay as every-visit flashes, as now.
- **Dev guard:** in dev builds, log a console warning if a level contains an entity type that has no
  registry entry, so no future mechanic ships unexplained.
- Drop the `booster` tip if boosters no longer appear in any level.

**World intro card:** on first entry to a new world, a bigger card: world name, its palette, and
"New here: Wind + Fire" listing the new things (their individual cards follow when they appear).

**Card texts** (write each from what the code ACTUALLY does; adjust if behaviour differs):

| key | title | intro |
|---|---|---|
| balls | 3 balls per level | Miss them all? Restart the level, or watch an ad to keep going. |
| obstacle | Bumper | Knocks your ball off course. Same shot, same bounce. |
| breakable | Cracked bumper | Bounces your ball once, then shatters. |
| fire | Fire | Touch it and your drop is over. Steer well clear! |
| wind | Wind | Pushes your ball while it's inside. Streaks show which way. |
| thunder | Thunder | A spot flickers, then lightning strikes. Same rhythm every time, so time it! |
| fish | Eater fish | Swims the same wavy path. Touch it and your ball gets eaten! |
| movingTarget | Moving target | It's already moving. Time your drop to meet it. |
| oval | Giant rock | Too big to go through. Find the way around. |
| spring | New power: Spring! | Put it on your ramp to launch 4x harder. Only used if you win. |
| spareRamp | Spare ramp | One extra ramp for a stuck level. Max 2 stars when used. |
| hint | Hint | Shows one ramp that wins. Max 2 stars when used. |
| box | Mystery box | Hit it with the ball for a surprise reward! |
| star | Gold star | Optional pickup. Grab it if you can. |
| ice | Ice | Bounces here keep almost all their speed. |
| pocket / sideWall / narrowGap | Tricky target | This target can only be entered from one side. |

If thunder also breaks ramps (planned for World 4), the thunder card must say so:
"…and it breaks any ramp it hits."

---

## Part N: Challenge Run (build LAST, after everything above)

Optional mode per world, unlocked after clearing that world: play all 20 levels in a row with a shared
pool of 30 balls; running out restarts the WORLD. No hints, no spare ramps, no continue ads. Clearing it
awards an exclusive ball skin and a badge on the world card. Normal progress is never affected.

---

## Save data summary (ProgressStore)
Add: `migratedBalls`, `springUnlockSeen`, `freeHintUsed`, `chestsClaimed`, `cosmetics { owned, selected }`,
`wheelAdSpinDay`. Remove: balls key (after migration). Keep all existing keys working for old saves.
