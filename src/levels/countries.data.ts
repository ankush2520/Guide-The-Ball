/* ============================================================
   COUNTRIES

   Ten countries spanning levels 1-150. Each owns a run of
   levels ("cities"), one mechanic, and one backdrop palette.
   Verdholm, Emberkeep, Windemere, Stormhold and Coralis Deep hold
   twenty cities each; the rest ten.

   The names are invented, inspired by real regions rather than
   naming any actual place.

   A country changes the BACKDROP and the chrome accent, and
   nothing else. The entity palette is the game's vocabulary:
   red still hurts, green is still the target, blue is still
   yours, in every country.

   `sky` runs top to bottom. A night sky ends near-black - the ball
   falls out of the light and into the dark. A DAY sky (light by
   luminance, see isLightSky) gets the toon treatment instead:
   sunlight from above, clouds rather than stars, and a vignette
   in its own colour. `wash` is the overhead light spill and the
   grid, used at low alpha. `accent` recolours the UI chrome.

   Every country is now a day sky. Verdholm was the prototype;
   the other nine follow it, each keeping its old hue as a
   pastel. Every stop is pale enough that the wall grey and the
   target's dark green still clear 3:1 on it (the test suite
   checks every day sky), which is why none of them go deeper.
   ============================================================ */
import type { Country } from './types';

/* RANGES ARE ASSIGNED IN SHIPPING ORDER, ids are not.

   `id` is the country's identity in the plan - Emberkeep is country 6 and
   always will be - but `from`/`to` are where it actually sits in the game as
   it stands today. Countries are not being built in plan order, and the
   player's level numbers have to run 1..N with no holes in them, so the two
   came apart the moment the third country shipped was number six.

   So the list below is ordered by from/to - the order the game is actually
   played in - and the ids run out of sequence down it. The five built
   countries hold 1-100; the five still to be authored queue up behind them,
   and each drops into the next free block as it lands. Countries 10
   (Needlecrest), 5 (Zunmara Ruins) and 8 (Neonaka) no longer exist:
   Windemere, Stormhold and Coralis Deep absorbed their blocks. */
