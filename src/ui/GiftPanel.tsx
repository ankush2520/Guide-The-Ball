/* ============================================================
   THE GIFT IN THE TARGET

   The second flavour of mystery box, and the only one that gets
   a panel. The chest on the board is opened MID-DROP, with the
   ball still flying and the run still to finish, so its whole
   feedback is a burst and a mark flying out of it - stopping the
   board for a modal there would interrupt the thing the player
   is watching. This one is opened BY THE WIN, when the board has
   already gone quiet and there is nothing to interrupt. So it
   gets the beat: a wrapped box, a shake, a lid that comes off,
   and the prize underneath.

   IT GOES FIRST, AND ALONE. The win card is held back by the
   controller while this is up (see GameController.gift), which
   also holds back the confetti and the payout flight, because
   all three key off the card. Two celebrations at once is two
   celebrations nobody reads.

   The REWARD is credited by collectGift(), and the mark flies
   from this panel's own prize chip into the counter that now
   holds it - the same flight the chest and the wheel use, for
   the same reason: a number that is simply different next time
   you look at the HUD is a number nobody saw arrive.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { flyReward } from './CoinFlight';
import { prizeLabel } from '../managers/RewardManager';
import { Sound } from '../audio/Sound';

/* The beats, in ms from open. Shake, then the lid leaves, then the prize is
   on screen and the button is live - deliberately short enough that a player
   who has seen it twenty times is never waiting for it. */
const SHAKE_MS = 620;
const OPEN_MS = 460;
const REVEAL_AT = SHAKE_MS + OPEN_MS;

/* Which mark each prize wears, and where its name comes from. The marks are
   the HUD's own, so a coin in here is the coin in the counter it flies to. */
const MARK: Record<string, string> = {
  coins: 'flycoin', ramps: 'flyramp',
  springs: 'flyspring', spin: 'flyspin',
};

export function GiftPanel() {
  const { controller } = useGame();
  useGameVersion();
  const gift = controller.gift;
  /* 'wrap' -> 'open' -> 'shown'. Kept here rather than on the controller: it
     is the animation's own clock and nothing outside this panel has any
     business reading it. */
  const [beat, setBeat] = useState<'wrap' | 'open' | 'shown'>('wrap');
  /* Which gift this panel has already run its timers for, so a re-render
     during the reveal cannot restart it. */
  const ran = useRef<object | null>(null);

  useEffect(() => {
    if (!gift || ran.current === gift) return;
    ran.current = gift;
    setBeat('wrap');
    /* Reduced motion gets the answer, not the performance: straight to the
       revealed state with no shake and no lid. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBeat('shown');
      return;
    }
    const a = window.setTimeout(() => { setBeat('open'); Sound.coin(1); }, SHAKE_MS);
    const b = window.setTimeout(() => { setBeat('shown'); Sound.coin(2); }, REVEAL_AT);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [gift]);

  if (!gift) return null;

  /* The flight leaves BEFORE the panel goes: collectGift() unmounts this, and
     flyReward reads the chip's position at the moment it is called. */
  const take = () => {
    flyReward(gift.kind, '#gift-prize');
    controller.collectGift();
  };

  return (
    <div className="overlay giftlay" id="giftpanel">
      <div className={`card giftcard ${beat}`}>
        <div className="big" id="gift-title">A gift in the target!</div>
        <div className="sub">It was sitting inside all along.</div>

        {/* THE BOX. Three pieces - lid, body, ribbon - so the lid can leave on
            its own while the body stays put, which is what reads as opening
            rather than as one picture being swapped for another. The prize
            sits behind them and is revealed by the lid, not faded in. */}
        <div className="giftbox" aria-hidden="true">
          <i className="gbglow" />
          <i className={`gbprize ${MARK[gift.kind]}`} />
          <i className="gbbody" />
          <i className="gbtie" />
          <i className="gblid" />
          <i className="gbbow" />
        </div>

        {/* The name of what was in it, and the anchor the flight launches
            from. Present from the start so the card never changes height. */}
        <div className="rewards" id="gift-rewards">
          <span className="reward" id="gift-prize">
            <i className={MARK[gift.kind]} />
            <b>{beat === 'shown' ? prizeLabel(gift.kind, gift.n) : '???'}</b>
          </span>
        </div>

        <div className="row">
          <button id="btn-gift-take" className="primary"
                  disabled={beat !== 'shown'} onClick={take}>
            {gift.kind === 'spin' ? 'Take the token' : 'Take it'}
          </button>
        </div>
      </div>
    </div>
  );
}
