/* ============================================================
   COSMETICS - the main coin sink

   Ball skins, trail colours and ramp colours, in the toon /
   pastel style of the palette. PURELY VISUAL: nothing here is
   read by the physics, so no cosmetic can change a single bounce.

   `price: null` is CHEST-ONLY - never in the shop, handed out by
   every COSMETIC_EVERY-th star chest in CHEST_COSMETICS order.

   Ramp colours stay clear of red and of the obstacles' look: on
   this board red means "this bounces you off", and a ramp the
   player drew must never read as one.
   ============================================================ */
export type CosmeticKind = 'ball' | 'trail' | 'ramp';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** Coins in the shop, or null for one that cannot be bought. */
  price: number | null;
  /** Where a non-shop cosmetic comes from: a star chest, or clearing the
      Challenge Run of the world with this country id. */
  from?: 'chest' | { challenge: number };
  /** ball: [highlight, middle, edge]; trail: [colour] or 'rainbow';
      ramp: [fill]. */
  colors: string[];
}

export const COSMETICS: readonly Cosmetic[] = [
  // ---- balls ----
  { id: 'ball-classic', kind: 'ball', name: 'Classic', price: 0, colors: ['#ffffff', '#fff1b8', '#ffc53a'] },
  { id: 'ball-mint',    kind: 'ball', name: 'Mint',    price: 200, colors: ['#ffffff', '#d6fbe9', '#4fd1a0'] },
  { id: 'ball-peach',   kind: 'ball', name: 'Peach',   price: 300, colors: ['#ffffff', '#ffe1cf', '#ff9a6b'] },
  { id: 'ball-lilac',   kind: 'ball', name: 'Lilac',   price: 400, colors: ['#ffffff', '#ece0ff', '#a57cf0'] },
  { id: 'ball-sky',     kind: 'ball', name: 'Sky',     price: 600, colors: ['#ffffff', '#dcefff', '#4aa3ff'] },
  { id: 'ball-galaxy',  kind: 'ball', name: 'Galaxy',  price: null, from: 'chest', colors: ['#f4e9ff', '#9b7bff', '#3b2a8a'] },
  { id: 'ball-gold',    kind: 'ball', name: 'Gold',    price: 2000, colors: ['#fffbe6', '#ffd84a', '#c98a00'] },
  /* Challenge Run exclusives - one per twenty-city world, in its colours */
  { id: 'ball-verdant', kind: 'ball', name: 'Verdant', price: null, from: { challenge: 1 }, colors: ['#ffffff', '#c9f2b0', '#3fae3a'] },
  { id: 'ball-ember',   kind: 'ball', name: 'Ember',   price: null, from: { challenge: 6 }, colors: ['#fff4d6', '#ff9a4d', '#d2381e'] },
  { id: 'ball-gale',    kind: 'ball', name: 'Gale',    price: null, from: { challenge: 3 }, colors: ['#ffffff', '#c8f3e4', '#2fb584'] },
  { id: 'ball-storm',   kind: 'ball', name: 'Storm',   price: null, from: { challenge: 4 }, colors: ['#eef6ff', '#8fb0e8', '#34457a'] },
  { id: 'ball-pearl',   kind: 'ball', name: 'Pearl',   price: null, from: { challenge: 9 }, colors: ['#ffffff', '#e4f7f8', '#16aebf'] },
  // ---- trails ----
  { id: 'trail-classic', kind: 'trail', name: 'Classic', price: 0, colors: ['#ffb400'] },
  { id: 'trail-mint',    kind: 'trail', name: 'Mint',    price: 250, colors: ['#3fd6a4'] },
  { id: 'trail-candy',   kind: 'trail', name: 'Candy',   price: 350, colors: ['#ff6fb1'] },
  { id: 'trail-sky',     kind: 'trail', name: 'Sky',     price: 500, colors: ['#56a8ff'] },
  { id: 'trail-rainbow', kind: 'trail', name: 'Rainbow', price: null, from: 'chest', colors: ['rainbow'] },
  // ---- ramps ----
  { id: 'ramp-classic', kind: 'ramp', name: 'Classic', price: 0, colors: ['#1680f0'] },
  { id: 'ramp-mint',    kind: 'ramp', name: 'Mint',    price: 200, colors: ['#22b884'] },
  { id: 'ramp-grape',   kind: 'ramp', name: 'Grape',   price: 350, colors: ['#8a5cf0'] },
  { id: 'ramp-bubble',  kind: 'ramp', name: 'Bubblegum', price: 500, colors: ['#ff5fa8'] },
  { id: 'ramp-gold',    kind: 'ramp', name: 'Gold',    price: null, from: 'chest', colors: ['#f0a80e'] },
];

export const DEFAULT_STYLE: Record<CosmeticKind, string> = {
  ball: 'ball-classic', trail: 'trail-classic', ramp: 'ramp-classic',
};

/** Chest-only cosmetics, in the order the chests hand them out. */
export const CHEST_COSMETICS: readonly string[] = ['ball-galaxy', 'trail-rainbow', 'ramp-gold'];

export const cosmeticById = (id: string): Cosmetic | undefined => COSMETICS.find(c => c.id === id);

/** The skin a world's Challenge Run awards, by country id. */
export const challengeSkin = (countryId: number): string | undefined =>
  COSMETICS.find(c => typeof c.from === 'object' && c.from.challenge === countryId)?.id;

/* ============================================================
   THE ACTIVE STYLE

   What the renderer paints with right now. A plain module-level
   object rather than render state: it changes only when the
   player picks something in the shop, and `version` lets the
   renderer drop its cached ball gradients when it does.
   ============================================================ */
export const activeStyle = {
  ball: ['#ffffff', '#fff1b8', '#ffc53a'],
  trail: ['#ffb400'],
  ramp: '#1680f0',
  version: 0,
};

export function applyStyle(sel: Record<CosmeticKind, string>): void {
  const pick = (k: CosmeticKind) => (cosmeticById(sel[k]) ?? cosmeticById(DEFAULT_STYLE[k]))!;
  activeStyle.ball = pick('ball').colors;
  activeStyle.trail = pick('trail').colors;
  activeStyle.ramp = pick('ramp').colors[0];
  activeStyle.version++;
}
