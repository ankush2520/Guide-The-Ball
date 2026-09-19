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
import { H, BALL_R, RAMP_HT, STEP_MS_DEFAULT } from './constants';
import { BOARD, BOOST_HT, BOOST_LEN } from '../physics/constants';
import type { BoostRampDef, Level, Vec } from '../levels/types';
import type { DrawContext, Entity } from '../entities/Entity';
import { Target } from '../entities/Target';
import { RAMP_STYLE } from '../entities/Ramp';
import { Backdrop } from './Backdrop';
import { drawStarfield } from './Starfield';
import { drawClouds } from './Clouds';
import { BALL, INK, OBSTACLE, isLightSky } from './palette';
import { Trail } from './Trail';
import { ParticleSystem } from './Particles';
import { drawSeg } from './primitives';
import type { Phase } from '../core/events';
import type { Country, Segment } from '../levels/types';

export const MAX_SCALE = 2;

/** The ball's impact deformation. `amt` is tweened by the game loop; nx/ny is
    the axis it is squashed along, which is whatever surface it just met. */
export interface Squash { amt: number; nx: number; ny: number; }

export interface CaptureState { t: number; bx: number; by: number; cx: number; cy: number; }

export interface RenderState {
  level: Level;
  country: Country;
  entities: readonly Entity[];
  ramps: readonly Segment[];
  /** The ramp being drawn right now, if any - not a ramp yet. */
  draft: Segment | null;
  /** Below this length a draft will be thrown away rather than placed. */
  minRamp: number;
  selected: number;
  phase: Phase;
  clock: number;
  /** Interpolation: how far through the current physics step we are. */
  alpha: number;
  /** Elapsed simulation steps, fractional, 0 when no drop is running. Drives
      a patrolling target and nothing else. */
  simT: number;
  ball: { x: number; y: number; px: number; py: number } | null;
  broken: boolean[];
  got: boolean[];
  gotBox: boolean[];
  /** Whether this level's target gift has already been taken - see the note
      on the wrapped target in Target.draw(). */
  giftTaken: boolean;
  capture: CaptureState | null;
  captureMs: number;
  squash: Squash;
  deleteButtonAt: (s: Segment) => { x: number; y: number };
  handleR: number;
  delR: number;
  /** The player's own boost ramps, and the grips of whichever is selected. */
  boosters: readonly BoostRampDef[];
  selectedBooster: number;
  boosterHandleAt: (b: BoostRampDef) => Vec;
  boosterDeleteAt: (b: BoostRampDef) => Vec;
  aimR: number;
  /** Which first-run step is showing, if any. The bubble is DOM (Coach.tsx);
      the board adds only what has to sit ON the board - see drawCoach. */
  tutorial: { step: string | null };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private backdrop = new Backdrop();
  private scale = 1;
  private builtFor: Country | null = null;
  /** The board width the current surface was sized for - a profile change
      has to rebuild even when the pixel width happens to land the same. */
  private builtPad = -1;

