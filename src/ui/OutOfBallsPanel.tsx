/* ============================================================
   OUT OF BALLS

   This level's balls are used up. Two ways on, and they are
   PEERS - the same size and weight, side by side. CrazyGames
   prohibits buttons sized to steer players toward an ad, and a
   glowing ad button over a small "restart" is exactly that shape.

   - Watch an ad: +3 balls, the board exactly as it is.
   - Restart the level: free and instant, a clean board.

   Restart is never followed by an ad: failing must never cost a
   forced one. Where no ad can be shown, restart is the only way.
   ============================================================ */
import { useState } from 'react';
import { useGame } from '../core/GameContext';
import { Ads } from '../ads/Ads';
import { useAdOffer, useAdsReady } from '../ads/useAdOffer';
import { CONTINUE_BALLS } from '../managers/RewardManager';

export function OutOfBallsPanel({ onClose }: { onClose: () => void }) {
  const { controller } = useGame();
  const adsReady = useAdsReady();
  const [waiting, setWaiting] = useState(false);
  useAdOffer('continue', adsReady);

  const watch = async () => {
    setWaiting(true);
    const ok = await Ads.rewarded('continue');
    setWaiting(false);
    if (!ok) return;                 // no reward unless it was watched to the end
    controller.continueLevel();
    onClose();
  };
  const restart = () => { controller.restartLevel(); onClose(); };

  return (
    <div className="overlay" id="noballs">
      <div className="card">
        <div className="big nb">Out of balls</div>
        <div className="sub">
          That was the last ball for this level. Start it fresh, or keep your
          ramps and carry on.
        </div>
        <div className="row pair">
          {adsReady && (
            <button id="btn-continue-ad" disabled={waiting} onClick={watch}>
              {waiting ? 'Loading ad…' : `Watch ad: +${CONTINUE_BALLS} balls (keep your ramps)`}
            </button>
          )}
          <button id="btn-restart" disabled={waiting} onClick={restart}>Restart level</button>
        </div>
      </div>
    </div>
  );
}
