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

type Draw = (ctx: CanvasRenderingContext2D, clock: number) => void;

/* Every icon draws into a 120 x 80 box of board units; the card scales it. */
export const ICON_W = 120, ICON_H = 80;

const ICONS: Record<string, Draw> = {
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
