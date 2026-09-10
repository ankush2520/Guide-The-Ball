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
import { SPIN_PRIZES, SPIN_MS } from '../managers/RewardManager';

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
      const jackpot = SPIN_PRIZES[i].balls >= 5;
      const fill = g.createRadialGradient(0, 0, WHEEL_R * 0.15, 0, 0, WHEEL_R);
      if (jackpot) { fill.addColorStop(0, '#ffe6a8'); fill.addColorStop(1, '#e0a020'); }
      else if (i % 2) { fill.addColorStop(0, '#2b3560'); fill.addColorStop(1, '#1a2142'); }
      else { fill.addColorStop(0, '#33406f'); fill.addColorStop(1, '#222a52'); }
      g.fillStyle = fill;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, WHEEL_R - 3, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1.5; g.stroke();

      /* The prize reads along the wedge's spoke. Wedges in the bottom half
         would come out upside down, so those get another half turn and their
         text mirrored back across the hub - the number still sits further out
         than its unit either way. */
      let rot = a0 + seg / 2 + Math.PI / 2;
      const wrapped = Math.atan2(Math.sin(rot), Math.cos(rot));
      const flip = Math.abs(wrapped) > Math.PI / 2;
      if (flip) rot += Math.PI;
      const dir = flip ? 1 : -1;
      g.save();
      g.rotate(rot);
      g.textAlign = 'center';
      g.fillStyle = jackpot ? '#3a2600' : '#ffffff';
      g.font = '800 26px ui-sans-serif, system-ui, -apple-system, sans-serif';
      g.fillText(String(SPIN_PRIZES[i].balls), 0, dir * WHEEL_R * 0.58);
      /* A pip rather than the word "balls": eight wedges of text all converge
         on the hub and become an unreadable ring. The pip is the same gold
         circle the HUD counter uses, so the unit is obvious without a word. */
      g.beginPath();
      g.arc(0, dir * WHEEL_R * 0.36, 4.5, 0, Math.PI * 2);
      g.fillStyle = jackpot ? 'rgba(58,38,0,.85)' : '#ffc451';
      g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(255,201,60,.75)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, WHEEL_R - 2.5, 0, Math.PI * 2); g.stroke();
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
    }, SPIN_MS);
  };

  const sub = won > 0
    ? `You won ${won} ball${won === 1 ? '' : 's'}!`
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
