/* ============================================================
   THE TOP BAR

   Three things, and nothing else: which level you are on, what
   you have left to spend on it, and the way out to settings.

   The level NAME leads. It used to trail its number as muted
   9pt flavour and was the first thing to be ellipsised; the
   city is what the player actually recognises a board by, so
   it now carries the type weight and "Level 12" is the eyebrow.

   The Try counter is gone. It counted something the player has
   no decision to make about - it is already restated on the win
   card, where it changes the star rating and therefore matters.

   The Ramps chip doubles as the spare-ramp button. It is the
   number a spare changes, so it is the place to spend one; the
   shop, which is where they are bought, is behind the gear.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';

interface Props {
  onOpenLevels: () => void;
  onOpenSettings: () => void;
}

export function Hud({ onOpenLevels, onOpenSettings }: Props) {
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

  const lv = levels.level;
  /* The gear carries the wheel's state, because a free spin nobody notices
     is a free spin nobody takes. Behind a gear it needs a louder signal than
     it did as its own button, not a quieter one. */
  const ready = rewards.spinReady();
  /* The spare-ramp drawer is only offered while it can actually be used: in
     planning, with something in it. */
  const spare = rewards.extraRamps > 0 && controller.phase === 'plan';

  return (
    <div className="hud">
      <button className="title" id="level-title" title="Choose a level" onClick={onOpenLevels}>
        <span className="lvnum">Level {lv.id}</span>
        <b className="lvname">{levels.cityName}</b>
      </button>
      <div className="chips">
        <div className="counter coins" title="Coins — spend them in the shop">
          <i className="coin" /><b id="coin-count">{rewards.coins}</b>
        </div>
        <div className={'counter balls' + (rewards.balls <= 0 ? ' empty' : '')} title="Balls left">
          <i className="pip" /><b id="ball-count">{rewards.balls}</b>
        </div>
        {/* Tappable only while there is a spare to spend and a board to spend
            it on. A chip that does nothing when pressed is worse than a chip
            that is plainly not a button. */}
        {spare ? (
          <button className="counter ramps spend" id="btn-use-ramp"
                  title={`Use a spare ramp (${rewards.extraRamps} left)`}
                  onClick={() => controller.useExtraRamp()}>
            Ramps <b id="ramps-left">{levels.rampsLeft}</b>
            <span className="spare">+{rewards.extraRamps}</span>
          </button>
        ) : (
          <div className="counter ramps" title="Ramps left to place">
            Ramps <b id="ramps-left">{levels.rampsLeft}</b>
          </div>
        )}
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
