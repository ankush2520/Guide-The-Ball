/* ============================================================
   THE VIEW

   How big the contents of the board are drawn, and the one
   place that converts between the two coordinate systems that
   follows from it.

   THE BOARD ITSELF DOES NOT MOVE. The canvas is still fitted to
   its slot exactly as it was, at the same size on a phone and on
   a desktop, and the sky, the wash and the vignette still reach
   its real edges. What VIEW_SCALE shrinks is everything INSIDE:
   the walls, the target, the obstacles, the pickups, the ball
   and the ramps the player draws - scaled together about the
   board's centre, so the scene keeps its shape and simply reads
   smaller, with more sky around it.

   It is a PRESENTATION dial and nothing else. The level is still
   authored, simulated and proved in the 480x800 design box; no
   physics constant, no level coordinate and no solver proof
   moves when this number does. Every gesture is mapped back
   through the same transform (see toBoard in GameCanvas), so a
   ramp still lands under the finger that drew it.

   Set it to 1 to get the board that shipped.
   ============================================================ */
import { H, BOARD } from '../physics/constants';

export const VIEW_SCALE = 0.78;

/* The pivot: the centre of the board, not of the design box, so the scene
   stays centred on a tablet's wider board as well as on a phone's. BOARD.pad
   is set at boot and can change with the viewport, so x is read live. */
const cx = (): number => (BOARD.x0 + BOARD.x1) / 2;
const cy = H / 2;

/** Design coords -> view coords: where a thing is actually painted. */
export const viewX = (x: number): number => cx() + (x - cx()) * VIEW_SCALE;
export const viewY = (y: number): number => cy + (y - cy) * VIEW_SCALE;

/** View coords -> design coords: what the player just pointed at. */
export const unviewX = (x: number): number => cx() + (x - cx()) / VIEW_SCALE;
export const unviewY = (y: number): number => cy + (y - cy) / VIEW_SCALE;
