/* ============================================================
   BACKDROP

   Everything static about a board: the sky gradient, the wash
   spilling in from above the ceiling, the grid and the vignette.
   Painted ONCE per resize into an offscreen canvas and blitted
   as a single image each frame - the vignette alone would be an
   expensive full-board gradient fill if it were done live.
   ============================================================ */
import { W, H } from '../physics/constants';
import type { World } from '../levels/types';

export class Backdrop {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { alpha: false })!;

  get image(): HTMLCanvasElement { return this.canvas; }

  /** Repaint for a world at a given device scale. */
  build(world: World, width: number, height: number, scale: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    const c = this.ctx;
    c.setTransform(scale, 0, 0, scale, 0, 0);

    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    world.sky[0]);
    g.addColorStop(0.55, world.sky[1]);
    g.addColorStop(1,    world.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* a cool wash spilling in from above the ceiling - the ball falls out of
       the light and into the dark, which is what sells the board as deep */
    const top = c.createRadialGradient(W * 0.5, -H * 0.10, 0, W * 0.5, -H * 0.10, H * 0.75);
    top.addColorStop(0, `rgba(${world.wash},.22)`);
    top.addColorStop(1, `rgba(${world.wash},0)`);
    c.fillStyle = top;
    c.fillRect(0, 0, W, H);

    // the grid fades out toward the floor rather than ruling the whole board
    c.lineWidth = 1;
    for (let y = 50; y < H; y += 50) {
      c.strokeStyle = `rgba(${world.wash},${(0.010 + 0.050 * (1 - y / H)).toFixed(4)})`;
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    }

    /* vignette: pulls the eye to the middle of the board and hides the fact
       that the gradient above has to end somewhere */
    const vig = c.createRadialGradient(W / 2, H * 0.46, H * 0.28,
                                       W / 2, H * 0.46, H * 0.80);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,.26)');
    vig.addColorStop(1,   'rgba(0,0,0,.60)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);
  }
}
