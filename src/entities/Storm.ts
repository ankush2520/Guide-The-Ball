import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { StormDef } from '../levels/types';
import { PLAY } from '../physics/constants';
import { strikeAt, stepsUntil, STORM_R, STRIKE_STEPS, WARN_STEPS } from '../levels/storm';

/* The lightning. Every strike point is always marked - a faint ring - so the
   player can learn the board; it FLICKERS for WARN_STEPS before it is hit,
   and then a bolt comes down into it. All of it is drawn off simT, the same
   step clock the physics strikes on, so what is seen is what hits. */
export class Storm extends Entity<StormDef> {
  readonly kind: EntityKind = 'storm';

  draw({ ctx, simT }: DrawContext): void {
    const lv = { storm: this.def };
    const live = strikeAt(lv, simT);
    ctx.save();

    // a flash over the whole board in the first moments of a strike
    if (live && live.age < 8) {
      ctx.fillStyle = `rgba(255,255,240,${0.28 * (1 - live.age / 8)})`;
      ctx.fillRect(PLAY.x0, PLAY.y0, PLAY.x1 - PLAY.x0, PLAY.y1 - PLAY.y0);
    }

    this.def.points.forEach((p, i) => {
      const until = stepsUntil(lv, i, simT);
      const warn = until > 0 && until <= WARN_STEPS ? 1 - until / WARN_STEPS : 0;
      // the ring, always there, brighter and flickering as the strike nears
      const flicker = warn > 0 ? 0.5 + 0.5 * Math.sin(simT * 1.6) : 0;
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(90,105,160,${0.35 + warn * 0.5 * flicker})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, STORM_R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (warn > 0) {
        ctx.fillStyle = `rgba(255,236,120,${0.10 + 0.25 * warn * flicker})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, STORM_R, 0, Math.PI * 2); ctx.fill();
      }
      // a small bolt glyph at the centre
      ctx.fillStyle = `rgba(90,105,160,${0.55 + warn * 0.4})`;
      glyph(ctx, p.x, p.y, 7);
    });

    if (live) {
      const k = 1 - live.age / STRIKE_STEPS;
      const p = live.p;
      // the struck area
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, STORM_R);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
      g.addColorStop(0.5, `rgba(255,240,140,${0.55 * k})`);
      g.addColorStop(1, 'rgba(255,240,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, STORM_R, 0, Math.PI * 2); ctx.fill();
      // the bolt, from the top of the board down into the point - jagged the
      // same way for the whole strike, seeded by the strike itself
      let seed = live.key * 9301 + 49297;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const pts: [number, number][] = [];
      const top = PLAY.y0, steps = 9;
      for (let s = 0; s <= steps; s++) {
        const y = top + (p.y - top) * s / steps;
        const x = p.x + (s === steps ? 0 : (rnd() - 0.5) * 60 * (1 - s / steps) + (rnd() - 0.5) * 18);
        pts.push([x, y]);
      }
      for (const [w, col] of [[18, `rgba(255,240,150,${0.35 * k})`], [7, `rgba(255,255,255,${k})`]] as const) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function glyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y - s);
  ctx.lineTo(x - s * 0.6, y + s * 0.15);
  ctx.lineTo(x - s * 0.05, y + s * 0.15);
  ctx.lineTo(x - s * 0.3, y + s);
  ctx.lineTo(x + s * 0.6, y - s * 0.2);
  ctx.lineTo(x + s * 0.05, y - s * 0.2);
  ctx.closePath();
  ctx.fill();
}
