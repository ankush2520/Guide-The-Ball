/* ============================================================
   THE CUP - what the target looks like

   The goal is a real cup, the kind people drink from, and every
   world pours a different drink:

     meadow     a glass of water, with ice
     volcano    a coffee mug, steaming
     mountains  a root-beer mug with a creamy foam head
     cliffs     a teacup on its saucer, steaming
     reef       a tropical juice glass: straw, umbrella, orange slice
     egypt      a glass of lemonade: lemon wheel, ice, mint
     space      a striped paper soda cup with a straw

   THE CUP IS REAL. Its sides and floor are solid in the physics
   and the ball can only get in over the rim (levels/cup holds the
   shape both sides share). The body drawn here is that same
   tapered shape, so the cup you see is the cup you hit. Handles,
   saucers, straws and garnish are decoration: they are small and
   sit outside the path a ball takes into the mouth.

   GREEN IS STILL THE GOAL. Whatever is in the cup, a green halo
   breathes round it and the drink's surface glows green - the one
   colour the board reserves for "land here" never leaves the target.

   TWO HALVES. drawCupBack() is the halo, the inside of the mouth,
   the drink's surface and anything standing in the drink (a straw,
   an umbrella); drawCupFront() is the body, the drink seen through
   it, the handle and the front lip. During a capture the renderer
   puts the ball between the two, so the cup's front covers the ball
   as it sinks in - and through a glass you can see it go.

   All sizes are fractions of r, so a 27-unit target and a 46-unit
   one get the same cup.
   ============================================================ */
import { INK } from '../render/palette';
import { TARGET_GLOW } from '../render/glow';
import type { Country } from '../levels/types';
import { CUP } from '../levels/cup';

export type CupTheme = 'meadow' | 'volcano' | 'mountains' | 'cliffs' | 'reef' | 'egypt' | 'space';

/** The world's cup. The reef is the one world with no painted scene. */
export function cupThemeOf(country: Pick<Country, 'scene'> | null | undefined): CupTheme {
  return country?.scene ?? 'reef';
}

/* The silhouette, in units of r. */
export const MOUTH_Y = CUP.mouthY;
const MOUTH_RX = CUP.mouthHX;
const MOUTH_RY = 0.22;
const BASE_Y = CUP.baseY, BASE_RX = CUP.baseHX;

/* ------------------------------------------------------------ */
interface Drink {
  glass: boolean;                       // see-through body?
  body: [string, string, string];       // opaque body gradient (ignored for glass)
  rim: string;                          // the lip
  liquid: [string, string];             // drink, top -> bottom
  surface: string;                      // the drink's top
  level: number;                        // drink surface, in r below the rim (0 = brim)
  handle?: string;                      // a handle on the right, in this colour
}

const DRINKS: Record<CupTheme, Drink> = {
  meadow:    { glass: true,  body: ['', '', ''], rim: '#e9f6ff', liquid: ['rgba(120,200,255,.55)', 'rgba(60,150,230,.7)'], surface: '#bfe6ff', level: 0.22 },
  volcano:   { glass: false, body: ['#ffffff', '#f1ece6', '#c9bfb4'], rim: '#ffffff', liquid: ['#6b3f22', '#3d2414'], surface: '#7a4a2a', level: 0.14, handle: '#efe9e2' },
  mountains: { glass: true,  body: ['', '', ''], rim: '#f4fbff', liquid: ['rgba(160,100,58,.92)', 'rgba(84,46,22,.96)'], surface: '#fff1dd', level: 0.06, handle: 'rgba(225,240,250,.85)' },
  cliffs:    { glass: false, body: ['#ffffff', '#f3f6fb', '#c6cfe0'], rim: '#ffffff', liquid: ['#c77a35', '#8a4a16'], surface: '#c98a4a', level: 0.14, handle: '#eef2f8' },
  reef:      { glass: true,  body: ['', '', ''], rim: '#f4fbff', liquid: ['rgba(255,170,60,.85)', 'rgba(255,90,90,.9)'], surface: '#ffc070', level: 0.16 },
  egypt:     { glass: true,  body: ['', '', ''], rim: '#f4fbff', liquid: ['rgba(255,245,170,.7)', 'rgba(250,225,90,.8)'], surface: '#fff6c4', level: 0.18 },
  space:     { glass: false, body: ['#ffffff', '#f4f4f8', '#cfd2e0'], rim: '#ffffff', liquid: ['#7a2a1a', '#4a140c'], surface: '#5a1e12', level: 0.1 },
};

