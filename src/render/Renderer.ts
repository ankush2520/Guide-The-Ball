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
import { BOARD } from '../physics/constants';
import type { Level } from '../levels/types';
import type { Entity } from '../entities/Entity';
import { Target } from '../entities/Target';
import { RAMP_STYLE } from '../entities/Ramp';
import { activeStyle } from '../cosmetics/cosmetics';
import { rampAllowed } from '../levels/patrol';
import { drawSpring } from './Spring';
import { Backdrop } from './Backdrop';
import { drawStarfield } from './Starfield';
import { drawClouds } from './Clouds';
import { INK, OBSTACLE, isLightSky } from './palette';
import { Trail } from './Trail';
import { ParticleSystem } from './Particles';
import { drawSeg } from './primitives';
import { VIEW_SCALE } from './view';
import type { Phase } from '../core/events';
import type { Country, Segment } from '../levels/types';

export const MAX_SCALE = 2;

/** The ball's impact deformation. `amt` is tweened by the game loop; nx/ny is
    the axis it is squashed along, which is whatever surface it just met. */
export interface Squash { amt: number; nx: number; ny: number; }

export interface CaptureState { t: number; bx: number; by: number; cx: number; cy: number; }

/** The player's ramps in the worn ramp colour (cosmetics); the rest of the
    style is the ramp's own. One object, rebuilt only when the colour moves. */
