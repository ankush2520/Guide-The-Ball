/* Running out is a real stop, so unlike a miss this one does get the
   full-screen treatment. */
import { useGame, useGameVersion } from '../core/GameContext';
import { AD_REWARD, BALL_PRICE, BALL_BUNDLES, bestBuy } from '../managers/RewardManager';

interface Props { onClose: () => void; onSpin: () => void; onShop: () => void; }

export function NoBallsPanel({ onClose, onSpin, onShop }: Props) {
  const { rewards } = useGame();
  useGameVersion();          // the offer below is priced off a live wallet
  /* Priced through the BUNDLES, not the list price. A stranded player is
     being told what their wallet is worth, and since the shop's bulk rows
     hand over more balls per coin than the single, dividing by the list price
     quotes them a number the shop then beats - which reads as a bug in the
     shop rather than a bargain. */
  const afford = bestBuy(BALL_BUNDLES, rewards.coins);

  return (
    <div className="overlay" id="noballs">
      <div className="card">
        <div className="big nb">Out of balls</div>
        <div className="sub">
          Every drop costs one ball. Spend coins on more, clear a level to earn
          coins, or spin the daily wheel.
        </div>
        {/* TODO: replace with the real rewarded-ad call before submission -
            CrazyGames is window.CrazyGames.SDK.ad.requestAd('rewarded') and
            Poki is PokiSDK.rewardedBreak(); both report whether the player
            actually watched it, and the balls must only be granted if they did. */}
        <div className="row">
          <button id="btn-ad" className="primary"
                  onClick={() => { rewards.grant(AD_REWARD, 'ad'); onClose(); }}>
            Watch Ad for +{AD_REWARD} Balls
          </button>
        </div>
        {rewards.spinReady() && (
          <div className="row"><button id="btn-nb-spin" onClick={onSpin}>Spin the daily wheel</button></div>
        )}
        {/* The shop is the FIRST way out now that coins exist, so it is worth
            saying up front how many balls the player can already afford. */}
        <div className="row">
          <button id="btn-buy" disabled={afford < 1} onClick={onShop}>
            {afford < 1 ? `Buy Balls — need ${BALL_PRICE} coins`
                        : `Buy Balls — ${rewards.coins} coins buys ${afford}`}
          </button>
        </div>
        {/* Full peer of the other two, deliberately. CrazyGames prohibits
            buttons sized to encourage ads, and a glowing ad button over a
            bare text link is exactly that shape. */}
        <div className="row"><button id="btn-nb-close" onClick={onClose}>Not now</button></div>
      </div>
    </div>
  );
}