/* half-width of the body at height y (in r), following the taper */
const halfAt = (y: number): number => {
  const my = MOUTH_Y, by = BASE_Y;
  const k = Math.max(0, Math.min(1, (y - my) / (by - my)));
  return MOUTH_RX + (BASE_RX - MOUTH_RX) * k;
};

/* Straight tapered sides and a flat floor - exactly the bars the physics has. */
function bodyPath(ctx: CanvasRenderingContext2D, r: number): void {
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;
  const bx = BASE_RX * r, by = BASE_Y * r;
  ctx.beginPath();
  ctx.moveTo(-rx, my);
  ctx.lineTo(-bx, by - r * 0.04);
  ctx.quadraticCurveTo(0, by + r * 0.08, bx, by - r * 0.04);
  ctx.lineTo(rx, my);
  ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
}

/* ============================================================
   BACK: halo, the inside of the mouth, the drink's surface and
   whatever stands in the drink
   ============================================================ */
export function drawCupBack(ctx: CanvasRenderingContext2D, r: number, theme: CupTheme, clock: number): void {
  const D = DRINKS[theme];
  const pulse = 0.5 + 0.5 * Math.sin(clock * 2.3);
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;

  // the green halo - the goal's colour, whatever the drink
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * TARGET_GLOW);
  halo.addColorStop(0, `rgba(47,201,90,${0.20 + pulse * 0.14})`);
  halo.addColorStop(1, 'rgba(47,201,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * TARGET_GLOW, 0, Math.PI * 2); ctx.fill();

  // the inside wall of the cup, above the drink
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = D.glass ? 'rgba(225,240,250,.55)' : D.body[2]; ctx.fill();

  // the drink's surface, a little below the rim
  const sy = my + D.level * r, srx = halfAt(MOUTH_Y + D.level) * r, sry = ry * (srx / rx);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.ellipse(0, sy, srx, sry, 0, 0, Math.PI * 2);
  ctx.fillStyle = D.surface; ctx.fill();
  // the goal glowing up through the drink
  const glow = ctx.createRadialGradient(0, sy, 0, 0, sy, srx);
  glow.addColorStop(0, `rgba(127,227,154,${0.18 + pulse * 0.14})`);
  glow.addColorStop(1, 'rgba(47,201,90,0)');
  ctx.fillStyle = glow; ctx.fill();
  SURFACE[theme]?.(ctx, r, sy, srx, sry, clock);
  ctx.restore();

  STANDING[theme]?.(ctx, r, clock);

  // the back lip
  ctx.lineWidth = r * 0.1; ctx.strokeStyle = D.rim;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

  // breathing ring rising off the mouth: "drop it in here"
  const bk = (clock % 1.9) / 1.9;
  ctx.strokeStyle = `rgba(23,150,61,${(1 - bk) * 0.55})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, my - bk * r * 0.5, rx * (1 + bk * 0.35), ry * (1 + bk * 0.35), 0, 0, Math.PI * 2);
  ctx.stroke();
}

/* ============================================================
   FRONT: saucer, handle, body, the drink through it, the lip
   ============================================================ */
export function drawCupFront(ctx: CanvasRenderingContext2D, r: number, theme: CupTheme, clock: number): void {
  const D = DRINKS[theme];
  const my = MOUTH_Y * r, rx = MOUTH_RX * r, ry = MOUTH_RY * r;

  if (theme === 'cliffs') saucer(ctx, r);
  if (D.handle) handle(ctx, r, D.handle, theme === 'mountains' ? 1.15 : 1);

  if (D.glass) {
    // the glass itself: a pale, see-through body
    ctx.fillStyle = 'rgba(225,242,255,.32)';
    bodyPath(ctx, r); ctx.fill();
    // the drink inside it, from its surface to the floor
    ctx.save();
    bodyPath(ctx, r); ctx.clip();
    const sy = my + D.level * r;
    const lg = ctx.createLinearGradient(0, sy, 0, BASE_Y * r);
    lg.addColorStop(0, D.liquid[0]); lg.addColorStop(1, D.liquid[1]);
    ctx.fillStyle = lg;
    const srx = halfAt(MOUTH_Y + D.level) * r, sry = ry * (srx / rx);
    ctx.beginPath();
    ctx.ellipse(0, sy, srx, sry, 0, 0, Math.PI, false);
    ctx.lineTo(-r * 1.2, BASE_Y * r + r); ctx.lineTo(r * 1.2, BASE_Y * r + r); ctx.closePath();
    ctx.fill();
    INSIDE[theme]?.(ctx, r, clock, sy);
    // a thick glass floor
    ctx.fillStyle = 'rgba(235,248,255,.6)';
    ctx.fillRect(-r * 1.2, BASE_Y * r - r * 0.1, r * 2.4, r * 0.2);
    // two tall reflections - what makes glass read as glass
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.ellipse(-rx * 0.62, my + r * 0.6, r * 0.07, r * 0.42, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.ellipse(rx * 0.5, my + r * 0.55, r * 0.04, r * 0.3, -0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, D.body[0]); g.addColorStop(0.45, D.body[1]); g.addColorStop(1, D.body[2]);
    ctx.fillStyle = g;
    bodyPath(ctx, r); ctx.fill();
    ctx.save();
    bodyPath(ctx, r); ctx.clip();
    DECOR[theme]?.(ctx, r, clock);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(-rx * 0.6, my + r * 0.55, r * 0.08, r * 0.36, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // the one pen round the body
  ctx.lineWidth = D.glass ? 2.5 : 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  bodyPath(ctx, r); ctx.stroke();

  // the front lip
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.14; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
  ctx.lineWidth = r * 0.08; ctx.strokeStyle = D.rim;
  ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
  ctx.lineCap = 'butt';

  OVER[theme]?.(ctx, r, clock);
}

/* ------------------------------------------------------------ */
type SurfaceFn = (ctx: CanvasRenderingContext2D, r: number, sy: number, srx: number, sry: number, clock: number) => void;
type Fn = (ctx: CanvasRenderingContext2D, r: number, clock: number) => void;
type InsideFn = (ctx: CanvasRenderingContext2D, r: number, clock: number, sy: number) => void;

/* on the drink's top */
const SURFACE: Partial<Record<CupTheme, SurfaceFn>> = {
  // ice cubes bobbing in the water
  meadow: (ctx, r, sy, srx, _sry, clock) => {
    for (const [x, a] of [[-0.35, 0.3], [0.3, -0.4]] as const) iceCube(ctx, x * srx, sy - r * 0.02 + Math.sin(clock * 1.6 + x * 5) * r * 0.015, r * 0.17, a);
  },
  // coffee: a ring of crema
  volcano: (ctx, _r, sy, srx, sry) => {
    ctx.strokeStyle = 'rgba(210,160,110,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, sy, srx * 0.82, sry * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
  },
  // root beer: the foam head, bubbly
  mountains: (ctx, r, sy, srx, sry) => {
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * srx * 0.6, sy + Math.sin(a) * sry * 0.5, r * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  },
  // tea: a little lighter swirl
  cliffs: (ctx, _r, sy, srx, sry) => {
    ctx.strokeStyle = 'rgba(240,190,130,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(srx * 0.15, sy, srx * 0.45, sry * 0.45, 0, 0.3, 4.6); ctx.stroke();
  },
  // lemonade: ice and a sprig of mint
  egypt: (ctx, r, sy, srx, _sry, clock) => {
    iceCube(ctx, -0.3 * srx, sy - r * 0.02 + Math.sin(clock * 1.4) * r * 0.012, r * 0.16, 0.4);
    leaf(ctx, 0.15 * r, sy - r * 0.02, r * 0.13, -0.6, '#4fb85a');
    leaf(ctx, 0.3 * r, sy, r * 0.11, 0.5, '#3a9a48');
  },
  // soda: fizz
  space: (ctx, r, sy, srx, _sry, clock) => {
    ctx.fillStyle = 'rgba(255,230,210,.7)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 0.37 + clock * 0.2) % 1 - 0.5) * srx * 1.6;
      ctx.beginPath(); ctx.arc(x, sy + Math.sin(i * 2.1) * r * 0.04, r * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  },
};

/* standing up out of the drink - drawn behind the front lip */
const STANDING: Partial<Record<CupTheme, Fn>> = {
  // coffee: steam
  volcano: (ctx, r, clock) => steam(ctx, r, clock),
  cliffs: (ctx, r, clock) => steam(ctx, r, clock),
  // juice: a striped straw, a paper umbrella and an orange wheel on the rim
  reef: (ctx, r, clock) => {
    straw(ctx, r, 0.28, 0.35, '#ff5a8a');
    umbrella(ctx, r, clock);
    citrusWheel(ctx, -MOUTH_RX * r * 0.85, MOUTH_Y * r - r * 0.12, r * 0.24, '#ff9a2a', '#ffd38a');
  },
  // lemonade: a straw and a lemon wheel on the rim
  egypt: (ctx, r) => {
    straw(ctx, r, -0.25, -0.3, '#3a8fe0');
    citrusWheel(ctx, MOUTH_RX * r * 0.85, MOUTH_Y * r - r * 0.12, r * 0.24, '#f5d020', '#fff4a8');
  },
  // soda: a bendy straw
  space: (ctx, r) => straw(ctx, r, 0.22, 0.4, '#ff4fa8'),
};

/* inside a glass, under the surface */
const INSIDE: Partial<Record<CupTheme, InsideFn>> = {
  meadow: (ctx, r, clock, sy) => fizz(ctx, r, clock, sy, 'rgba(255,255,255,.7)', 4),
  mountains: (ctx, r, clock, sy) => {
    fizz(ctx, r, clock, sy, 'rgba(255,245,200,.85)', 8);
    // the foam band seen through the glass
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillRect(-r * 1.2, sy - r * 0.05, r * 2.4, r * 0.2);
  },
  reef: (ctx, r, clock, sy) => fizz(ctx, r, clock, sy, 'rgba(255,240,200,.6)', 3),
  egypt: (ctx, r, clock, sy) => {
    fizz(ctx, r, clock, sy, 'rgba(255,255,255,.75)', 5);
    citrusWheel(ctx, r * 0.18, sy + r * 0.45, r * 0.2, '#f5d020', '#fff4a8');
  },
};

/* printed on an opaque cup */
const DECOR: Partial<Record<CupTheme, Fn>> = {
  // coffee mug: a warm brown band and a heart
  volcano: (ctx, r) => {
    ctx.fillStyle = '#c0703a'; ctx.fillRect(-r * 1.2, r * 0.5, r * 2.4, r * 0.12);
    heart(ctx, 0, r * 0.12, r * 0.2, '#e05050');
  },
  // teacup: a blue floral pattern and gold rim band
  cliffs: (ctx, r) => {
    ctx.fillStyle = '#e8c45a'; ctx.fillRect(-r * 1.2, MOUTH_Y * r + r * 0.08, r * 2.4, r * 0.06);
    for (const [x, y] of [[-0.35, 0.15], [0.3, 0.3], [0, 0.55]] as const) flower(ctx, x * r, y * r, r * 0.12);
  },
  // soda cup: red and white stripes and a star badge
  space: (ctx, r) => {
    ctx.fillStyle = '#e8384f';
    for (let i = -3; i <= 3; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.2 - r * 0.1, MOUTH_Y * r); ctx.lineTo(i * r * 0.2 + r * 0.1, MOUTH_Y * r);
      ctx.lineTo(i * r * 0.14 + r * 0.07, BASE_Y * r + r * 0.1); ctx.lineTo(i * r * 0.14 - r * 0.07, BASE_Y * r + r * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    star(ctx, 0, r * 0.2, r * 0.14, '#3a6fe0');
  },
};

/* over the finished cup */
const OVER: Partial<Record<CupTheme, Fn>> = {
  // root beer: foam spilling over the front lip
  mountains: (ctx, r) => {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(42,35,80,.35)'; ctx.lineWidth = 1;
    const my = MOUTH_Y * r;
    for (const [x, dy, s] of [[-0.7, 0.12, 0.17], [-0.35, 0.22, 0.2], [0.05, 0.25, 0.18], [0.45, 0.2, 0.2], [0.75, 0.1, 0.15]] as const) {
      ctx.beginPath(); ctx.arc(x * r, my + dy * r * 0.6, s * r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // one drip running down the glass
    ctx.beginPath(); ctx.ellipse(-0.42 * r, my + r * 0.42, r * 0.06, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  },
};

/* ------------------------------------------------------------ pieces */
function handle(ctx: CanvasRenderingContext2D, r: number, col: string, size: number): void {
  const top = MOUTH_Y * r + r * 0.18, bot = r * 0.5, x0 = halfAt(MOUTH_Y + 0.2) * r - r * 0.06;
  ctx.save();
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.bezierCurveTo(x0 + r * 0.55 * size, top - r * 0.05, x0 + r * 0.55 * size, bot + r * 0.05, x0 - r * 0.12, bot);
  };
  ctx.lineWidth = r * 0.26; ctx.strokeStyle = INK; path(); ctx.stroke();
  ctx.lineWidth = r * 0.15; ctx.strokeStyle = col; path(); ctx.stroke();
  ctx.restore();
}

function saucer(ctx: CanvasRenderingContext2D, r: number): void {
  const y = BASE_Y * r + r * 0.02;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, y, r * 1.05, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#e8c45a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, y, r * 0.9, r * 0.14, 0, 0, Math.PI); ctx.stroke();
}

function steam(ctx: CanvasRenderingContext2D, r: number, clock: number): void {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = r * 0.07;
  for (let i = 0; i < 3; i++) {
    const k = (clock * 0.45 + i / 3) % 1;
    const x = (i - 1) * r * 0.3, y0 = MOUTH_Y * r - r * 0.1 - k * r * 0.7;
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * Math.sin(k * Math.PI)})`;
    ctx.beginPath();
    for (let j = 0; j <= 8; j++) {
      const yy = y0 - j * r * 0.06, xx = x + Math.sin(j * 0.9 + clock * 2 + i) * r * 0.08;
      if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function straw(ctx: CanvasRenderingContext2D, r: number, xIn: number, lean: number, col: string): void {
  const x1 = xIn * r, y1 = MOUTH_Y * r + r * 0.25, x2 = x1 + lean * r, y2 = MOUTH_Y * r - r * 0.95;
  ctx.save(); ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.14; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = r * 0.08; ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([r * 0.08, r * 0.1]); ctx.strokeStyle = col;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function umbrella(ctx: CanvasRenderingContext2D, r: number, clock: number): void {
  const bx = -0.15 * r, by = MOUTH_Y * r + r * 0.1, tx = -0.45 * r, ty = MOUTH_Y * r - r * 0.85;
  ctx.save();
  ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.translate(tx, ty); ctx.rotate(-0.35 + Math.sin(clock * 1.2) * 0.04);
  const cols = ['#ff4f7a', '#ffd23a', '#3fc6ff', '#7cdc5a'];
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.38, Math.PI + (i / 4) * Math.PI, Math.PI + ((i + 1) / 4) * Math.PI);
    ctx.closePath(); ctx.fillStyle = cols[i]; ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.38, Math.PI, Math.PI * 2); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

function citrusWheel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, peel: string, flesh: string): void {
  ctx.save();
  ctx.fillStyle = peel; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = flesh;
  ctx.beginPath(); ctx.arc(x, y, s * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = peel; ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.78); ctx.stroke();
  }
  ctx.restore();
}

function iceCube(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(245,252,255,.9)'; ctx.strokeStyle = 'rgba(80,140,190,.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fillRect(-s * 0.3, -s * 0.3, s * 0.2, s * 0.2);
  ctx.restore();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, col: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function fizz(ctx: CanvasRenderingContext2D, r: number, clock: number, sy: number, col: string, n: number): void {
  ctx.fillStyle = col;
  const depth = BASE_Y * r - sy;
  for (let i = 0; i < n; i++) {
    const k = (clock * 0.35 + i / n) % 1;
    const x = (((i * 0.618) % 1) - 0.5) * r * 0.9;
    ctx.beginPath(); ctx.arc(x, BASE_Y * r - k * depth, r * (0.025 + 0.02 * ((i % 3) / 2)), 0, Math.PI * 2); ctx.fill();
  }
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.45, -s, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.45, -s, s, -s * 0.3, 0, s * 0.35);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#5b8be0';
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#f5d020';
  ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}
