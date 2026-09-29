/* ============================================================
   A STAR CHEST, OPENING

   The gift's own reveal - the wrapped box shakes, the lid comes
   off - reused for the chest that every STARS_PER_CHEST stars
   earn. The chest is claimed (and paid) the moment the panel
   opens, so closing mid-animation cannot lose it or re-roll it;
   the animation is only the telling. "Take it" flies each prize
   into its counter.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { flyReward } from './CoinFlight';
import { prizeLabel, STARS_PER_CHEST, type ChestContents } from '../managers/RewardManager';
import { Sound } from '../audio/Sound';

const SHAKE_MS = 620, OPEN_MS = 460;

export function ChestPanel({ onClose }: { onClose: () => void }) {
  const { rewards } = useGame();
  useGameVersion();
  const [beat, setBeat] = useState<'wrap' | 'open' | 'shown'>('wrap');
  const [chest, setChest] = useState<ChestContents | null>(null);
  const claimed = useRef(false);
  /* Opened from the menu before 30 stars: show progress, claim nothing. */
  const [ready] = useState(() => rewards.chestReady());

  /* Claimed ONCE (the ref survives StrictMode's double effect run), and the
     reveal's timers are their own effect so a re-run restarts them rather
     than leaving the lid shut. */
  useEffect(() => {
    if (claimed.current || !ready) return;
    claimed.current = true;
    setChest(rewards.claimChest());
  }, [rewards]);
  useEffect(() => {
    if (!ready) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setBeat('shown'); return; }
    const a = window.setTimeout(() => { setBeat('open'); Sound.coin(1); }, SHAKE_MS);
    const b = window.setTimeout(() => { setBeat('shown'); Sound.coin(2); }, SHAKE_MS + OPEN_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [ready]);

  if (!ready) {
    const left = STARS_PER_CHEST - rewards.chestProgress;
    return (
      <div className="overlay giftlay" id="chestpanel"
           onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="card giftcard locked">
          <div className="big">Star chest</div>
          <div className="sub">Earn {left} more {left === 1 ? 'star' : 'stars'} to open it.</div>
          <div className="giftbox" aria-hidden="true">
            <i className="gbbody" />
            <i className="gbtie" />
            <i className="gblid" />
            <i className="gbbow" />
          </div>
          <ChestBar />
          <div className="row">
            <button id="btn-chest-ok" className="primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    );
  }
  if (!chest) return null;
  const take = () => {
    flyReward('coins', '#chest-prizes');
    if (chest.springs) flyReward('springs', '#chest-prizes');
    if (chest.ramps) flyReward('ramps', '#chest-prizes');
    onClose();
  };

  return (
    <div className="overlay giftlay" id="chestpanel">
      <div className={`card giftcard ${beat}`}>
        <div className="big">Star chest {chest.n}!</div>
        <div className="sub">One for every {STARS_PER_CHEST} stars you earn.</div>
        <div className="giftbox" aria-hidden="true">
          <i className="gbglow" />
          <i className="gbprize flycoin" />
          <i className="gbbody" />
          <i className="gbtie" />
          <i className="gblid" />
          <i className="gbbow" />
        </div>
        <div className="rewards" id="chest-prizes">
          <span className="reward"><i className="flycoin" /><b>{beat === 'shown' ? prizeLabel('coins', chest.coins) : '???'}</b></span>
          {beat === 'shown' && chest.springs > 0 && (
            <span className="reward"><i className="flyspring" /><b>{prizeLabel('springs', chest.springs)}</b></span>
          )}
          {beat === 'shown' && chest.ramps > 0 && (
            <span className="reward"><i className="flyramp" /><b>{prizeLabel('ramps', chest.ramps)}</b></span>
          )}
          {beat === 'shown' && chest.cosmetic && (
            <span className="reward" id="chest-cosmetic"><b>New style unlocked!</b></span>
          )}
        </div>
        <div className="row">
          <button id="btn-chest-take" className="primary" disabled={beat !== 'shown'} onClick={take}>Take it</button>
        </div>
      </div>
    </div>
  );
}

/** "18 / 30 ★" toward the next chest - the level picker's and the win card's. */
export function ChestBar({ small = false }: { small?: boolean }) {
  const { rewards } = useGame();
  const per = STARS_PER_CHEST;
  const have = rewards.chestProgress;
  return (
    <div className={'chestbar' + (small ? ' small' : '')} id={small ? 'win-chestbar' : 'chestbar'}
         title={`Every ${STARS_PER_CHEST} stars opens a star chest`}>
      <i className="chesticon" aria-hidden="true" />
      <span className="track"><i style={{ width: `${Math.round(100 * have / per)}%` }} /></span>
      <b>{have} / {per} &#9733;</b>
    </div>
  );
}
