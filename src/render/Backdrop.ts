/* ============================================================
   BACKDROP

   Everything static about a board: the sky gradient, the wash
   spilling in from above the ceiling, the grid and the vignette.
   Painted ONCE per resize into an offscreen canvas and blitted
   as a single image each frame - the vignette alone would be an
   expensive full-board gradient fill if it were done live.
   ============================================================ */
import { H, BOARD } from '../physics/constants';
import type { Country } from '../levels/types';
import { isLightSky } from './palette';

export class Backdrop {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { alpha: false })!;

  get image(): HTMLCanvasElement { return this.canvas; }

  /* Painted in BOARD-width coordinates starting at 0, not in the design
     box's - the renderer blits it across the board's full x range, margins
     included, so the sky and the vignette have to reach the real edges. */
  /** Repaint for a country at a given device scale. */
  build(country: Country, width: number, height: number, scale: number): void {
    const W = BOARD.w;
    this.canvas.width = width;
    this.canvas.height = height;
    const c = this.ctx;
    c.setTransform(scale, 0, 0, scale, 0, 0);

    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    country.sky[0]);
    g.addColorStop(0.55, country.sky[1]);
    g.addColorStop(1,    country.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    const light = isLightSky(country.sky[1]);

    /* a wash spilling in from above the ceiling. On a night board it is the
       cool light the ball falls out of; on a day board it is plain sunlight,
       white, so the top of the board glows rather than tints. */
    const wash = light ? '255,255,255' : country.wash;
    const top = c.createRadialGradient(W * 0.5, -H * 0.10, 0, W * 0.5, -H * 0.10, H * 0.75);
    top.addColorStop(0, `rgba(${wash},${light ? '.70' : '.22'})`);
    top.addColorStop(1, `rgba(${wash},0)`);
    c.fillStyle = top;
    c.fillRect(0, 0, W, H);

    // the grid fades out toward the floor rather than ruling the whole board
    c.lineWidth = 1;
    for (let y = 50; y < H; y += 50) {
      c.strokeStyle = `rgba(${country.wash},${(0.010 + 0.050 * (1 - y / H)).toFixed(4)})`;
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    }

    /* vignette: pulls the eye to the middle of the board and hides the fact
       that the gradient above has to end somewhere. Black at 60% on a light
       sky just greys it, so a day board is framed in its own blue instead,
       and much more gently. */
    const vig = c.createRadialGradient(W / 2, H * 0.46, H * 0.28,
                                       W / 2, H * 0.46, H * 0.80);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.7, light ? `rgba(${country.wash},.10)` : 'rgba(0,0,0,.26)');
    vig.addColorStop(1,   light ? `rgba(${country.wash},.26)` : 'rgba(0,0,0,.60)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);
  }
}
