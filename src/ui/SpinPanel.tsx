/* ============================================================
   THE PRIZE WHEEL

   Painted once into its own canvas and then rotated with a CSS
   transform, which the compositor can do on its own thread - the
   board's rAF loop is never asked to animate the wheel as well.

   The result is COMMITTED to storage before the wheel starts
   turning, so closing the tab mid-animation cannot be used to
   re-roll a bad prize. See RewardManager.beginSpin().
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../core/GameContext';
import { flyReward } from './CoinFlight';
import { SPIN_PRIZES, SPIN_MS, JACKPOT_COINS,
         prizeValue, prizeLabel } from '../managers/RewardManager';

const WHEEL_R = 106;

function fmtLong(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Rotating the wheel by R puts local angle `aim` under the pointer exactly
    when aim + R is a whole turn, so R must be congruent to -aim. */
function spinTarget(ix: number, from: number, jitter: number): number {
  const n = SPIN_PRIZES.length, segDeg = 360 / n;
  const aim = ix * segDeg + segDeg / 2 + jitter * (segDeg * 0.32);
  const want = (((-aim) % 360) + 360) % 360;
  let target = from + 5 * 360;                  // always at least five turns on
  target += (((want - (target % 360)) % 360) + 360) % 360;
  return target;
}

/* ============================================================
   THE WEDGE PALETTE

   Colour by CURRENCY, not by position. Alternating two navies
   made the wheel one shape repeated eight times and told the
   player nothing; this way the three prize types are three
   families, and which kind a wedge pays is legible from across
   the board before the numeral is.

   The order the prizes ship in already alternates kinds, so
   neighbouring wedges contrast without any extra work. The two
   runs of the same kind get the darker shade of their family
   (`alt`), so no two identical slices ever sit side by side.
   ============================================================ */
const PALETTE: Record<'coins' | 'balls' | 'ramps', [string, string][]> = {
  // amber gold - the hub currency
  coins: [['#ffd76b', '#d98b0c'], ['#ffc44f', '#b9700a']],
  // pearl, the colour of the ball mark in the HUD - and pointedly not a
  // second gold, which is what a coin wedge and a ball wedge used to be
  balls: [['#eceffb', '#8b8fb4'], ['#dfe3f5', '#767aa2']],
  // the ramp's own cyan, straight off the board
  ramps: [['#7fe0ff', '#1c86c4'], ['#6bd6fb', '#146ea6']],
};
// the jackpots get a brighter, hotter gold than any ordinary coin wedge
const JACKPOT: [string, string] = ['#fff3c4', '#f0a80e'];

function wedgeColours(kind: 'coins' | 'balls' | 'ramps',
                      jackpot: boolean, i: number): [string, string] {
  if (jackpot) return JACKPOT;
  return PALETTE[kind][i % 2];
}

/* The three units, drawn the way the HUD draws them: a disc with a rim for a
   coin, a plain disc for a ball, a short blue bar for a ramp. Every wedge is
   light now, so all three are inked dark rather than switching on jackpot.
   Inked flat, the rim is the ONLY thing separating the first two - which is
   why the HUD's marks carry it too, rather than leaning on colour. */
function drawUnit(g: CanvasRenderingContext2D, kind: 'coins' | 'balls' | 'ramps',
                  x: number, y: number): void {
  g.save();
  g.fillStyle = 'rgba(28,16,2,.72)';
  if (kind === 'ramps') {
    g.translate(x, y); g.rotate(-0.35);
    g.beginPath(); g.roundRect(-9, -2.5, 18, 5, 2.5); g.fill();
  } else {
    g.beginPath(); g.arc(x, y, kind === 'coins' ? 5.5 : 4.5, 0, Math.PI * 2); g.fill();
    if (kind === 'coins') {
      // a coin reads as a coin, not a ball, because it has a rim
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke();
    }
  }
  g.restore();
}

