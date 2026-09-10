/* ============================================================
   RENDERER

   Owns the canvas and paints one frame from a RenderState. It
   reads game state and never writes it - every mutation belongs
   to a manager - so a frame can be dropped or repeated without
   consequence.

   Entities draw THEMSELVES (see EntityFactory): this file walks
   a pre-sorted list and calls draw(), so adding a mechanic never
   touches the render path.
   ============================================================ */
import { W, H, BALL_R, RAMP_HT, STEP_MS_DEFAULT } from './constants';
import type { Level } from '../levels/types';
import type { Entity } from '../entities/Entity';
import { Target } from '../entities/Target';
import { Ramp } from '../entities/Ramp';
import { Backdrop } from './Backdrop';
import { drawStarfield } from './Starfield';
import { Trail } from './Trail';
import { ParticleSystem } from './Particles';
import { drawSeg, roundRect } from './primitives';
import type { Phase } from '../core/events';
import type { World, Segment } from '../levels/types';

export const MAX_SCALE = 2;

/** Where the demo drag is mimed on level 1: a plausible ramp, not the answer. */
export const TUT_A = { x: 148, y: 292 }, TUT_B = { x: 268, y: 366 };

/** The ball's impact deformation. `amt` is tweened by the game loop; nx/ny is
    the axis it is squashed along, which is whatever surface it just met. */
export interface Squash { amt: number; nx: number; ny: number; }

export interface CaptureState { t: number; bx: number; by: number; cx: number; cy: number; }

export interface RenderState {
  level: Level;
  world: World;
  entities: readonly Entity[];
  ramps: readonly Segment[];
  draft: Segment | null;
  selected: number;
  phase: Phase;
  clock: number;
  /** Interpolation: how far through the current physics step we are. */
  alpha: number;
  ball: { x: number; y: number; px: number; py: number } | null;
  broken: boolean[];
  got: boolean[];
  capture: CaptureState | null;
  captureMs: number;
  squash: Squash;
  deleteButtonAt: (s: Segment) => { x: number; y: number };
  handleR: number;
  delR: number;
  /** Step 1 of the tutorial mimes the drag that places a ramp. `t` is the
      glide's 0..1 progress, tweened by the controller. */
  tutorial: { step: number; t: number };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private scale = 1;
  private builtFor: World | null = null;