let rampCache: { fill: string; style: typeof RAMP_STYLE } | null = null;
function playerRamp(): typeof RAMP_STYLE {
  if (!rampCache || rampCache.fill !== activeStyle.ramp)
    rampCache = { fill: activeStyle.ramp, style: { ...RAMP_STYLE, fill: activeStyle.ramp } as typeof RAMP_STYLE };
  return rampCache.style;
}

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
  /** The patrol clock in steps, fractional - running from level entry, not
      from the drop (see GameController.patrolClock). Drives a patrolling
      target and nothing else. */
  simT: number;
  ball: { x: number; y: number; px: number; py: number } | null;
  /* read-only: the renderer never writes game state, and these are reused
     buffers on the controller - see its render-state scratch. */
  broken: readonly boolean[];
  got: readonly boolean[];
  gotBox: readonly boolean[];
  /** Whether this level's target gift has already been taken - see the note
      on the wrapped target in Target.draw(). */
  giftTaken: boolean;
  capture: CaptureState | null;
  captureMs: number;
  squash: Squash;
  deleteButtonAt: (s: Segment) => { x: number; y: number };
  handleR: number;
  delR: number;
  /** Whether a spring is out of the bag waiting for a ramp to be tapped. */
  armedSpring: boolean;
  /** The hint's ramps while it is shown (a dashed ghost), else null. */
  hint: readonly Segment[] | null;
  /** A timed board's hint: the board is at the proven drop moment now. */
  hintPulse: boolean;
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

  /* ============================================================
     THE BALL'S TWO GRADIENTS

     Both are a pure function of the ball's RADIUS, and the radius
     is BALL_R on every frame except the half-second of a capture.
     They used to be rebuilt twice a frame for a value that had
     not changed. Cached on the radius they were built for, and
     rebuilt only when that actually moves.

     A CanvasGradient is resolved in user space AT PAINT TIME, so
     one built about the origin follows whatever translate the
     ball is drawn under - which is what lets a single object
     serve every position the ball ever takes.
     ============================================================ */
  private bloomGrad: CanvasGradient | null = null;
  private bloomRad = -1;
  private coreGrad: CanvasGradient | null = null;
  private coreRad = -1;

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
    /* offsetWidth, not getBoundingClientRect(). This runs on EVERY frame, and
       a rect read is a forced synchronous layout: with a finger on the board
       the same frame is already writing style (the ripple) and reading the
       canvas rect from the pointer handler, so each one flushed layout again.
       offsetWidth is the same number to the pixel here - the canvas has no
       transform - and it is the cheaper read. */
    const cssW = this.canvas.offsetWidth || bw;
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

  /* ============================================================
     THE TWO LAYERS

     The SKY layer is the board itself - the backdrop, the clouds
     or the stars - and it is painted across the whole surface at
     the transform resize() set, so it reaches the real edges
     whatever the view scale is.

     The SCENE layer is everything the level is made of, and it
     is painted through this transform instead: the same design
     coordinates, scaled about the board's centre by VIEW_SCALE.
     At 1 it is arithmetically the transform resize() already
     set, so the board that shipped is the VIEW_SCALE = 1 case of
     this one rather than a separate path.
     ============================================================ */
  private setSceneTransform(): void {
    const s = this.scale, z = VIEW_SCALE;
    const cx = (BOARD.x0 + BOARD.x1) / 2, cy = H / 2;
    // x_px = s*(pad + cx + (x - cx)*z), and the same in y without the pad
    this.ctx.setTransform(s * z, 0, 0, s * z,
                          s * (BOARD.pad + cx * (1 - z)), s * cy * (1 - z));
  }

  render(s: RenderState): void {
    const ctx = this.ctx;
    this.resize(s.country);

    ctx.drawImage(this.backdrop.image, BOARD.x0, 0, BOARD.w, H);
    /* the ambient layer follows the sky: clouds on a daytime board, the old
       drifting stars on the countries that are still night */
    /* ...and nothing at all under water: the sea (entities/Sea) is the sky there */
    const underwater = !!(s.level.fish && s.level.fish.length);
    if (underwater) { /* no clouds, no stars */ }
    else if (isLightSky(s.country.sky[1])) drawClouds(ctx, s.clock);
    else drawStarfield(ctx, s.clock);

    /* everything from here down is the SCENE, and it is drawn at the view
       scale. save/restore is what puts the sky transform back for the next
       frame's backdrop. */
    ctx.save();
    this.setSceneTransform();

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

    /* THE HINT: its ramps as a dashed ghost under the player's own, so a
       ramp drawn over one sits right on top of it. */
    if (s.hint) this.drawHint(s.hint, s.clock);

    /* ramps - the player's own entities, drawn above the board furniture */
    for (const r of s.ramps) drawSeg(ctx, r, RAMP_HT, playerRamp());

    /* THE RAMP BEING DRAWN, in the same pen as a placed one so what you see
       under your finger is what you are about to get. Translucent while it is
       still too short to keep, which is the only warning the gesture needs:
       let go here and nothing is placed. */
    if (s.draft) {
      const len = Math.hypot(s.draft.x2 - s.draft.x1, s.draft.y2 - s.draft.y1);
      ctx.save();
      /* ...and across a moving target's track, which is the same promise:
         nothing is placed there. */
      if (len < s.minRamp || !rampAllowed(s.level, s.draft)) ctx.globalAlpha = 0.45;
      drawSeg(ctx, s.draft, RAMP_HT, playerRamp());
      ctx.restore();
    }

    if (s.phase === 'plan' && s.selected >= 0 && s.selected < s.ramps.length)
      this.drawSelection(s, s.ramps[s.selected]);
    /* A SPRING WAITING FOR A RAMP. While one is armed every ramp wears a
       pulsing halo, because the next tap is going to land on one of them and
       the board should say which shapes are eligible before the finger moves.
       Nothing else on the board changes: the spring is not on anything yet. */
    if (s.phase === 'plan' && s.armedSpring) this.drawSpringArmed(s);

    /* THE SPRINGS, LAST of everything that belongs to a ramp. Both the
       selection halo and the armed-spring halo redraw the ramp they pick out,
       so a coil painted with the ramps would be buried the moment its own
       ramp was selected - which is exactly when the player is looking at it. */
    for (const r of s.ramps) if (r.spring) drawSpring(ctx, r, s.clock);

    if (s.phase === 'plan') this.drawSpawnMarker(s.level);
    // a timed board's hint: the drop point pulses at the proven moment
    if (s.hintPulse) this.drawHintPulse(s.level, s.clock);
    if (s.tutorial.step) this.drawCoach(s);

    /* the comet behind the ball, then the impact sparks over it */
    this.trail.draw(ctx);
    this.particles.draw(ctx);

    this.drawBall(s);
    ctx.restore();
  }

  /** A hint ramp: the ramp's own width, dashed and faint - a ghost to trace,
      never mistaken for a real one. A spring on it shows as a faint coil. */
  private drawHint(ramps: readonly Segment[], clock: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    for (const r of ramps) {
      ctx.strokeStyle = 'rgba(40,110,230,0.22)';
      ctx.lineWidth = RAMP_HT * 2 + 6;
      ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,110,230,0.75)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    for (const r of ramps) if (r.spring) drawSpring(ctx, r, clock);
    ctx.restore();
  }

  /** "Drop now": a ring swelling out of the spawn point. */
  private drawHintPulse(lv: Level, clock: number): void {
    const ctx = this.ctx, k = (clock * 2.5) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(40,110,230,${0.9 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(lv.spawn.x, lv.spawn.y, 12 + k * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* ============================================================
     A SPRING LOOKING FOR A RAMP

     Armed, not placed. Every ramp on the board gets a breathing
     halo in the spring's own brass, which is the whole prompt:
     these are the things the next tap may land on. A board with
     no ramps cannot arm one at all (see placeItem), so this is
     never an empty promise.
     ============================================================ */
  private drawSpringArmed(s: RenderState): void {
    const ctx = this.ctx;
    const pulse = 0.55 + 0.45 * Math.sin(s.clock * 5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(214,158,46,${(0.35 + 0.35 * pulse).toFixed(3)})`;
    ctx.lineWidth = RAMP_HT * 2 + 14;
    for (const r of s.ramps) {
      ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
    }
    for (const r of s.ramps) drawSeg(ctx, r, RAMP_HT, playerRamp());
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
    drawSeg(ctx, seg, RAMP_HT, playerRamp());
    // dashed line down the bar, so selection survives on top of a same-coloured ramp
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -(s.clock * 22) % 12;    // a slow crawl: it is "live"
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.setLineDash([]);

    // a grip on each end - the two are written out, so no array is built
    // per frame just to be walked once
    ctx.fillStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.strokeStyle = INK;
    for (let i = 0; i < 2; i++) {
      const ex = i ? seg.x2 : seg.x1, ey = i ? seg.y2 : seg.y1;
      ctx.beginPath(); ctx.arc(ex, ey, s.handleR, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
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

  /** The worn ball skin changed: the cached gradients are stale. */
  private styleSeen = -1;
  private checkStyle(): void {
    if (this.styleSeen === activeStyle.version) return;
    this.styleSeen = activeStyle.version;
    this.bloomGrad = null; this.coreGrad = null;
  }

  /** The halo in the skin's edge colour, built about the origin. */
  private bloomFor(rad: number): CanvasGradient {
    this.checkStyle();
    if (this.bloomGrad && this.bloomRad === rad) return this.bloomGrad;
    const g = this.ctx.createRadialGradient(0, 0, rad * 0.8, 0, 0, rad * 2.2);
    const edge = activeStyle.ball[2];
    g.addColorStop(0, edge + '4d');     // ~30%
    g.addColorStop(1, edge + '00');
    this.bloomGrad = g; this.bloomRad = rad;
    return g;
  }

  /** White at the highlight falling off to gold - already origin-relative. */
  private coreFor(rad: number): CanvasGradient {
    this.checkStyle();
    if (this.coreGrad && this.coreRad === rad) return this.coreGrad;
    const g = this.ctx.createRadialGradient(-rad * 0.30, -rad * 0.34, rad * 0.05,
                                            0, 0, rad);
    /* the worn ball skin (cosmetics) - the classic one is BALL's own colours */
    const [hi, mid, edge] = activeStyle.ball;
    g.addColorStop(0,    hi);
    g.addColorStop(0.45, mid);
    g.addColorStop(1,    edge);
    this.coreGrad = g; this.coreRad = rad;
    return g;
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
    /* Translated FIRST, so both gradients can be cached about the origin and
       still land on the ball - see the note on them above. */
    ctx.translate(bx, by);

    /* A soft warm glow, much smaller than the old amber bloom: on a light
       board a wide halo just muddies the sky. The ink outline is what finds
       the ball now. */
    ctx.fillStyle = this.bloomFor(rad);
    ctx.beginPath(); ctx.arc(0, 0, rad * 2.2, 0, Math.PI * 2); ctx.fill();

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
    ctx.fillStyle = this.coreFor(rad);
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
