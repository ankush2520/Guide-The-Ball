import { Entity, type DrawContext, type EntityKind } from './Entity';
import type { PillarDef, PillarLook } from '../levels/types';
import { PILLAR_TOP } from '../levels/pillars';
import { INK, WALL } from '../render/palette';

/* ============================================================
   THE PILLAR

   A column that hangs from above the board and stops short of
   the floor, so the only way past it is round its foot - the
   loop a world's exam boards are about. It is LEVEL STRUCTURE,
   like a wall: it does not scatter or hurt, it is simply in the
   way, and it is dressed in its world's own material so it
   reads as part of the place rather than a slab dropped on it.

   The vocabulary still holds: nothing here wears the obstacle's
   RED, the goal's GREEN or the player's BLUE - a tree's leaves
   are autumn gold, a reef's weed is violet.

   Drawn at the pillar's full width; the physics insets its
   segments by the wall half-thickness so the ball meets exactly
   this edge (see levels/pillars.ts).
   ============================================================ */

interface Mat { top: string; bottom: string; line: string; }
const MATS: Record<PillarLook, Mat> = {
  tree:   { top: '#c68a50', bottom: '#8d5a2e', line: 'rgba(92,52,20,.55)' },
  basalt: { top: '#5d4f58', bottom: '#352b33', line: 'rgba(20,14,20,.55)' },
  mint:   { top: '#d9efe4', bottom: '#94c7ae', line: 'rgba(60,120,95,.45)' },
  slate:  { top: '#7a7598', bottom: '#4a4667', line: 'rgba(28,24,48,.5)' },
  coral:  { top: '#ffab98', bottom: '#dc6f86', line: 'rgba(150,50,80,.4)' },
  stone:  { top: WALL.light, bottom: WALL.dark, line: 'rgba(42,35,80,.35)' },
};

/** The column's outline: straight sides from far above, a round foot. */
function body(ctx: CanvasRenderingContext2D, x: number, bottom: number, w: number): void {
  const hw = w / 2, cy = bottom - hw;
  ctx.beginPath();
  ctx.moveTo(x - hw, PILLAR_TOP);
  ctx.lineTo(x - hw, cy);
  ctx.arc(x, cy, hw, Math.PI, 0, true);
  ctx.lineTo(x + hw, PILLAR_TOP);
  ctx.closePath();
}

/** A cheap repeatable wobble, so textures sit still frame to frame. */
const wob = (n: number): number => Math.sin(n * 12.9898) * 0.5 + Math.sin(n * 4.1414) * 0.5;

export class Pillar extends Entity<PillarDef> {
  readonly kind: EntityKind = 'pillar';

  draw({ ctx, clock }: DrawContext): void {
    const { x, bottom, w } = this.def;
    const look: PillarLook = this.def.look ?? 'stone';
    const m = MATS[look];
    const hw = w / 2;
    ctx.save();

    // the hard shadow seat, offset down like every other solid on the board
    ctx.save();
    ctx.translate(3, 6);
    ctx.fillStyle = 'rgba(42,35,80,.2)';
    body(ctx, x, bottom, w); ctx.fill();
    ctx.restore();

    // the material, lit from the left
    const g = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    g.addColorStop(0, m.top); g.addColorStop(1, m.bottom);
    ctx.fillStyle = g;
    body(ctx, x, bottom, w); ctx.fill();

    // everything inside the outline is clipped to it
    ctx.save();
    body(ctx, x, bottom, w); ctx.clip();
    this.texture(ctx, look, m, x, bottom, w, clock);
    // a soft highlight down the lit side, so it reads as round, not flat
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x - hw + 4, PILLAR_TOP, Math.max(3, w * 0.14), bottom - PILLAR_TOP);
    ctx.restore();

    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    body(ctx, x, bottom, w); ctx.stroke();

