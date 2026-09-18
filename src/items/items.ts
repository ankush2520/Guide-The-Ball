/* ============================================================
   ITEMS - what the bag holds

   Things the player OWNS and places from the inventory tray, as
   distinct from the ramp, which is not here and is not an item:
   a ramp is DRAWN, freehand, out of a per-level budget, in one
   drag that sets its position, length and angle together.

   That distinction is the whole input model. The ramp is the
   expressive tool and has no fixed shape; an item is a scarce
   owned thing with a fixed one, taken out of the bag and then
   positioned and aimed. Curved ramps, if they ever land, are
   items: a fixed shape you own, not a shape you draw.

   This table is the one place a new item is declared - a row
   here, a count and a placement in the controller, and nothing
   else changes.
   ============================================================ */

export type ItemKind = 'booster';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  /** One line in the popup: what it does and how to handle it. */
  blurb: string;
}

export const ITEMS: readonly ItemDef[] = [
  { kind: 'booster', name: 'Booster',
    blurb: 'Fires the ball along the arrow. Drag it to move, drag the arrow ' +
           'to aim. Only spent if it fires and you win.' },
];

/** The length the SOLVER draws with. A player's ramp is whatever length they
    drag, between MIN_RAMP and MAX_RAMP; this is the single canonical length
    the generator and the sweeps prove each board winnable at, so "this level
    has a solution" means one a hand-drawn ramp can match rather than one that
    needed a length only the machine could pick. See tools/genlevels.mjs. */
export const RAMP_LEN = 120;

/* ============================================================
   THE PLAYER'S BOOSTER

   One size and one speed, exactly like the ramp's one length.
   What the player chooses is where it goes and which way it
   points - which is the whole item, and is why a booster can be
   a puzzle piece rather than a difficulty slider.

   Both numbers sit inside the range the authored Solmesa
   boosters already use (r 28-34, speed 9.5-12.4), so a placed
   booster behaves like one the level came with: identical
   physics, identical feel, nothing new to learn. */
export const BOOSTER_R = 30;
export const BOOSTER_SPEED = 11.5;
/** Where it points when it first lands: straight down the board, so it is
    obviously aimable and obviously not yet aimed. */
export const BOOSTER_ANGLE = 90;
