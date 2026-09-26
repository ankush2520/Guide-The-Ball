/**
 * The economy simulator - a PLANNING tool, not a test.
 *
 *   node tools/econsim.mjs                 # all three players, summary table
 *   node tools/econsim.mjs --player=typical --every=1   # one player, every level
 *
 * Walks a "typical", a "struggling" and a "skilled" player through every level
 * with the game's own numbers - imported from RewardManager, never copied - and
 * reports, per level: coins, springs and spare ramps held, what the wallet could
 * buy, and how often each ad offer would appear. Writes tools/out/econ.csv.
 *
 * FLAGS a level where a player would face a need-spring board with no spring,
 * and any point where more than COIN_HOARD unspent coins pile up (the shop is
 * not giving them anything worth buying).
 *
 * The players are MODELS - tries per level rising with the level's place in
 * its world, a chance of taking each optional ad, a habit of buying help. Tune
 * PLAYERS below to ask a different question. Seeded, so a run is repeatable.
 */
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await esbuild.build({
  stdin: { contents: `
    globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
    export * from './src/managers/RewardManager';
    export { LEVELS, countryOf } from './src/levels/index';
    export { COSMETICS } from './src/cosmetics/cosmetics';
    export { createGameBus } from './src/core/events';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  define: { 'import.meta.env': '{}' },
});
const G = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const COIN_HOARD = 1500;
/* How often the daily wheel comes round, in levels played - a player who does
   about this many levels a day gets one free spin per this many levels. */
const LEVELS_PER_DAY = 8;

/* ---- the players ---- */
const PLAYERS = {
  /* tries = base + slope * (position in world - 1), + world * perWorld; noise
     is +/- that many tries at random. The p* are chances of taking an offer. */
  typical:    { base: 1.4, slope: 0.12, perWorld: 0.5, noise: 1, pContinue: 0.5, pDouble: 0.4,
                pWheelAd: 0.4, pBox: 0.55, buysSpring: true, buysSpare: false, pSpareWhenStuck: 0.3 },
  struggling: { base: 2.2, slope: 0.20, perWorld: 0.8, noise: 2, pContinue: 0.7, pDouble: 0.6,
                pWheelAd: 0.6, pBox: 0.35, buysSpring: true, buysSpare: true, pSpareWhenStuck: 0.7 },
  skilled:    { base: 1.0, slope: 0.06, perWorld: 0.2, noise: 1, pContinue: 0.2, pDouble: 0.2,
                pWheelAd: 0.2, pBox: 0.8, buysSpring: true, buysSpare: false, pSpareWhenStuck: 0 },
};

function rng(seed){ return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pickW = (r, table) => { let x = r() * table.reduce((a, p) => a + p.w, 0);
  for (const p of table){ x -= p.w; if (x <= 0) return p; } return table[table.length - 1]; };

function simulate(name, P){
  const r = rng(0xC0FFEE + name.length * 7919);
  const rm = new G.RewardManager(G.createGameBus(), G.LEVELS.length);   // for chestContents
  const st = { coins: G.STARTING_COINS, springs: 0, ramps: 0, stars: 0, chests: 0, springUnlocked: false };
  const rows = [], flags = [];
  const cheapest = Math.min(...G.COSMETICS.filter(c => c.price).map(c => c.price));

  G.LEVELS.forEach((lv, idx) => {
    const country = G.countryOf(lv.id), pos = lv.id - country.from + 1;
    const world = G.worldOf(lv.id);
    const offers = { cont: 0, dbl: 0, spring: 0, stuck: 0, wheel: 0 };
    let adsWatched = 0;

    /* the spring gift, on first reaching the unlock level */
    if (!st.springUnlocked && lv.id >= G.SPRING_UNLOCK_LEVEL){ st.springUnlocked = true; st.springs += G.SPRING_GIFT; }
    rm.springGift = st.springUnlocked;

    /* a need-spring board: need one in the bag to have a chance */
    let springFlag = false;
    if (lv.needsSpring && st.springs <= 0){
      offers.spring++;
      if (P.buysSpring && st.coins >= G.SPRING_PRICE){ st.coins -= G.SPRING_PRICE; st.springs++; }
      else if (r() < 0.8){ st.springs++; adsWatched++; }                 // watches the spring ad
      else springFlag = true;
    }

    /* how many tries this board takes this player */
    const want = P.base + P.slope * (pos - 1) + P.perWorld * world + (r() * 2 - 1) * P.noise;
    let tries = Math.max(1, Math.round(want));
    /* spare ramp: bought/used when a board is going badly */
    let usedSpare = false;
    if (lv.id >= G.SPARE_FROM && tries >= 4 && r() < P.pSpareWhenStuck){
      if (st.ramps <= 0 && P.buysSpare && st.coins >= G.RAMP_PRICE){ st.coins -= G.RAMP_PRICE; st.ramps++; }
      if (st.ramps > 0){ usedSpare = true; tries = Math.max(1, tries - 2); }
    }

    /* the balls: every run of ballsFor() tries ends in continue (ad) or restart */
    const balls = G.ballsFor(lv.id);
    let left = balls, restarts = 0;
    for (let t = 1; t < tries; t++){
      left--;
      if (left <= 0){
        offers.cont++;
        if (r() < P.pContinue){ adsWatched++; left = G.CONTINUE_BALLS; }
        else { restarts++; left = balls; if (restarts === G.STUCK_AFTER_RESTARTS) offers.stuck++; }
      }
    }

    /* the win */
    if (usedSpare) st.ramps--;
    if (lv.needsSpring && st.springs > 0) st.springs--;
    const raw = G.starsFor(tries, lv.maxBlocks, lv.maxBlocks);
    const stars = usedSpare ? Math.min(raw, G.HELPED_MAX_STARS) : raw;
    st.stars += stars;
    let coins = G.coinsFor(lv.id, stars, true);
    offers.dbl++;
    if (r() < P.pDouble){ coins *= 2; adsWatched++; }
    st.coins += coins;

    /* the level's mystery box, and the gift in its target */
    const boxes = (lv.boxes ? lv.boxes.length : 0) + (lv.targetGift ? 1 : 0);
    for (let k = 0; k < boxes; k++){
      if (!lv.targetGift && r() > P.pBox) continue;
      const table = rm.boxTableFor(lv.id);
      const p = pickW(r, table);
      if (p.kind === 'coins') st.coins += p.n;
      else if (p.kind === 'ramps') st.ramps += p.n;
      else if (p.kind === 'springs') st.springs += p.n;
      else if (p.kind === 'spin') spin();
    }

    /* the daily wheel, and its once-a-day ad spin */
    function spin(){
      const p = pickW(r, G.SPIN_PRIZES);
      if (p.kind === 'coins') st.coins += p.n; else st.ramps += p.n;
    }
    if ((idx + 1) % LEVELS_PER_DAY === 0){
      spin();
      offers.wheel++;
      if (r() < P.pWheelAd){ spin(); adsWatched++; }
    }

    /* star chests */
    while (Math.floor(st.stars / G.STARS_PER_CHEST) > st.chests){
      st.chests++;
      const c = rm.chestContents(st.chests);
      st.coins += c.coins; st.springs += c.springs; st.ramps += c.ramps;
    }

    const row = { player: name, level: lv.id, world: world + 1, pos, tries, stars, restarts,
      coins: st.coins, springs: st.springs, ramps: st.ramps, chests: st.chests,
      canBuyRamps: G.bestBuy(G.RAMP_BUNDLES, st.coins), canBuySprings: G.bestBuy(G.SPRING_BUNDLES, st.coins),
      canBuyCosmetic: st.coins >= cheapest ? 'yes' : 'no',
      offerContinue: offers.cont, offerDouble: offers.dbl, offerSpring: offers.spring,
      offerStuck: offers.stuck, offerWheel: offers.wheel, adsWatched,
      flag: [springFlag ? 'NO SPRING' : '', st.coins > COIN_HOARD ? 'HOARD' : ''].filter(Boolean).join(' ') };
    if (springFlag) flags.push({ player: name, kind: 'NO SPRING', level: lv.id });
    if (st.coins > COIN_HOARD) flags.push({ player: name, kind: 'HOARD', level: lv.id, coins: st.coins });
    rows.push(row);
  });
  return { rows, flags };
}

/* ---- run ---- */
const only = (process.argv.find(a => a.startsWith('--player=')) || '').slice(9);
const every = Number((process.argv.find(a => a.startsWith('--every=')) || '--every=10').slice(8));
const all = [], flags = [];
for (const [name, P] of Object.entries(PLAYERS)){
  if (only && name !== only) continue;
  const res = simulate(name, P);
  all.push(...res.rows); flags.push(...res.flags);
  console.log(`\n=== ${name} ===`);
  console.log(' lvl  tries★  coins  spr  rmp  chest | could buy: ramps spr cosm | offers: cont dbl spr stuck | ads');
  for (const x of res.rows.filter(x => x.level % every === 0 || x.flag)){
    console.log(`${String(x.level).padStart(4)}  ${String(x.tries).padStart(3)} ${x.stars}  ${String(x.coins).padStart(5)} ${String(x.springs).padStart(4)} ${String(x.ramps).padStart(4)}  ${String(x.chests).padStart(4)}  |` +
      `  ${String(x.canBuyRamps).padStart(5)} ${String(x.canBuySprings).padStart(3)}  ${x.canBuyCosmetic.padStart(3)} |` +
      `  ${String(x.offerContinue).padStart(4)} ${String(x.offerDouble).padStart(3)} ${String(x.offerSpring).padStart(3)} ${String(x.offerStuck).padStart(5)} | ${String(x.adsWatched).padStart(3)}  ${x.flag}`);
  }
  const ads = res.rows.reduce((a, x) => a + x.adsWatched, 0), n = res.rows.length;
  console.log(`  totals: ${ads} ads over ${n} levels (${(ads / n).toFixed(2)}/level), ` +
              `${res.rows.reduce((a, x) => a + x.offerContinue, 0)} out-of-balls, ` +
              `final coins ${res.rows[n - 1].coins}, chests ${res.rows[n - 1].chests}`);
}
fs.mkdirSync(path.join(root, 'tools/out'), { recursive: true });
const cols = Object.keys(all[0]);
fs.writeFileSync(path.join(root, 'tools/out/econ.csv'),
  [cols.join(','), ...all.map(x => cols.map(c => x[c]).join(','))].join('\n') + '\n');
/* flags, grouped into runs of consecutive levels so a long hoard is one line */
const runs = [];
for (const f of flags){
  const last = runs[runs.length - 1];
  if (last && last.player === f.player && last.kind === f.kind && last.to === f.level - 1){
    last.to = f.level; last.peak = Math.max(last.peak, f.coins ?? 0);
  } else runs.push({ player: f.player, kind: f.kind, from: f.level, to: f.level, peak: f.coins ?? 0 });
}
console.log(`\nFLAGS:` + (runs.length ? '' : ' none'));
for (const x of runs)
  console.log(`  ${x.player.padEnd(10)} ${x.kind.padEnd(9)} levels ${x.from}${x.to > x.from ? '-' + x.to : ''}` +
              (x.kind === 'HOARD' ? ` (unspent coins up to ${x.peak})` : ''));
console.log('CSV: tools/out/econ.csv');
