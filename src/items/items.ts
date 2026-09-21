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

export type ItemKind = 'spring';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  /** One line in the popup: what it does and how to handle it. */
  blurb: string;
}

export const ITEMS: readonly ItemDef[] = [
  { kind: 'spring', name: 'Spring',
    blurb: 'Fits onto a ramp YOU drew and makes it throw four times harder. ' +
           'Tap Use, then tap the ramp you want it on. ' +
           'Only spent if the ball bounces off it and you win.' },
];

/** The length the SOLVER draws with. A player's ramp is whatever length they
    drag, between MIN_RAMP and MAX_RAMP; this is the single canonical length
    the generator and the sweeps prove each board winnable at, so "this level
    has a solution" means one a hand-drawn ramp can match rather than one that
    needed a length only the machine could pick. See tools/genlevels.mjs. */
export const RAMP_LEN = 120;

/* ============================================================
   THE PLAYER'S SPRING - A RAMP THAT THROWS

   It used to be a BAR: a second piece of board that came out of
   the bag with its own fixed length, and what the player chose
   was where to put it and which way to lay it.

   The spring is not a piece of board at all. It goes ON A RAMP
   THE PLAYER ALREADY DREW, and multiplies what that ramp throws
   (see SPRING_GAIN). Everything the bar made the player decide a
   second time - a position, a length, an angle - was already
   decided when they drew the line; the spring adds the one thing
   a ramp cannot give, which is SPEED, and adds nothing else.

   Why that is the better item: every bounce in this game is
   lossy, so no amount of drawing can give the ball back speed it
   has lost. The spring answers a question ramps cannot - and by
   riding on the player's own line rather than bringing its own,
   it never competes with the expressive tool the way a second
   bar did.

   Its numbers live in physics/constants.ts with the mechanic
   they belong to - SPRING_GAIN, SPRING_CAP - and are re-exported
   here so the bag, the shop and the tray have one place to read
   the item from.
   ============================================================ */
export { SPRING_GAIN } from '../physics/constants';
