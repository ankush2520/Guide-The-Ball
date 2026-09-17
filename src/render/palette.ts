/* ============================================================
   THE TOON PALETTE - canvas side

   The board is painted in the same colours the chrome is, and
   these are the canvas's copy of the CSS tokens in game.css
   (:root). Change one, change the other.

   The triad is the game's vocabulary and does not move between
   countries: RED hurts, GREEN is the goal, BLUE is what the
   player placed. Each fill clears 3:1 against every stop of the
   light sky; the INK outline around it clears ~12:1, and that
   outline is what holds a shape against the board.
   ============================================================ */

/** The one pen. Every important shape is ringed in it. */
export const INK = '#2a2350';

export const OBSTACLE = { light: '#ff8a97', base: '#f0223f', dark: '#b3102a' };
export const TARGET   = { light: '#7fe39a', base: '#2fc95a', dark: '#17963d' };
export const RAMP     = { light: '#8fc8ff', base: '#1680f0', dark: '#0d5fb8' };
export const WALL     = { light: '#b4b9d4', base: '#7c83a8', dark: '#5b6188' };
/** The ball is white with a gold falloff - the legend still calls it white. */
export const BALL     = { hi: '#ffffff', mid: '#fff1b8', edge: '#ffc53a' };

/** Outline weight for a round shape of radius `r`, in board units. The board
    is 480 wide shown at ~270-400 CSS px, so 3 units is ~2-2.5 CSS px. */
export const outlineFor = (r: number): number => Math.max(2.5, Math.min(4.5, r * 0.12));

/** "r,g,b" of the backdrop's lightness decides which ambient layer is drawn. */
export function isLightSky(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
