/* The top bar: level title, the counters, and the icon buttons. */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Sound } from '../audio/Sound';

/** A coarse countdown for the topbar pill: hours, then minutes, then seconds. */
function fmtShort(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return Math.ceil(s / 3600) + 'h';
  if (s >= 60) return Math.ceil(s / 60) + 'm';
  return s + 's';
}

interface Props {
  onOpenLevels: () => void;
  onOpenInfo: () => void;
  onOpenSpin: () => void;
}

export function Hud({ onOpenLevels, onOpenInfo, onOpenSpin }: Props) {
  const { controller, levels, rewards } = useGame();
  useGameVersion();
  const [muted, setMuted] = useState(Sound.muted);
  const [, setTick] = useState(0);

  /* The wheel's countdown is the only thing on screen that changes without
     the game changing, so it gets its own once-a-second nudge. */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lv = levels.level;
  const ready = rewards.spinReady();

  return (
    <div className="hud">
      <button className="title" id="level-title" title="Choose a level" onClick={onOpenLevels}>
        Level {lv.id} <span>&mdash; {levels.cityName}</span>
      </button>
      <div className="chips">
        <div className={'counter balls' + (rewards.balls <= 0 ? ' empty' : '')} title="Balls left">
          <i className="pip" /><b id="ball-count">{rewards.balls}</b>
        </div>
        <div className="counter">Try <b id="try-count">{controller.tries}</b></div>
        <div className="counter">Ramps <b id="ramps-left">{levels.rampsLeft}</b></div>
        <button className="iconbtn" id="btn-info" title="What everything means"
                aria-label="Info" onClick={onOpenInfo}>?</button>
        <button id="btn-spin" className={'iconbtn spin' + (ready ? ' ready' : ' locked')}
                title="Daily spin" aria-label="Daily spin" onClick={onOpenSpin}>
          <i className="wheelicon" />
          {!ready && <b id="spin-cd">{fmtShort(rewards.msToSpin())}</b>}
        </button>
        <button className={'iconbtn' + (muted ? ' off' : '')} id="btn-sound"
                title="Sound on/off" aria-label="Sound on/off"
                onClick={e => { setMuted(Sound.toggle()); e.stopPropagation(); }}>
          {muted ? '\u{1F507}' : '\u{1F50A}'}
        </button>
      </div>
    </div>
  );
}
