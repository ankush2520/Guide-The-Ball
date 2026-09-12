/* ============================================================
   COUNTRIES

   Fourteen countries spanning levels 1-150. Each owns a run of
   levels ("cities"), one mechanic, and one backdrop palette.

   The names are invented, inspired by real regions rather than
   naming any actual place.

   A country changes the BACKDROP and the chrome accent, and
   nothing else. The entity palette is the game's vocabulary:
   red still hurts, green is still the target, blue is still
   yours, in every country.

   `sky` runs top to bottom and always ends near-black - the ball
   falls out of the light and into the dark, which is what sells
   the board as deep. `wash` is the overhead light spill and the
   grid, used at low alpha. `accent` recolours the UI chrome.
   ============================================================ */
import type { Country } from './types';

/* RANGES ARE ASSIGNED IN SHIPPING ORDER, ids are not.

   `id` is the country's identity in the plan - Emberkeep is country 6 and
   always will be - but `from`/`to` are where it actually sits in the game as
   it stands today. Countries are not being built in plan order, and the
   player's level numbers have to run 1..N with no holes in them, so the two
   came apart the moment the third country shipped was number six.

   So the list below is ordered by from/to - the order the game is actually
   played in - and the ids run out of sequence down it. The four built
   countries hold 1-50; the ten still to be authored queue up behind them in
   plan order, and each drops into the next free block as it lands. */
export const COUNTRIES: Country[] = [
  /* Verdholm is frozen: hand-designed levels, and the palette the whole
     game's contrast was originally tuned against. */
  { id: 1, name: 'Verdholm', from: 1,   to: 20,  mechanic: 'ramps only - the fundamentals',
    sky: ['#1a2048', '#101433', '#06081a'], wash: '104,146,255', accent: '#ffc93c' },

  /* Deep maroon into burnt orange. The warmest accent in the early game, so
     a booster's green-cyan chevron still reads as the one cool thing on the
     board. */
  { id: 2, name: 'Solmesa', from: 21,  to: 30,  mechanic: 'boosters',
    sky: ['#5c1622', '#3a1a12', '#140805'], wash: '255,150,80',  accent: '#ff9a4d' },

  /* Near-black with fire above it. Breakables are already orange, so the
     country leans red to keep them distinguishable. */
  { id: 6, name: 'Emberkeep', from: 31,  to: 40,  mechanic: 'breakable blocks + fire',
    sky: ['#4a1008', '#280a06', '#0a0202'], wash: '255,110,60',  accent: '#ff6a3a' },

  /* Crisp white-blue-grey, and the cleanest board in the game by design: a
     precision country should have the least to look at. */
  { id: 10, name: 'Needlecrest', from: 41,  to: 50, mechanic: 'precision spike + moving targets',
    sky: ['#33404f', '#212b36', '#0b0f14'], wash: '215,230,245', accent: '#dbe7f5' },

  /* Muted sage-teal - low chroma on purpose, because wind streaks are the
     thing that should be moving here. */
  { id: 3, name: 'Windemere', from: 51,  to: 60,  mechanic: 'wind zones',
    sky: ['#243a35', '#16241f', '#070d0b'], wash: '150,200,180', accent: '#9fd8bf' },

  /* Navy into ice-blue with a whiter wash, so a slippery sheet reads as part
     of the country rather than an object dropped onto it. */
  { id: 4, name: 'Frostvale', from: 61,  to: 70,  mechanic: 'slippery zones',
    sky: ['#152e4e', '#0e2036', '#040a14'], wash: '200,235,255', accent: '#dff2ff' },

  /* Violet backdrop, gold accent: the two-colour split is the point, because
     portals come in pairs. */
  { id: 5, name: 'Zunmara Ruins', from: 71,  to: 80,  mechanic: 'portals',
    sky: ['#3a1f5c', '#33253a', '#0c0714'], wash: '230,190,255', accent: '#ffd479' },

  /* Deep indigo-black - the darkest country, so a gold pickup star is the
     brightest thing on screen. */
  { id: 7, name: 'Nocturne Sands', from: 81,  to: 90,  mechanic: 'collectible stars',
    sky: ['#1e1a44', '#131029', '#05040f'], wash: '150,140,255', accent: '#b0a6ff' },

  /* Magenta into cyan: deliberately the most saturated palette in the game,
     and the moment two mechanics start combining. */
  { id: 8, name: 'Neonaka', from: 91,  to: 100,  mechanic: 'two mechanics combined',
    sky: ['#450f52', '#1a1442', '#07040f'], wash: '255,70,220',  accent: '#3ff0ff' },

  /* Teal-turquoise, pushed bluer than Cascadia so the two never read alike. */
  { id: 9, name: 'Coralis Deep', from: 101, to: 110, mechanic: 'three mechanics combined',
    sky: ['#0b333f', '#072430', '#020c11'], wash: '70,220,235',  accent: '#3fdcea' },

  /* Deep green-blue, kept greener than Coralis Deep. */
  { id: 11, name: 'Cascadia Falls', from: 111, to: 120, mechanic: 'long chained boards',
    sky: ['#153d33', '#0d2724', '#040e0c'], wash: '120,225,170', accent: '#77e0a8' },

  /* Steel-grey with a single orange spark. Dense boards and few ramps, so
     the palette stays flat and lets the geometry carry it. */
  { id: 12, name: 'Ironvale', from: 121, to: 130, mechanic: 'high density, fewer ramps',
    sky: ['#3a4048', '#252a31', '#0a0c0f'], wash: '180,195,210', accent: '#ff8a3c' },

  /* Soft lavender under a gold accent - the last country before the finale,
     and the only warm-on-cool pairing in the set. */
  { id: 13, name: 'Aerith Heights', from: 131, to: 140, mechanic: 'master combos',
    sky: ['#3a3055', '#272038', '#0b0814'], wash: '205,190,255', accent: '#f2d48a' },

  /* Cosmic black, gold and white. Reserved: nothing else in the game uses a
     near-neutral dark with a pure gold wash, so arriving here looks like
     arriving somewhere. */
  { id: 14, name: 'The Zenith', from: 141, to: 150, mechanic: 'finale',
    sky: ['#1c1a18', '#12100c', '#040303'], wash: '255,220,160', accent: '#ffe6b0' },
];
