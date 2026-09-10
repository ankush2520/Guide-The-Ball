/* Render-side constants. Re-exports the board geometry so the render layer
   never has to reach into physics for a number it only uses to draw. */
export { W, H, BALL_R, RAMP_HT, WALL_HT, MIN_RAMP } from '../physics/constants';

export const STEP_MS_DEFAULT = 1000 / 60;   // the fixed simulation tick
export const CAPTURE_MS = 620;          // length of the "swallowed" animation
