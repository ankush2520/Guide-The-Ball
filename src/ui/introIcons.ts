/* ============================================================
   INTRO CARD ICONS

   The little picture on an intro card, drawn with the board's
   OWN drawing code wherever there is some - so the spring on
   the card is the spring the player will see on their ramp,
   not an illustration of one. Keyed by IntroCard.icon; a key
   with no drawing here simply shows no icon.
   ============================================================ */
import { drawSeg } from '../render/primitives';
import { drawSpring } from '../render/Spring';
import { RAMP_HT } from '../physics/constants';
import { RAMP_STYLE } from '../entities/Ramp';
import type { DrawContext } from '../entities/Entity';
import { Obstacle } from '../entities/Obstacle';
import { FireObstacle } from '../entities/FireObstacle';
import { Breakable } from '../entities/Breakable';
import { Target } from '../entities/Target';
import { MovingTarget } from '../entities/MovingTarget';
import { WindZone } from '../entities/WindZone';
import { Storm } from '../entities/Storm';
import { Fish } from '../entities/Fish';
import { Oval } from '../entities/Oval';
import { MysteryBox } from '../entities/MysteryBox';
import { StarPickup } from '../entities/StarPickup';
import { SlipperyZone } from '../entities/SlipperyZone';
import { Wall } from '../entities/Wall';
import { buildWalls } from '../levels/walls';
import type { RawLevel } from '../levels/types';
import { INK } from '../render/palette';

type Draw = (ctx: CanvasRenderingContext2D, clock: number) => void;

/* Every icon draws into a 120 x 80 box of board units; the card scales it. */
export const ICON_W = 120, ICON_H = 80;

/* A DrawContext good enough for an entity on a card: nothing broken, taken
   or opened, and the patrol / storm / fish clocks running on the card's own
   clock (60 steps a second, like the game). */
const TARGET = { x: 60, y: 40, r: 24 };
function g(ctx: CanvasRenderingContext2D, clock: number,
           level: Pick<RawLevel, 'target' | 'targetMove' | 'targetGift'> = { target: TARGET }): DrawContext {
  return { ctx, clock, simT: clock * 60, level, broken: [], got: [], gotBox: [], giftTaken: true };
}

const ICONS: Record<string, Draw> = {
  balls: (ctx) => {
    // two balls left, one used - the HUD's pips, big
    for (let i = 0; i < 3; i++) {
      const x = 30 + i * 30, y = 40, full = i < 2;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      if (full) {
        const gr = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 11);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#fff1b8'); gr.addColorStop(1, '#ffc53a');
        ctx.fillStyle = gr; ctx.fill();
      }
      ctx.lineWidth = 2.5; ctx.strokeStyle = full ? INK : '#b9b6cc'; ctx.stroke();
    }
  },
  obstacle: (ctx, c) => new Obstacle({ x: 60, y: 40, r: 24 }, 0).draw(g(ctx, c)),
  fire: (ctx, c) => new FireObstacle({ x: 60, y: 42, r: 22 }, 0).draw(g(ctx, c)),
  breakable: (ctx, c) => new Breakable({ x: 60, y: 40, r: 24 }, 0).draw(g(ctx, c)),
  movingTarget: (ctx, c) => {
    const lv = { target: { x: 30, y: 40, r: 20 }, targetMove: { x0: 30, x1: 90, period: 150 } };
    new MovingTarget(lv.target, 0).draw(g(ctx, c, lv));
  },
  wind: (ctx, c) => new WindZone({ x: 0, y: 8, w: 120, h: 64, ax: 0.7, look: 'air' }, 0).draw(g(ctx, c)),
  thunder: (ctx, c) => new Storm({ points: [{ x: 60, y: 44 }], gaps: [70] }, 0).draw(g(ctx, c)),
  fish: (ctx, c) => new Fish({ x0: 22, x1: 98, y: 40, amp: 8, period: 180, r: 15 }, 0).draw(g(ctx, c)),
  oval: (ctx, c) => new Oval({ x: 60, y: 40, rx: 50, ry: 24, angle: -15 }, 0).draw(g(ctx, c)),
  box: (ctx, c) => {
    const d = { ...g(ctx, c), gotBox: [false] };
    new MysteryBox({ x: 60, y: 42 }, 0).draw(d);
  },
  star: (ctx, c) => new StarPickup({ x: 60, y: 40 }, 0).draw({ ...g(ctx, c), got: [false] }),
  ice: (ctx, c) => new SlipperyZone({ x: 4, y: 14, w: 112, h: 52 }, 0).draw(g(ctx, c)),
  tricky: (ctx, c) => {
    const lv = { id: 0, name: '', maxBlocks: 1, targetType: 'POCKET' as const, wallSide: 'left' as const,
                 spawn: { x: 0, y: 0 }, target: { x: 64, y: 44, r: 18 } };
    new Target(lv.target, 0).draw(g(ctx, c, lv));
    buildWalls(lv, lv.target).forEach((w, i) => new Wall(w, i).draw(g(ctx, c)));
  },
  spareRamp: (ctx) => {
    drawSeg(ctx, { x1: 14, y1: 58, x2: 60, y2: 38 }, RAMP_HT, RAMP_STYLE);
    // the spare: the same ramp, drawn as the "one more" beside it
    ctx.save(); ctx.globalAlpha = 0.55;
    drawSeg(ctx, { x1: 66, y1: 36, x2: 108, y2: 22 }, RAMP_HT, RAMP_STYLE);
    ctx.restore();
    ctx.fillStyle = INK; ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('+1', 84, 66);
  },
  hint: (ctx) => {
    // the HUD's lightbulb, over a dashed ghost ramp
    ctx.save();
    ctx.setLineDash([8, 6]); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40,110,230,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, 66); ctx.lineTo(70, 50); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(74, 8); ctx.scale(2.2, 2.2);
    const bulb = new Path2D('M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z');
    ctx.fillStyle = '#ffd23f'; ctx.fill(bulb);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke(bulb);
    ctx.beginPath(); ctx.moveTo(9.5, 19); ctx.lineTo(14.5, 19); ctx.moveTo(10.2, 21.5); ctx.lineTo(13.8, 21.5); ctx.stroke();
    ctx.restore();
  },
  spring: (ctx, clock) => {
    const seg = { x1: 18, y1: 58, x2: 102, y2: 30, spring: true };
    drawSeg(ctx, seg, RAMP_HT, RAMP_STYLE);
    drawSpring(ctx, seg, clock);
  },
};

export function hasIcon(key: string): boolean { return key in ICONS; }

/** Draw icon `key` into a canvas of any size, fitted and centred. */
export function drawIntroIcon(key: string, cv: HTMLCanvasElement, clock: number): void {
  const draw = ICONS[key];
  const ctx = cv.getContext('2d');
  if (!ctx || !draw) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const k = Math.min(w / ICON_W, h / ICON_H) * dpr;
  ctx.setTransform(k, 0, 0, k, (cv.width - ICON_W * k) / 2, (cv.height - ICON_H * k) / 2);
  draw(ctx, clock);
}