  readonly trail = new Trail();
  readonly particles = new ParticleSystem(STEP_MS_DEFAULT);
  /** Where the ball was actually painted this frame - the interpolated
      position, not the physics one. The suite asserts on this to prove the
      render really does run between two physics states. */
  readonly lastDraw = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    // give the element the right 3:5 intrinsic ratio before the first measure,
    // otherwise it lays out at the 300x150 canvas default for one frame
    canvas.width = W; canvas.height = H;
  }

  /* The board is only ever ~370 CSS px wide on a phone. Rendering it at
     480x800 logical times a 3x device ratio meant pushing 3.5M pixels -
     roughly fifteen times what the screen can show - through shadowBlur on
     every frame, which is exactly what made drawing a ramp stutter. Size the
     surface to what is actually on screen instead, capped at 2x. */
  resize(world: World): void {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_SCALE));
    const cssW = this.canvas.getBoundingClientRect().width || W;
    const px = Math.round(Math.min(Math.max(cssW * dpr, cssW), W * MAX_SCALE));
    if (px !== this.canvas.width) {
      this.canvas.width = px;
      this.canvas.height = Math.round(px * H / W);
      this.scale = this.canvas.width / W;
      this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.builtFor = null;
    }
    if (this.builtFor !== world) {
      this.backdrop.build(world, this.canvas.width, this.canvas.height, this.scale);
      this.builtFor = world;
    }
  }

  /** Force a backdrop repaint - call when the world changes. */
  invalidateBackdrop(): void { this.builtFor = null; }

  render(s: RenderState): void {
    const ctx = this.ctx;
    this.resize(s.world);

    ctx.drawImage(this.backdrop.image, 0, 0, W, H);
    drawStarfield(ctx, s.clock);

    const g = { ctx, clock: s.clock, broken: s.broken, got: s.got };

    /* Entities paint themselves in factory order: zones are ground, then the
       target, walls, obstacles, and the mechanics that sit with them. */
    for (const e of s.entities) {
      e.draw(g);
      /* the capture shockwave belongs to the target and must land directly
         over its well, before the walls go down on top */
      if (s.capture && e instanceof Target)
        e.drawCapture(ctx, s.capture.t / s.captureMs, s.capture.cx, s.capture.cy);
    }

    /* ramps - the player's own entities, drawn above the board furniture */
    for (const r of s.ramps) drawSeg(ctx, r, '#3ec8ff', RAMP_HT, 'rgba(62,200,255,.55)');
    if (s.draft) new Ramp(s.draft, -1).drawDraft(ctx);

    if (s.phase === 'plan' && s.selected >= 0 && s.selected < s.ramps.length)
      this.drawSelection(s, s.ramps[s.selected]);

    if (s.phase === 'plan') this.drawSpawnMarker(s.level);

    if (s.tutorial.step === 1) this.drawTutorialHand(s.tutorial.t);

    /* the comet behind the ball, then the impact sparks over it */
    this.trail.draw(ctx);
    this.particles.draw(ctx);

    this.drawBall(s);
  }

  /* the ramp being edited: a halo so it reads as picked out from the others,
     a grip at each end, and the delete button */
  private drawSelection(s: RenderState, seg: Segment): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = RAMP_HT * 2 + 12;
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    // dashed outline, so selection survives on top of a same-coloured ramp
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -(s.clock * 22) % 12;    // a slow crawl: it is "live"
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.setLineDash([]);

    const ends: [number, number][] = [[seg.x1, seg.y1], [seg.x2, seg.y2]];
    for (const [ex, ey] of ends) {
      ctx.beginPath(); ctx.arc(ex, ey, s.handleR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b6fa8'; ctx.stroke();
    }

    const del = s.deleteButtonAt(seg);
    ctx.beginPath(); ctx.arc(del.x, del.y, s.delR, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d5e'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = '#ffffff';
    const k = s.delR * 0.42;
    ctx.beginPath();
    ctx.moveTo(del.x - k, del.y - k); ctx.lineTo(del.x + k, del.y + k);
    ctx.moveTo(del.x + k, del.y - k); ctx.lineTo(del.x - k, del.y + k);
    ctx.stroke();
    ctx.restore();
  }


  /* Tutorial step 1: mime the drag that places a ramp. Everything here is
     canvas primitives - no images, and it scales with the board. The demo
     ramp is a PLAUSIBLE one, deliberately not the answer. */
  private drawTutorialHand(k: number): void {
    const ctx = this.ctx;
    // fade in off the start dot, hold, fade out at the end of the glide
    const a = k < 0.10 ? k / 0.10 : k > 0.86 ? (1 - k) / 0.14 : 1;
    const hx = TUT_A.x + (TUT_B.x - TUT_A.x) * k;
    const hy = TUT_A.y + (TUT_B.y - TUT_A.y) * k;
    ctx.save();

    // the ramp it would leave behind, so the gesture explains its own result
    ctx.globalAlpha = a * 0.34;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3ec8ff';
    ctx.lineWidth = RAMP_HT * 2;
    ctx.beginPath(); ctx.moveTo(TUT_A.x, TUT_A.y); ctx.lineTo(hx, hy); ctx.stroke();

    // the path the finger is taking
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(TUT_A.x, TUT_A.y); ctx.lineTo(TUT_B.x, TUT_B.y); ctx.stroke();
    ctx.setLineDash([]);

    // where it started
    ctx.globalAlpha = a * 0.6;
    ctx.beginPath(); ctx.arc(TUT_A.x, TUT_A.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();

    // the fingertip: a soft press-ring around a solid dot
    ctx.globalAlpha = a * 0.32;
    ctx.beginPath(); ctx.arc(hx, hy, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(hx, hy, 10.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,60,110,.9)'; ctx.stroke();

    // the label, above the mime and clear of it
    ctx.globalAlpha = 0.92;
    ctx.font = '600 19px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const label = 'Drag to place a ramp.';
    const ly = TUT_A.y - 34, lw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(13,16,34,.78)';
    roundRect(ctx, (TUT_A.x + TUT_B.x) / 2 - lw / 2 - 13, ly - 20, lw + 26, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#e9ecff';
    ctx.fillText(label, (TUT_A.x + TUT_B.x) / 2, ly);
    ctx.restore();
  }

  private drawSpawnMarker(lv: Level): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lv.spawn.x, lv.spawn.y + 14);
    ctx.lineTo(lv.spawn.x, lv.spawn.y + 78);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(lv.spawn.x, lv.spawn.y, BALL_R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ball - drawn between the last two physics states, so motion stays smooth
     on high-refresh displays where rAF outruns the fixed 60Hz simulation. */
  private drawBall(s: RenderState): void {
    const ctx = this.ctx;
    let bx: number, by: number;
    let rad = BALL_R, alpha = 1;

    if (s.ball && s.phase === 'drop') {
      bx = s.ball.px + (s.ball.x - s.ball.px) * s.alpha;
      by = s.ball.py + (s.ball.y - s.ball.py) * s.alpha;
    } else if (s.capture) {
      // swallowed: slide to the centre while shrinking and fading out
      const k = Math.min(1, s.capture.t / (s.captureMs * 0.55));
      const e = k * k * (3 - 2 * k);
      bx = s.capture.bx + (s.capture.cx - s.capture.bx) * e;
      by = s.capture.by + (s.capture.cy - s.capture.by) * e;
      rad = BALL_R * (1 - e);
      alpha = 1 - e;
    } else if (s.ball) {
      bx = s.ball.x; by = s.ball.y;
    } else {
      bx = s.level.spawn.x; by = s.level.spawn.y;
    }

    this.lastDraw.x = bx; this.lastDraw.y = by;
    /* only a ball that is actually travelling leaves a trail; a ball parked on
       the spawn marker during planning must not smear */
    if ((s.ball && s.phase === 'drop') || s.capture) this.trail.push(bx, by);

    if (rad <= 0.2) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // amber bloom around it, as a gradient rather than shadowBlur
    const bloom = ctx.createRadialGradient(bx, by, rad * 0.45, bx, by, rad * 3.4);
    bloom.addColorStop(0,   'rgba(255,196,74,.42)');
    bloom.addColorStop(0.5, 'rgba(255,150,50,.13)');
    bloom.addColorStop(1,   'rgba(255,150,50,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(bx, by, rad * 3.4, 0, Math.PI * 2); ctx.fill();

    ctx.translate(bx, by);
    const q = s.squash.amt;
    if (Math.abs(q) > 0.002) {
      /* flatten along the surface it hit, bulge across it; outBack drives q
         slightly negative on the way home, which stretches it the other way */
      ctx.rotate(Math.atan2(s.squash.ny, s.squash.nx));
      ctx.scale(1 - q, 1 + q * 0.55);
    }
    /* white-hot at the highlight falling off to gold: the legend still calls
       this a white ball, and it still is - the amber lives in the falloff */
    const core = ctx.createRadialGradient(-rad * 0.30, -rad * 0.34, rad * 0.05, 0, 0, rad);
    core.addColorStop(0,   '#ffffff');
    core.addColorStop(0.5, '#fff6dc');
    core.addColorStop(1,   '#ffc451');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
