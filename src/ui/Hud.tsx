/* ============================================================
   THE TOP BAR

   Two clusters, and nothing in the middle:

     coins  ●●○  ramps  |  Level 7 ▾  bag  settings

   THE + IS GONE. It existed to hand out a fixed-length ramp,
   and ramps are drawn by hand again - a drag across the board
   is the ramp - so there is nothing left for a spawn button to
   do. What it was carrying on its badge, the ramps left on this
   board, moved to a chip of its own beside the coins and the
   ball pips: it is a COUNT, and the bar already had two.

   The BAG is the inventory tray: everything the player owns and
   can place, which today means springs. It is deliberately not
   the shop - buying is behind the gear, and the tray links
   across to it.

   The level number rides between the two clusters and opens the
   level picker.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { LevelPill } from './LevelPill';
import { useCoinsHeld } from './coinsInFlight';
import { Ads } from '../ads/Ads';
import { useAdOffer } from '../ads/useAdOffer';

interface Props {
  onOpenSettings: () => void;
  onOpenItems: () => void;
  onOpenLevels: () => void;
}

export function Hud({ onOpenSettings, onOpenItems, onOpenLevels }: Props) {
  const { levels, rewards, controller } = useGame();
  useGameVersion();
  const [, setTick] = useState(0);
  /* What the wallet HAS, minus what is still flying towards this chip. The
     ledger is credited the instant a payout is recorded; the number here
     climbs as the coins arrive, so the flight is the payment rather than a
     decoration over one that already happened. See coinsInFlight. */
  const coins = Math.max(0, rewards.coins - useCoinsHeld());

  /* The wheel's cooldown is the only thing up here that expires without the
     game changing, so the gear gets its own once-a-second nudge. Without it
     a spin that came due mid-level would not light up until the next drop. */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /* The gear carries the wheel's state, because a free spin nobody notices
     is a free spin nobody takes. */
  const ready = rewards.spinReady();
  const planning = controller.phase === 'plan';
  /* spares are not offered at all on the first levels - see sparesAllowed */
  const left = levels.rampsLeft, spare = controller.sparesAllowed ? rewards.extraRamps : 0;
  /* The walkthrough is asking for a ramp to be drawn: the counter is what
     says how many the board will take, so it is what leans in. */
  const coached = controller.tutorialStep() === 'draw';
  /* THE HINT BUTTON: only on a board that has a proven hint, not yet shown.
     The first hint in the game is free - it teaches the feature - and every
     one after that is a watched ad. With no ad to show, only the free one. */
  const [hintBusy, setHintBusy] = useState(false);
  const hintFree = !rewards.freeHintUsed;
  const hintShown = planning && controller.hintAvailable && (hintFree || Ads.available());
  useAdOffer('hint', hintShown && !hintFree);
  const takeHint = async () => {
    if (hintFree) {
      rewards.freeHintUsed = true;
      rewards.saveProgress();
      controller.showHint();
      return;
    }
    setHintBusy(true);
    const ok = await Ads.rewarded('hint');
    setHintBusy(false);
    if (ok) controller.showHint();
  };

  return (
    <div className="hud">
      <div className="chips left">
        <div className="counter coins" title="Coins — spend them in the shop">
          <i className="coin" /><b id="coin-count">{coins}</b>
        </div>
        {/* THIS LEVEL'S balls, as pips: a full one per ball left, a hollow
            one per ball used. A count, not a currency - see ballsFor. */}
        <div className={'counter balls' + (controller.ballsLeft <= 0 ? ' empty' : '')}
             title={`Balls left on this level: ${controller.ballsLeft}`} id="ball-count">
          {Array.from({ length: controller.ballsMax }, (_, i) => (
            <i key={i} className={'pip' + (i < controller.ballsLeft ? '' : ' used')} />
          ))}
        </div>
        {/* Ramps LEFT ON THIS BOARD, plus the spares in the drawer, which are
            spent automatically once the board's own run out. Dimmed at zero
            rather than hidden: "you have none" is the thing a player needs to
            read when a drag stops drawing. */}
        <div className={'counter ramps' + (left <= 0 && spare <= 0 ? ' empty' : '')
                        + (coached ? ' coached' : '')}
             title="Ramps left on this board">
          <i className="rampmark" /><b id="ramps-left">{left}</b>
          {spare > 0 && <span className="spare" id="ramps-spare">+{spare}</span>}
        </div>
      </div>

      <div className="chips right">
        <LevelPill onOpen={onOpenLevels} />
        {hintShown && (
          <button id="btn-hint" className="iconbtn hintbtn" disabled={hintBusy} onClick={takeHint}
                  title={hintFree ? 'Hint - your first one is free' : 'Hint - watch an ad'}
                  aria-label="Hint">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z"
                    fill="#ffd23f" stroke="#2a2350" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9.5 19h5M10.2 21.5h3.6" stroke="#2a2350" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {hintFree && <i className="dot" />}
          </button>
        )}
        <button id="btn-inventory" className="iconbtn bag"
                title="Items you own" aria-label="Items you own"
                disabled={!planning} onClick={onOpenItems}>
          <i className="bagicon" />
        </button>
        <button id="btn-settings" className={'iconbtn gear' + (ready ? ' ready' : ' locked')}
                title={ready ? 'Settings — a daily spin is ready' : 'Settings'}
                aria-label="Settings" onClick={onOpenSettings}>
          <i className="gearicon" />
          {ready && <i className="dot" />}
        </button>
      </div>
    </div>
  );
}
