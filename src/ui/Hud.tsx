/* ============================================================
   THE TOP BAR

   Three columns, and the middle one is the star:

     coins  balls  |  [ + ]  |  bag  settings

   THE + BUTTON is the game's one action before the drop, so it
   is drawn like a character rather than a control: big, round,
   gold, straddling the bar, breathing and ringing until every
   ramp this board allows is down. One tap puts a ramp on the
   board - no popup - and its badge counts what is left. With
   the level's ramps gone it spends a spare from the drawer; with
   no spares either it goes quiet and a tap opens the shop.

   The level number rides in the gap between the + and the bag
   (LevelPill) - the bar's one piece of spare width - and opens
   the level picker. It used to be a pill under the board; that
   row is gone and the board has its height.

   The bag beside the settings gear is the full inventory. It
   only holds straight ramps today, but it is where curved ramps
   and boosters will be picked from.

   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { LevelPill } from './LevelPill';

interface Props {
  onOpenSettings: () => void;
  onOpenItems: () => void;
  onOpenShop: () => void;
  onOpenLevels: () => void;
}

export function Hud({ onOpenSettings, onOpenItems, onOpenShop, onOpenLevels }: Props) {
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
  const empty = left <= 0 && spare <= 0;
  // loud while there is a ramp to place; quiet once the board is set
  const calling = planning && left > 0;
  const coached = controller.tutorialStep() === 'add';

  const add = () => {
    if (empty) { onOpenShop(); return; }
    controller.placeItem('ramp');
  };

  return (
    <div className="hud">
      <div className="chips left">
        <div className="counter coins" title="Coins — spend them in the shop">
          <i className="coin" /><b id="coin-count">{rewards.coins}</b>
        </div>
        <div className={'counter balls' + (rewards.balls <= 0 ? ' empty' : '')} title="Balls left">
          <i className="pip" /><b id="ball-count">{rewards.balls}</b>
        </div>
      </div>

      <button id="btn-add-ramp"
              className={'addramp' + (calling ? ' calling' : '') + (empty ? ' empty' : '')
                         + (coached ? ' coached' : '')}
              aria-label={empty ? 'No ramps left — get more in the shop'
                                : `Add a ramp (${left} left${spare ? `, ${spare} spare` : ''})`}
              title={empty ? 'No ramps left — get more in the shop' : 'Add a ramp'}
              disabled={!planning}
              onClick={add}>
        <span className="plusink"><i className="plus" /></span>
        <b className="addcount" id="ramps-left">{left}</b>
        {spare > 0 && <span className="addspare" id="ramps-spare">+{spare}</span>}
      </button>

      <div className="chips right">
        <LevelPill onOpen={onOpenLevels} />
        <button id="btn-inventory" className="iconbtn bag"
                title="Items" aria-label="Items"
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
