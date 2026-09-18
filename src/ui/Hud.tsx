/* ============================================================
   THE TOP BAR

   Two clusters, and nothing in the middle:

     coins  balls  ramps  |  Level 7 ▾  bag  settings

   THE + IS GONE. It existed to hand out a fixed-length ramp,
   and ramps are drawn by hand again - a drag across the board
   is the ramp - so there is nothing left for a spawn button to
   do. What it was carrying on its badge, the ramps left on this
   board, moved to a chip of its own beside the coins and the
   balls: it is a COUNT, and the bar already had two.

   The BAG is the inventory tray: everything the player owns and
   can place, which today means boosters. It is deliberately not
   the shop - buying is behind the gear, and the tray links
   across to it.

   The level number rides between the two clusters and opens the
   level picker.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { LevelPill } from './LevelPill';

interface Props {
  onOpenSettings: () => void;
  onOpenItems: () => void;
  onOpenLevels: () => void;
}

export function Hud({ onOpenSettings, onOpenItems, onOpenLevels }: Props) {
  const { levels, rewards, controller } = useGame();
  useGameVersion();
  const [, setTick] = useState(0);

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
  const left = levels.rampsLeft, spare = rewards.extraRamps;
  /* The walkthrough is asking for a ramp to be drawn: the counter is what
     says how many the board will take, so it is what leans in. */
  const coached = controller.tutorialStep() === 'draw';

  return (
    <div className="hud">
      <div className="chips left">
        <div className="counter coins" title="Coins — spend them in the shop">
          <i className="coin" /><b id="coin-count">{rewards.coins}</b>
        </div>
        <div className={'counter balls' + (rewards.balls <= 0 ? ' empty' : '')} title="Balls left">
          <i className="pip" /><b id="ball-count">{rewards.balls}</b>
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
