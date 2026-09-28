/* ============================================================
   THE TOOLS BY THE THUMB

   Two round buttons floating in the board's bottom-right
   corner - the things used WHILE solving a board, one tap away:

   - HINT (lightbulb): only on a board with a proven hint, not
     yet shown. The first hint in the game is free; after that,
     one watched ad each. With no ad to show, only the free one.
   - BOUNCY (trampoline + count): tap, then draw a ramp - that
     ramp is a trampoline. Glows while armed; tap again to put it
     back. From level 10 on.

   `data-ui` and real <button>s, so a press here belongs to the
   button and never reaches the board under it (GameCanvas).
   ============================================================ */
import { useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Ads } from '../ads/Ads';
import { useAdOffer, useAdsReady } from '../ads/useAdOffer';

export function ToolButtons() {
  const { rewards, controller } = useGame();
  useGameVersion();
  const adsReady = useAdsReady();
  const planning = controller.phase === 'plan';

  const [hintBusy, setHintBusy] = useState(false);
  const hintFree = !rewards.freeHintUsed;
  const hintShown = planning && controller.hintAvailable && (hintFree || adsReady);
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

  const bouncyOn = controller.itemUnlocked('spring');
  const bouncyLeft = controller.itemCount('spring').left;

  if (!hintShown && !bouncyOn) return null;
  return (
    <div className="tools" data-ui>
      {hintShown && (
        <button id="btn-hint" className="toolbtn hintbtn" disabled={hintBusy} onClick={takeHint}
                title={hintFree ? 'Hint - your first one is free' : 'Hint - watch an ad'}
                aria-label="Hint">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z"
                  fill="#ffd23f" stroke="#2a2350" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M9.5 19h5M10.2 21.5h3.6" stroke="#2a2350" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {hintFree && <i className="dot" />}
        </button>
      )}
      {bouncyOn && (
        <button id="btn-bouncy" className={'toolbtn bouncybtn' + (controller.armedSpring ? ' armed' : '')}
                title="Bouncy ramp - tap, then draw a ramp. It throws the ball 4x harder."
                aria-label={`Bouncy ramp, ${bouncyLeft} left`} aria-pressed={controller.armedSpring}
                disabled={!planning || (!controller.armedSpring && bouncyLeft <= 0)}
                onClick={() => controller.toggleBouncy()}>
          <i className="springmark" />
          <b className="badge" id="bouncy-count">{bouncyLeft}</b>
        </button>
      )}
    </div>
  );
}
