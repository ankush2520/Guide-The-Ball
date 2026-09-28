/* ============================================================
   THE TOP BAR

   Four chips floating over the scene, in three balanced zones:

     ☰        coins  ●●○        Level 7
   (left)       (centre)        (right)

   ☰ opens the menu (MenuPanel) - shop, daily spin, star chest,
   challenge runs, how to play, sound. It carries a dot when
   there is something waiting in there (a spin, a chest).

   The tools used WHILE solving a board - Bouncy and Hint - are
   not up here: they float by the thumb (ToolButtons), and the
   ramps left ride on the caption at the bottom (Status).
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { LevelPill } from './LevelPill';
import { useCoinsHeld } from './coinsInFlight';

interface Props {
  onOpenMenu: () => void;
  onOpenLevels: () => void;
}

export function Hud({ onOpenMenu, onOpenLevels }: Props) {
  const { rewards, controller } = useGame();
  useGameVersion();
  const [, setTick] = useState(0);
  /* What the wallet HAS, minus what is still flying towards this chip - see
     coinsInFlight. */
  const coins = Math.max(0, rewards.coins - useCoinsHeld());

  /* The wheel's cooldown expires without the game changing, so the menu dot
     gets its own once-a-second nudge. */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const waiting = rewards.spinReady() || rewards.chestReady();

  return (
    <div className="hud">
      <div className="chips left">
        <button id="btn-menu" className="iconbtn menubtn" aria-label="Menu"
                title={waiting ? 'Menu - something is waiting for you' : 'Menu'}
                onClick={onOpenMenu}>
          <i className="burger" />
          {waiting && <i className="dot" />}
        </button>
      </div>
      <div className="chips centre">
        <div className="counter coins" title="Coins - spend them in the shop">
          <i className="coin" /><b id="coin-count">{coins}</b>
        </div>
        {/* THIS LEVEL'S balls, as pips: a full one per ball left, a hollow
            one per ball used. A count, not a currency - see ballsFor. */}
        <div className={'counter balls' + (controller.ballsLeft <= 0 ? ' empty' : '')
                        + (controller.challenge ? ' challenge' : '')}
             title={controller.challenge ? `Challenge Run: ${controller.ballsLeft} balls left`
                                         : `Balls left on this level: ${controller.ballsLeft}`} id="ball-count">
          {/* a Challenge Run's pool is too big for pips: a count instead */}
          {controller.challenge
            ? <><i className="pip" /><b>{controller.ballsLeft}</b></>
            : Array.from({ length: controller.ballsMax }, (_, i) => (
                <i key={i} className={'pip' + (i < controller.ballsLeft ? '' : ' used')} />
              ))}
        </div>
      </div>
      <div className="chips right">
        <LevelPill onOpen={onOpenLevels} />
      </div>
    </div>
  );
}