  readonly trail = new Trail();
  readonly particles = new ParticleSystem(STEP_MS_DEFAULT);
  /** Where the ball was actually painted this frame - the interpolated
      position, not the physics one. The suite asserts on this to prove the
      render really does run between two physics states. */
  readonly lastDraw = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    // give the element the right intrinsic ratio before the first measure,
    // otherwise it lays out at the 300x150 canvas default for one frame
    canvas.width = BOARD.w; canvas.height = H;
  }

  /* The board is only ever ~370 CSS px wide on a phone. Rendering it at
     480x800 logical times a 3x device ratio meant pushing 3.5M pixels -
     roughly fifteen times what the screen can show - through shadowBlur on
     every frame, which is exactly what made drawing a ramp stutter. Size the
     surface to what is actually on screen instead, capped at 2x. */
  resize(country: Country): void {
    const bw = BOARD.w;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_SCALE));
    const cssW = this.canvas.getBoundingClientRect().width || bw;
    const px = Math.round(Math.min(Math.max(cssW * dpr, cssW), bw * MAX_SCALE));
    if (px !== this.canvas.width || BOARD.pad !== this.builtPad) {
      this.canvas.width = px;
      this.canvas.height = Math.round(px * H / bw);
      this.scale = this.canvas.width / bw;
      /* The translate is what lets everything else keep drawing in DESIGN
         coordinates: board x0 (which is -pad, not 0) lands on canvas 0, so a
         level authored at x=140 paints at x=140 on a phone and on a tablet. */
      this.ctx.setTransform(this.scale, 0, 0, this.scale, this.scale * BOARD.pad, 0);
      this.builtPad = BOARD.pad;
      this.builtFor = null;
    }
    if (this.builtFor !== country) {
      this.backdrop.build(country, this.canvas.width, this.canvas.height, this.scale);
      this.builtFor = country;
    }
  }

  /** Force a backdrop repaint - call when the country changes. */
  invalidateBackdrop(): void { this.builtFor = null; }

  render(s: RenderState): void {
    const ctx = this.ctx;
    this.resize(s.country);

    ctx.drawImage(this.backdrop.image, BOARD.x0, 0, BOARD.w, H);
    /* the ambient layer follows the sky: clouds on a daytime board, the old
       drifting stars on the countries that are still night */
    if (isLightSky(s.country.sky[1])) drawClouds(ctx, s.clock);
    else drawStarfield(ctx, s.clock);

    const g = { ctx, clock: s.clock, broken: s.broken, got: s.got,
                gotBox: s.gotBox, giftTaken: s.giftTaken,
                simT: s.simT, level: s.level };

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
    for (const r of s.ramps) drawSeg(ctx, r, RAMP_HT, RAMP_STYLE);

    /* THE RAMP BEING DRAWN, in the same pen as a placed one so what you see
       under your finger is what you are about to get. Translucent while it is
       still too short to keep, which is the only warning the gesture needs:
       let go here and nothing is placed. */
    if (s.draft) {
      const len = Math.hypot(s.draft.x2 - s.draft.x1, s.draft.y2 - s.draft.y1);
      ctx.save();
      if (len < s.minRamp) ctx.globalAlpha = 0.45;
      drawSeg(ctx, s.draft, RAMP_HT, RAMP_STYLE);
      ctx.restore();
    }

    if (s.phase === 'plan' && s.selected >= 0 && s.selected < s.ramps.length)
      this.drawSelection(s, s.ramps[s.selected]);
    if (s.phase === 'plan' && s.selectedBooster >= 0
        && s.selectedBooster < s.boosters.length)
      this.drawBoosterSelection(s, s.boosters[s.selectedBooster], g,
        s.entities.find(e => e.kind === 'myboost' && e.index === s.selectedBooster));

    if (s.phase === 'plan') this.drawSpawnMarker(s.level);
    if (s.tutorial.step) this.drawCoach(s);

    /* the comet behind the ball, then the impact sparks over it */
    this.trail.draw(ctx);
    this.particles.draw(ctx);

    this.drawBall(s);
  }

  /* ============================================================
     THE BOOST RAMP BEING EDITED

     The same grammar as the selected ramp, so one lesson covers
     both: a gold halo saying "this is the one", a grip you drag,
     and the big red × that takes it back. It is the same SHAPE as
     a selected ramp now, so the halo is drawn the same way too -
     a fat amber line down the bar rather than a ring, which is
     what a ring around a 96-unit bar could never be.

     What still differs is the third control, and it is the whole
     item: a ramp turns by either END, which also changes its
     length; a boost ramp has ONE fixed length, so it turns by a
     single knob on a stalk past its leading end and pivots about
     its middle. The dashed line through it is the plane the ball
     will mirror off - drawn out both ways, because a bar has two
     faces and the ball may arrive at either.
     ============================================================ */
  private drawBoosterSelection(s: RenderState, b: BoostRampDef,
                               g: DrawContext, ent?: Entity): void {
    const ctx = this.ctx;
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    const a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
    const knob = s.boosterHandleAt(b);
    ctx.save();

    /* The halo, the same amber the selected ramp wears - and like the ramp's,
       the thing it picks out is drawn again ON TOP of it. */
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,210,63,.75)';
    ctx.lineWidth = BOOST_HT * 2 + 16;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ent?.draw(g);

    /* THE MIRROR LINE. A dashed ray along the bar's own plane, both ways,
       crawling outward so it reads as live. This is the promise the bar makes
       - the surface the ball leaves along - drawn before it is taken rather
       than explained afterwards. */
    ctx.strokeStyle = 'rgba(42,35,80,.34)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 8]);
    ctx.lineDashOffset = -(s.clock * 34) % 17;
    const reach = 150;
    for (const dir of [-1, 1]) {
      const from = BOOST_LEN / 2 + 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * dir * from, cy + Math.sin(a) * dir * from);
      ctx.lineTo(cx + Math.cos(a) * dir * reach, cy + Math.sin(a) * dir * reach);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // the stalk, so the knob is visibly PART of this bar
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x2, b.y2);
    ctx.lineTo(knob.x, knob.y);
    ctx.stroke();

    ctx.beginPath(); ctx.arc(knob.x, knob.y, s.aimR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();

    this.drawDeleteButton(s.boosterDeleteAt(b), s.delR);
    ctx.restore();
  }

  /* the ramp being edited: a halo so it reads as picked out from the others,
     a grip at each end, and the delete button.

     NO PIVOT CIRCLE. There used to be a dashed ring through both ends, drawn
     because an item was a fixed length and its ends really could only travel
     round it. A ramp is drawn by hand again and an end goes wherever the
     finger takes it, so that ring was describing a rule the game no longer
     has - and a diagram of the wrong rule is worse than no diagram. */
  private drawSelection(s: RenderState, seg: Segment): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,210,63,.75)';
    ctx.lineWidth = RAMP_HT * 2 + 16;
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    drawSeg(ctx, seg, RAMP_HT, RAMP_STYLE);
    // dashed line down the bar, so selection survives on top of a same-coloured ramp
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -(s.clock * 22) % 12;    // a slow crawl: it is "live"
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.setLineDash([]);

    const ends: [number, number][] = [[seg.x1, seg.y1], [seg.x2, seg.y2]];
    for (const [ex, ey] of ends) {
      ctx.beginPath(); ctx.arc(ex, ey, s.handleR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }

    this.drawDeleteButton(s.deleteButtonAt(seg), s.delR);
    ctx.restore();
  }

  /* The × that takes a placed item back. Shared by the ramp and the booster:
     one button, drawn one way, so "this removes it" is learned once. */
  private drawDeleteButton(del: { x: number; y: number }, r: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(42,35,80,.22)';
    ctx.beginPath(); ctx.arc(del.x, del.y + 4, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(del.x, del.y, r, 0, Math.PI * 2);
    ctx.fillStyle = OBSTACLE.base; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff';
    const k = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(del.x - k, del.y - k); ctx.lineTo(del.x + k, del.y + k);
    ctx.moveTo(del.x + k, del.y - k); ctx.lineTo(del.x - k, del.y + k);
    ctx.stroke();
    ctx.restore();
  }


  /* The walkthrough's marks on the board itself. On the intro, a ring
     pulsing round the target - the thing the bubble is talking about. While
     aiming, an arrow from the ramp to the column the ball falls down, since
     the ramp arrives in the middle of the board and the ball does not. */
  private drawCoach(s: RenderState): void {
    const ctx = this.ctx;
    const k = 0.5 + 0.5 * Math.sin(s.clock * 4);
    ctx.save();
    if (s.tutorial.step === 'intro') {
      const t = s.level.target;
      ctx.strokeStyle = `rgba(255,180,0,${0.55 + 0.4 * k})`;
      ctx.lineWidth = 5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -s.clock * 20;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 16 + k * 6, 0, Math.PI * 2); ctx.stroke();
    }
    /* THE GESTURE ITSELF, shown rather than described: a stroke across the
       ball's fall line with a hand travelling along it. It is drawn where a
       first ramp actually wants to go, so copying it is also solving the
       board - and it fades out the moment a draft starts, because by then the
       player is doing the thing and a ghost under their finger is noise. */
    if (s.tutorial.step === 'draw' && !s.draft) {
      const y = H * 0.52, half = 58;
      const x0 = s.level.spawn.x - half, x1 = s.level.spawn.x + half;
      ctx.strokeStyle = `rgba(255,170,0,${0.45 + 0.35 * k})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.setLineDash([3, 13]);
      ctx.beginPath(); ctx.moveTo(x0, y + 16); ctx.lineTo(x1, y - 16); ctx.stroke();
      ctx.setLineDash([]);
      // the finger, sliding along it
      const t = (s.clock * 0.55) % 1;
      const fx = x0 + (x1 - x0) * t, fy = (y + 16) + (-32) * t;
      ctx.beginPath(); ctx.arc(fx, fy, 9 + k * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpawnMarker(lv: Level): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(42,35,80,.45)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2.5;
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

    /* A soft warm glow, much smaller than the old amber bloom: on a light
       board a wide halo just muddies the sky. The ink outline is what finds
       the ball now. */
    const bloom = ctx.createRadialGradient(bx, by, rad * 0.8, bx, by, rad * 2.2);
    bloom.addColorStop(0, 'rgba(255,180,0,.30)');
    bloom.addColorStop(1, 'rgba(255,180,0,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(bx, by, rad * 2.2, 0, Math.PI * 2); ctx.fill();

    ctx.translate(bx, by);
    const q = s.squash.amt;
    if (Math.abs(q) > 0.002) {
      /* flatten along the surface it hit, bulge across it; outBack drives q
         slightly negative on the way home, which stretches it the other way */
      ctx.rotate(Math.atan2(s.squash.ny, s.squash.nx));
      ctx.scale(1 - q, 1 + q * 0.55);
    }
    /* white at the highlight falling off to gold: the legend still calls this
       a white ball, and it still is - the gold lives in the falloff. The
       outline is drawn INSIDE the squash transform, so it deforms with the
       ball on impact rather than staying a rigid circle around it. */
    const core = ctx.createRadialGradient(-rad * 0.30, -rad * 0.34, rad * 0.05, 0, 0, rad);
    core.addColorStop(0,   BALL.hi);
    core.addColorStop(0.45, BALL.mid);
    core.addColorStop(1,   BALL.edge);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, rad * 0.26);
    ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();

    /* the gloss is painted after the squash is undone, so the light stays
       high and left however the ball is flattened */
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.ellipse(bx - rad * 0.34, by - rad * 0.38, rad * 0.26, rad * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
