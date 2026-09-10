/* Running out is a real stop, so unlike a miss this one does get the
   full-screen treatment. */
import { useGame } from '../core/GameContext';
import { AD_REWARD } from '../managers/RewardManager';

interface Props { onClose: () => void; onSpin: () => void; }

export function NoBallsPanel({ onClose, onSpin }: Props) {
  const { rewards } = useGame();

  return (
    <div className="overlay" id="noballs">
      <div className="card">
        <div className="big nb">Out of balls</div>
        <div className="sub">
          Every drop costs one ball. Clear a level for the first time to earn
          more, or spin the daily wheel.
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
        <div className="row"><button id="btn-buy" disabled>Buy Balls &mdash; Coming Soon</button></div>
        {/* Full peer of the other two, deliberately. CrazyGames prohibits
            buttons sized to encourage ads, and a glowing ad button over a
            bare text link is exactly that shape. */}
        <div className="row"><button id="btn-nb-close" onClick={onClose}>Not now</button></div>
      </div>
    </div>
  );
}