export function SpinPanel({ onClose }: { onClose: () => void }) {
  const { rewards } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* The wheel's angle, whether a spin is in flight, and the prize just won
     all live on RewardManager - see the note there. This component only
     mirrors them into a render. */
  const [, setTick] = useState(0);
  const deg = rewards.wheelDeg;
  const spinning = rewards.spinning;
  const won = rewards.spinShown;

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const g = el.getContext('2d')!;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    el.width = Math.round(WHEEL_R * 2 * dpr);
    el.height = Math.round(WHEEL_R * 2 * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, WHEEL_R * 2, WHEEL_R * 2);
    g.translate(WHEEL_R, WHEEL_R);

    const n = SPIN_PRIZES.length, seg = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) {
      /* wedge 0 starts at twelve o'clock and they run clockwise, which is the
         frame the landing maths above is written in */
      const a0 = -Math.PI / 2 + i * seg, a1 = a0 + seg;
      /* "Jackpot" is a question about VALUE, not about a ball count: the wheel
         pays three different things, and only coins compare them. */
      const jackpot = prizeValue(SPIN_PRIZES[i]) >= JACKPOT_COINS;
      const [c0, c1] = wedgeColours(SPIN_PRIZES[i].kind, jackpot, i);
      const fill = g.createRadialGradient(0, 0, WHEEL_R * 0.12, 0, 0, WHEEL_R);
      fill.addColorStop(0, c0);
      fill.addColorStop(1, c1);
      g.fillStyle = fill;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, WHEEL_R - 3, a0, a1); g.closePath(); g.fill();

      /* A sheen over the outer half of each wedge. It is what stops eight
         flat colour slices reading as a pie chart rather than a prize wheel. */
      const sheen = g.createRadialGradient(0, 0, WHEEL_R * 0.45, 0, 0, WHEEL_R);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(255,255,255,.16)');
      g.fillStyle = sheen;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, WHEEL_R - 3, a0, a1); g.closePath(); g.fill();

      g.strokeStyle = 'rgba(255,255,255,.30)'; g.lineWidth = 1.5; g.stroke();

      /* The prize reads along the wedge's spoke. Wedges in the bottom half
         would come out upside down, so those get another half turn and their
         text mirrored back across the hub - the number still sits further out
         than its unit either way. */
      let rot = a0 + seg / 2 + Math.PI / 2;
      const wrapped = Math.atan2(Math.sin(rot), Math.cos(rot));
      const flip = Math.abs(wrapped) > Math.PI / 2;
      if (flip) rot += Math.PI;
      const dir = flip ? 1 : -1;
      const prize = SPIN_PRIZES[i];
      g.save();
      g.rotate(rot);
      g.textAlign = 'center';
      /* 150 needs more room than 3 does, so the big numbers step down a size
         rather than growing the wheel or spilling over the wedge's edges. */
      const fs = prize.n >= 100 ? 21 : 26;
      g.font = `800 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      // a shadow under the numeral, so it holds on every wedge colour
      g.fillStyle = 'rgba(0,0,0,.38)';
      g.fillText(String(prize.n), 0, dir * WHEEL_R * 0.58 + 1.5);
      g.fillStyle = '#ffffff';
      g.fillText(String(prize.n), 0, dir * WHEEL_R * 0.58);
      /* A MARK rather than the word: eight wedges of text all converge on the
         hub and become an unreadable ring. Each mark is the one the HUD uses
         for the same thing, so the unit is obvious without spelling it out. */
      drawUnit(g, prize.kind, 0, dir * WHEEL_R * 0.36);
      g.restore();
    }

    /* The rim: a gold band with a ring of lights around it, which is what
       says "prize wheel" before a single wedge has been read. */
    g.strokeStyle = 'rgba(255,201,60,.9)'; g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, WHEEL_R - 2.5, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, WHEEL_R - 5.5, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < n * 2; k++) {
      const a = -Math.PI / 2 + (k + 0.5) * (Math.PI * 2 / (n * 2));
      const lx = Math.cos(a) * (WHEEL_R - 2.5), ly = Math.sin(a) * (WHEEL_R - 2.5);
      const bulb = g.createRadialGradient(lx, ly, 0, lx, ly, 4);
      bulb.addColorStop(0, '#fff8dc');
      bulb.addColorStop(1, 'rgba(255,214,120,.15)');
      g.fillStyle = bulb;
      g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fill();
    }
  }, []);

  const ready = rewards.spinReady() && !spinning;

  const doSpin = () => {
    if (!ready) return;
    const ix = rewards.beginSpin();     // committed to storage before it turns
    rewards.wheelDeg = spinTarget(ix, rewards.wheelDeg, Math.random() * 2 - 1);
    setTick(t => t + 1);
    window.setTimeout(() => {
      rewards.settleSpin(ix);
      setTick(t => t + 1);
      /* The prize flies out of the wheel and into whichever counter now holds
         it - the same journey a level's payout makes off the win card. */
      flyReward(SPIN_PRIZES[ix].kind, '.wheelwrap');
    }, SPIN_MS);
  };

  const sub = won
    ? `You won ${prizeLabel(won.kind, won.n)}!`
    : spinning ? 'Spinning…'
    : ready ? 'One free spin every 24 hours.'
    : `Next spin in ${fmtLong(rewards.msToSpin())}.`;

  return (
    <div className="overlay" id="spinpanel">
      <div className="card spincard">
        <div className="big sp">Daily Spin</div>
        <div className="sub" id="spin-sub">{sub}</div>
        <div className="wheelwrap">
          <canvas id="wheel" ref={canvasRef} aria-label="Prize wheel"
                  style={{ transform: `rotate(${deg}deg)`,
                           transition: spinning
                             ? `transform ${SPIN_MS}ms cubic-bezier(.16,.84,.28,1)`
                             : 'none' }} />
          <div className="wheelptr" />
          <div className="wheelhub" />
        </div>
        <div className="row">
          <button id="btn-spin-go" className="primary" disabled={!ready} onClick={doSpin}>Spin</button>
          <button id="btn-spin-close" disabled={spinning} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
