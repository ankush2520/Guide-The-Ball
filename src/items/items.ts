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
  { kind: 'booster', name: 'Booster ramp',
    blurb: 'A ramp that FIRES you. Bounces the ball like any ramp, then throws ' +
           'it out about three and a half times faster. Drag it to move, drag ' +
           'the knob to turn it. ' +
           'Only spent if the ball hits it and you win.' },
];

/** The length the SOLVER draws with. A player's ramp is whatever length they
    drag, between MIN_RAMP and MAX_RAMP; this is the single canonical length
    the generator and the sweeps prove each board winnable at, so "this level
    has a solution" means one a hand-drawn ramp can match rather than one that
    needed a length only the machine could pick. See tools/genlevels.mjs. */
export const RAMP_LEN = 120;

/* ============================================================
   THE PLAYER'S BOOSTER - A RAMP THAT FIRES

   It used to be a disc with an arrow: you chose a spot and a
   heading, and the ball left along that heading at a fixed
   speed. It is a BAR now - the ramp's own silhouette, the ramp's
   own physics - and what it adds is speed rather than a heading:
   the ball mirrors off it exactly as it would off a ramp you
   drew, and leaves several times faster (see BOOST_RAMP_GAIN).

   Why the change is worth it: a heading is something a ramp
   already gives you, so the disc was a second way to do the
   thing the expressive tool does. Speed is something no ramp can
   give you at all - every bounce in the game is lossy - which
   makes this a piece that answers a question ramps cannot.

   One length and one thickness, exactly like the ramp's one
   solver length. What the player chooses is where it goes and
   which way it lies, and that is the whole item.

   Its numbers live in physics/constants.ts with the mechanic
   they belong to - BOOST_LEN, BOOST_HT, BOOST_RAMP_GAIN - and are
   re-exported here so the bag, the shop and the tray have one
   place to read the item from.
   ============================================================ */
export { BOOST_LEN, BOOST_HT, BOOST_RAMP_GAIN } from '../physics/constants';

/** Which way it lies when it first lands: flat across the board. Deliberately
    the one angle that cannot be a plan - a level horizon nobody would aim
    for - so the first thing the player does with it is turn it. */
export const BOOSTER_ANGLE = 0;