export const COUNTRIES: Country[] = [
  /* Verdholm's levels are frozen and hand-designed. Its palette was the
     night navy the game's contrast was first tuned against; it is now the
     toon day sky, pale blue into lavender. The obstacle red, ramp blue,
     target's dark green and wall grey each clear 3:1 against all three stops
     (tightest: wall grey at 3.06:1 on the top stop), and the ink outline
     around every shape clears 11:1. */
  { id: 1, name: 'Verdholm', from: 1,   to: 20,  mechanic: 'ramps only - the fundamentals',
    sky: ['#d3edff', '#e4f3ff', '#f2ecff'], wash: '90,130,210', accent: '#ffb400' },

  /* ============================================================
     EMBERKEEP - twenty cities, levels 21-40

     The second TWENTY-level world, and the first country after
     Verdholm to be one. It absorbed Solmesa's ten, the boards
     that used to teach the spring; the spring itself now arrives
     at level 10 (RewardManager.SPRING_UNLOCK_LEVEL), ahead of
     Verdholm's own spring exam at 17-20.

     Rose-coral heat haze. Breakables are orange and fire is
     orange-red, so the sky stays PINK rather than orange to keep
     both readable against it - and pink is the one warm sky that
     does not compete with the flame's own near-white tip.

     The entity palette is untouched, as it is in every country:
     red still hurts, green is still the target, blue is still
     yours. Fire is inside the red family and is told apart by
     SHAPE and MOTION, never by hue alone - see FireObstacle.
     ============================================================ */
  { id: 6, name: 'Emberkeep', from: 21,  to: 40,  mechanic: 'fire - the hazard that ends the run',
    sky: ['#ffe4de', '#ffe9e2', '#fff3ea'], wash: '230,100,70', accent: '#ff5a2e' },

  /* ============================================================
     WINDEMERE - twenty cities, levels 41-60

     The third TWENTY-level world. It follows Emberkeep city for
     city - the same fire, breakable and obstacle mix, the same
     targets, the same oval-and-spring exam at 57-60 - with WIND
     on top: one constant zone early, two from 49, and two that
     oppose each other from 53. It absorbed Needlecrest, whose
     ten patrol boards were the old 41-50.

     Soft sage-mint - low chroma on purpose, because wind streaks
     are the thing that should be moving here.
     ============================================================ */
  { id: 3, name: 'Windemere', from: 41,  to: 60,  mechanic: 'wind + fire',
    sky: ['#d6f0e6', '#e5f6ee', '#f1faf5'], wash: '80,165,135', accent: '#2fb584' },

  /* ============================================================
     STORMHOLD - twenty cities, levels 61-80

     The fourth TWENTY-level world. It follows Emberkeep city for
     city - the same hazard counts (its fire turned to red
     obstacles: fire does not belong in the rain), the same
     targets, the same oval-and-spring exam at 77-80 - with a
     THUNDERSTORM on top: rain always falling, and lightning that
     strikes a fixed ring of points in a fixed order, over and
     over, knocking the ball off its line (levels/storm.ts). It
     absorbed Frostvale and Zunmara Ruins, the old 61-70 and 71-80.

     Frostvale's icy cyan into snow-white - a cold, wet sky, which
     the rain and the lightning's yellow both read clearly against.
     ============================================================ */
  { id: 4, name: 'Stormhold', from: 61,  to: 80,  mechanic: 'thunderstorm',
    sky: ['#d2f1f7', '#e3f7fa', '#f4fcfd'], wash: '90,180,215', accent: '#27b0e0' },

  /* ============================================================
     CORALIS DEEP - twenty cities, levels 81-100

     The fifth TWENTY-level world, and it is under water. It
     follows Emberkeep city for city - the same hazard counts
     (its fire turned to red obstacles: nothing burns down
     here), the same targets, the same oval-and-spring exam at
     97-100 - with EATER FISH on top: they swim the same wavy
     lane back and forth, forever, and swallow the ball on
     contact (levels/fish.ts). Background fish and bubbles are
     scenery. It absorbed Neonaka, and Nocturne Sands moved on
     to 101-110.

     Shallow-water turquoise, pushed bluer than Cascadia so the
     two never read alike.
     ============================================================ */
  { id: 9, name: 'Coralis Deep', from: 81, to: 100, mechanic: 'underwater - eater fish',
    sky: ['#cff3f3', '#dff8f6', '#effcfa'], wash: '40,175,185', accent: '#16aebf' },

  /* Periwinkle dusk over pale sand - a gold pickup star is the warmest,
     strongest thing on screen. */
  { id: 7, name: 'Nocturne Sands', from: 101, to: 110,  mechanic: 'collectible stars',
    sky: ['#e8e8fb', '#ece8f7', '#fbf0dc'], wash: '120,110,215', accent: '#7c6cf0' },

  /* Fresh leaf-green mist, kept greener than Coralis Deep. */
  { id: 11, name: 'Cascadia Falls', from: 111, to: 120, mechanic: 'long chained boards',
    sky: ['#d9f3dc', '#e7f8e6', '#f3fbef'], wash: '75,175,105', accent: '#35b865' },

  /* Brushed steel warming at the floor, with a single orange spark. Dense
     boards and few ramps, so the palette stays flat and lets the geometry
     carry it. */
  { id: 12, name: 'Ironvale', from: 121, to: 130, mechanic: 'high density, fewer ramps',
    sky: ['#e9eaec', '#eceef1', '#f6f1ea'], wash: '125,135,150', accent: '#ff7a2a' },

  /* Sunrise pink-lavender under a gold accent - the last country before the
     finale, and the only warm-on-cool pairing in the set. */
  { id: 13, name: 'Aerith Heights', from: 131, to: 140, mechanic: 'master combos',
    sky: ['#f7e4f7', '#f7e8f5', '#fff4ea'], wash: '195,125,205', accent: '#e0a82e' },

  /* Golden hour: the only all-gold sky, reserved so that arriving here looks
     like arriving somewhere. */
  { id: 14, name: 'The Zenith', from: 141, to: 150, mechanic: 'finale',
    sky: ['#fbecc4', '#fdf3d8', '#fffaee'], wash: '225,175,85', accent: '#eba800' },
];
