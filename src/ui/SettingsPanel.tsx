/* ============================================================
   SETTINGS

   The three things that are not the game - the daily wheel, the
   reference panel, and the mute - used to sit in the topbar as
   three icons. They cost the HUD more width than they were
   worth: the board is the product, and every pixel the chrome
   takes is a pixel the board does not get.

   They live behind one gear now. The wheel is the exception
   worth caring about - a free spin the player never notices is
   a free spin they never take - so the gear itself carries the
   "ready" pulse, and the row inside restates it in words.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Sound } from '../audio/Sound';

/** The long form, for a row that has the width for it: "23h 41m". */
function fmtLong(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

interface Props {
  onClose: () => void;
  onOpenInfo: () => void;
  onOpenShop: () => void;
  onOpenSpin: () => void;
}

export function SettingsPanel({ onClose, onOpenInfo, onOpenShop, onOpenSpin }: Props) {
  const { rewards } = useGame();
  useGameVersion();
  const [muted, setMuted] = useState(Sound.muted);
  const [, setTick] = useState(0);

  /* The countdown is the only thing in here that moves on its own. */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ready = rewards.spinReady();

  return (
    <div className="overlay" id="settingspanel">
      <div className="card setcard">
        <div className="big">Settings</div>

        <div className="setrows">
          <button id="btn-spin" className={'setrow' + (ready ? ' ready' : ' locked')}
                  title="Daily spin" onClick={onOpenSpin}>
            <i className="wheelicon" />
            <span className="setlabel">
              <b>Daily spin</b>
              <span className="d">{ready ? 'A free spin is waiting for you'
                                         : 'One free spin every day'}</span>
            </span>
            <em id="spin-cd">{ready ? 'Ready' : fmtLong(rewards.msToSpin())}</em>
          </button>

          <button id="btn-shop" className="setrow" title="Spend your coins"
                  onClick={onOpenShop}>
            <i className="coin" />
            <span className="setlabel">
              <b>Shop</b>
              <span className="d">Buy balls and spare ramps</span>
            </span>
            <em><i className="coin" />{rewards.coins}</em>
          </button>

          <button id="btn-info" className="setrow" title="What everything means"
                  onClick={onOpenInfo}>
            <i className="seticon">?</i>
            <span className="setlabel">
              <b>How to play</b>
              <span className="d">Rules, pieces and star ratings</span>
            </span>
            <em>Open</em>
          </button>

          <button id="btn-sound" className={'setrow' + (muted ? ' off' : '')}
                  title="Sound on/off"
                  onClick={e => { setMuted(Sound.toggle()); e.stopPropagation(); }}>
            <i className="seticon">{muted ? '\u{1F507}' : '\u{1F50A}'}</i>
            <span className="setlabel">
              <b>Sound</b>
              <span className="d">Music and effects</span>
            </span>
            <em>{muted ? 'Off' : 'On'}</em>
          </button>
        </div>

        <div className="row">
          <button id="btn-settings-close" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
