/* ============================================================
   HOW FAR EACH GLOW REACHES

   Some entities paint a soft bloom well past their physical
   edge, as a multiple of their radius. The bloom is scenery to
   the physics, but not to the eye: two fires whose bodies are
   30px apart can still read as one smear if their blooms cross.

   So these are the ONE place those multiples live. The entities
   draw with them, and the level tools (genlevels, genboxes,
   audit-spread) space objects with them - a glow cannot be
   widened here without the next regeneration giving it room.

   Obstacle and Breakable are absent on purpose: their only
   gradient is body shading inside `r`, so what you see ends at
   the rim.

   A leaf module with no imports, so node tooling can bundle it
   on its own.
   ============================================================ */

/** FireObstacle's heat haze, as a multiple of the fire's radius. */
export const FIRE_GLOW = 2.15;
/** The target's breathing halo, as a multiple of the target's radius. */
export const TARGET_GLOW = 1.5;
/** The mystery box's bloom, as a multiple of BOX_R. */
export const BOX_GLOW = 2.1;
/** Clear air left between two visible edges when either one glows. */
export const GLOW_PAD = 6;
