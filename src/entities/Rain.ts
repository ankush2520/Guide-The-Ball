import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { StormDef } from '../levels/types';
import { PLAY } from '../physics/constants';

/* The rain on a storm level. Scenery only - it never touches the ball - so,
   unlike the lightning, it runs on the wall clock. Each drop's lane and phase
   are fixed from its index, so the sheet of rain looks the same on every
   device at the same moment. */
const DROPS = 140;
const FALL = 900;          // px per second
const SLANT = 0.22;        // sideways drift per px of fall

export class Rain extends Entity<StormDef> {
  readonly kind: EntityKind = 'rain';

  draw({ ctx, clock }: DrawContext): void {
    const x0 = PLAY.x0, x1 = PLAY.x1, y0 = PLAY.y0, y1 = PLAY.y1;
    const w = x1 - x0, h = y1 - y0;
    ctx.save();
    // a cool wash, so the board reads as under a storm cloud
    ctx.fillStyle = 'rgba(70,90,130,0.10)';
    ctx.fillRect(x0, y0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < DROPS; i++) {
      const u = frac(Math.sin(i * 12.9898) * 43758.5453);
      const v = frac(Math.sin(i * 78.233) * 12543.1234);
      const len = 10 + v * 14;
      const speed = FALL * (0.75 + v * 0.5);
      const y = y0 + ((v * h + clock * speed) % (h + len)) - len;
      const x = x0 + ((u * w + (y - y0) * SLANT) % w);
      ctx.strokeStyle = `rgba(95,120,170,${0.22 + v * 0.2})`;
      ctx.lineWidth = 1.2 + v * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * SLANT, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function frac(n: number): number { return n - Math.floor(n); }
