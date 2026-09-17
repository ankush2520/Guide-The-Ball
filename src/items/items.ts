/* ============================================================
   ITEMS

   What the inventory popup offers. A ramp is no longer drawn
   by hand: the player opens the inventory, taps an item, and it
   appears on the board ready to be moved and turned.

   This table is the one place a new kind of item is declared.
   Only the straight ramp exists today; curved ramps and
   placeable boosters are meant to join it as further rows, each
   with its own count and its own placement in the controller.

   Items have a FIXED size. A ramp can be moved and rotated but
   not stretched, which is what lets "short ramp", "long ramp"
   and "curved ramp" be different things to own rather than one
   thing drawn at different lengths.
   ============================================================ */

export type ItemKind = 'ramp';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  /** One line in the popup: what it does and how to handle it. */
  blurb: string;
}

export const ITEMS: readonly ItemDef[] = [
  { kind: 'ramp', name: 'Ramp',
    blurb: 'A straight ramp. Drag it to move, drag an end to turn it.' },
];

/** Every straight ramp is this long, in board units. The level generator
    proves each board winnable with ramps of exactly this length, and every
    one of the 150 levels solves with it - see tools/genlevels.mjs. */
export const RAMP_LEN = 120;