    this.dressing(ctx, look, x, bottom, w, clock);
    ctx.restore();
  }

  /** The surface pattern, inside the outline. */
  private texture(ctx: CanvasRenderingContext2D, look: PillarLook, m: Mat,
                  x: number, bottom: number, w: number, clock: number): void {
    const hw = w / 2;
    ctx.strokeStyle = m.line; ctx.lineWidth = 2; ctx.lineCap = 'round';
    switch (look) {
      case 'tree': {
        // bark: long wavy grooves running down the trunk
        for (let k = -1; k <= 1; k++) {
          const gx = x + k * hw * 0.45;
          ctx.beginPath(); ctx.moveTo(gx, -40);
          for (let y = -40; y < bottom - hw * 0.6; y += 24) ctx.lineTo(gx + wob(y + k * 7) * 3, y + 24);
          ctx.stroke();
        }
        // a couple of knots
        for (const f of [0.3, 0.68]) {
          const ky = bottom * f;
          ctx.beginPath(); ctx.ellipse(x + hw * 0.15, ky, 5, 8, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'basalt': {
        // stacked column joints, and thin cracks that glow like cooling lava
        for (let y = 0; y < bottom - 10; y += 64) {
          ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x - hw * 0.2, y + 8); ctx.lineTo(x + hw, y + 2); ctx.stroke();
        }
        const glow = 0.45 + 0.25 * Math.sin(clock * 2.2);
        ctx.strokeStyle = `rgba(255,170,70,${glow})`; ctx.lineWidth = 2.2;
        for (let y = 30; y < bottom - 30; y += 110) {
          ctx.beginPath(); ctx.moveTo(x - hw * 0.4, y);
          ctx.lineTo(x - hw * 0.1, y + 18); ctx.lineTo(x - hw * 0.3, y + 34); ctx.lineTo(x + hw * 0.05, y + 52);
          ctx.stroke();
        }
        break;
      }
      case 'mint': {
        // grooves the wind has carved across the stone
        for (let y = 10; y < bottom - 12; y += 38) {
          ctx.beginPath(); ctx.moveTo(x - hw, y + 6);
          ctx.quadraticCurveTo(x, y - 6, x + hw, y + 6); ctx.stroke();
        }
        break;
      }
      case 'slate': {
        // layered strata, and the wet streak rain leaves down one side
        for (let y = 0; y < bottom - 10; y += 30) {
          ctx.beginPath(); ctx.moveTo(x - hw, y + (y % 60 ? 3 : 0)); ctx.lineTo(x + hw, y); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,215,255,.16)';
        ctx.fillRect(x + hw * 0.25, PILLAR_TOP, 5, bottom - PILLAR_TOP);
        break;
      }
      case 'coral': {
        // the pores of a reef rock
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        for (let y = 8; y < bottom - 10; y += 22)
          for (let k = 0; k < 2; k++) {
            const px = x + (k ? 0.3 : -0.3) * hw + wob(y * 3 + k) * 4;
            ctx.beginPath(); ctx.arc(px, y + (k ? 11 : 0), 2.6, 0, Math.PI * 2); ctx.fill();
          }
        break;
      }
      default: {
        for (let y = 0; y < bottom - 10; y += 48) {
          ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x + hw, y); ctx.stroke();
        }
      }
    }
  }

  /** What grows on it, drips off it or drifts round it - outside the outline. */
  private dressing(ctx: CanvasRenderingContext2D, look: PillarLook,
                   x: number, bottom: number, w: number, clock: number): void {
    const hw = w / 2;
    switch (look) {
      case 'tree': {
        // two small branches with autumn leaves, and roots trailing off the foot
        const branch = (by: number, side: number) => {
          const bx = x + side * (hw - 2), ex = bx + side * 20, ey = by - 14;
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = '#9a6536'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
          const leaves: [number, number, string][] = [[4, -8, '#ffd23f'], [10, 2, '#ffb347'], [-2, 4, '#ff9f43'],
                                                     [12, -10, '#ff9f43'], [2, -2, '#ffc53a']];
          for (const [dx, dy, c] of leaves) {
            ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.ellipse(ex + side * dx, ey + dy, 8, 5, side * -0.6, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
          }
        };
        branch(bottom * 0.4, 1);
        branch(bottom * 0.72, -1);
        ctx.strokeStyle = '#8d5a2e'; ctx.lineWidth = 2.5;
        for (const k of [-0.45, 0, 0.45]) {
          const rx = x + k * hw;
          ctx.beginPath(); ctx.moveTo(rx, bottom - 3 - Math.abs(k) * 8);
          ctx.quadraticCurveTo(rx + k * 10, bottom + 8, rx + k * 16 + 2, bottom + 12); ctx.stroke();
        }
        break;
      }
      case 'basalt': {
        // an ember gathering at the tip
        const a = 0.35 + 0.25 * Math.sin(clock * 3);
        const eg = ctx.createRadialGradient(x, bottom, 1, x, bottom, 14);
        eg.addColorStop(0, `rgba(255,190,90,${a + 0.3})`); eg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(x, bottom, 14, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'mint': {
        // two little clouds drifting round it
        for (const [f, s] of [[0.3, 1], [0.72, -1]] as const) {
          const cy = bottom * f, cx = x + s * (hw + 4) + Math.sin(clock * 0.8 + f * 9) * 6;
          ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(42,35,80,.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx - 10, cy + 2, 8, 0, Math.PI * 2); ctx.arc(cx, cy - 3, 10, 0, Math.PI * 2);
          ctx.arc(cx + 11, cy + 2, 7, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'slate': {
        // rain gathering and dripping off the foot
        const t = (clock * 0.9) % 1;
        ctx.fillStyle = 'rgba(170,200,255,.85)'; ctx.strokeStyle = 'rgba(42,35,80,.5)'; ctx.lineWidth = 1;
        const dy = bottom + 4 + t * 26;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath(); ctx.ellipse(x, dy, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'coral': {
        // violet sea-weed swaying off one side, and a little anemone
        const sway = Math.sin(clock * 1.4) * 5;
        ctx.strokeStyle = '#8d5fd3'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        const sy = bottom * 0.5;
        ctx.beginPath(); ctx.moveTo(x - hw + 2, sy);
        ctx.quadraticCurveTo(x - hw - 14 + sway, sy + 18, x - hw - 8 + sway * 1.5, sy + 40); ctx.stroke();
        ctx.fillStyle = '#ffb347'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        const ay = bottom * 0.28;
        for (let k = 0; k < 4; k++) {
          const ang = -0.9 + k * 0.6;
          ctx.beginPath(); ctx.ellipse(x + hw + 5 + Math.cos(ang) * 6, ay + Math.sin(ang) * 6, 4, 2.5, ang, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      default: break;
    }
  }
}
