/* ============================================================
   THE MENU - behind the ☰ in the top bar

   Everything that is not the board, in one drawer that slides
   in from the left (the side its button is on): the shop, the
   daily spin, the star chest, how to play,
   and sound. Each row says its state in a word - "Ready!",
   "18 / 30 ★" - so a player can tell what is waiting in there
   without opening every one.

   Tapping the dimmed game beside it, or ×, closes it.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Sound } from '../audio/Sound';
import { STARS_PER_CHEST } from '../managers/RewardManager';

/** "23h 41m" */
function fmtLong(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

interface Props {
  onClose: () => void;
  onOpenShop: () => void;
  onOpenSpin: () => void;
  onOpenChest: () => void;
  onOpenInfo: () => void;
}

export function MenuPanel({ onClose, onOpenShop, onOpenSpin, onOpenChest, onOpenInfo }: Props) {
  const { rewards } = useGame();
  useGameVersion();
  const [muted, setMuted] = useState(Sound.muted);
  const [, setTick] = useState(0);
  // the spin countdown is the one thing in here that moves on its own
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const spin = rewards.spinReady();
  const chest = rewards.chestReady();
  /* each row opens its panel ON TOP of the menu, so closing it lands back here */
  const row = (id: string, icon: string, title: string, sub: string, onClick: () => void,
               hot = false) => (
    <button id={id} className={'menurow' + (hot ? ' hot' : '')} onClick={onClick}>
      <i className={'menuicon ' + icon} />
      <span className="menulabel"><b>{title}</b><span className="d">{sub}</span></span>
      <span className="chev" aria-hidden="true">›</span>
    </button>
  );

  return (
    <div className="overlay menulay" id="menupanel"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="menudrawer" role="dialog" aria-label="Menu">
        <div className="menuhead">
          <div className="big">Menu</div>
          <button id="btn-menu-close" className="menuclose" aria-label="Close menu" onClick={onClose}>&times;</button>
        </div>
        <div className="menurows">
          {row('btn-shop', 'mi-shop', 'Shop', `${rewards.coins} coins`, onOpenShop)}
          {row('btn-spin', 'mi-spin', 'Daily spin', spin ? 'Ready!' : `Next in ${fmtLong(rewards.msToSpin())}`, onOpenSpin, spin)}
          {row('btn-chest', 'mi-chest', 'Star chest',
               chest ? 'Ready to open!' : `${rewards.chestProgress} / ${STARS_PER_CHEST} ★`,
               onOpenChest, chest)}
          {row('btn-info', 'mi-info', 'How to play', 'Rules, pieces and stars', onOpenInfo)}
          <button id="btn-sound" className={'menurow' + (muted ? ' off' : '')}
                  onClick={e => { setMuted(Sound.toggle()); e.stopPropagation(); }}>
            <i className="menuicon mi-sound" />
            <span className="menulabel"><b>Sound</b><span className="d">{muted ? 'Off' : 'On'}</span></span>
            <span className="chev" aria-hidden="true">{muted ? '\u{1F507}' : '\u{1F50A}'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
