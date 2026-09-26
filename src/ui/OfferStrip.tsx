/* ============================================================
   THE OFFER STRIP

   A small bar over the bottom of the board, for help that only
   makes sense on THIS board right now - and that needs buttons,
   so it cannot be the flash (which is text, and goes away).

   Two offers, the first that applies:
   - a board that needs a spring, with none in the bag:
     [Shop] [Watch ad: get 1 spring];
   - "Stuck?" after restarting the same level entry twice:
     [Hint (ad)] [Spare ramp (ad)], dismissible, once per entry.
   Buttons side by side and the same
   size (CrazyGames: an ad button must never be bigger than the
   non-ad one beside it). The ad button hides where no ad can be
   shown; the reward is granted only on a watched ad.
   ============================================================ */
import { useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Ads } from '../ads/Ads';
import { useAdOffer } from '../ads/useAdOffer';

export function OfferStrip({ onShop }: { onShop: () => void }) {
  const { controller, levels, rewards } = useGame();
  useGameVersion();
  const [waiting, setWaiting] = useState(false);

  const needsSpring = !!levels.level.needsSpring && rewards.springsUnlocked
    && rewards.springs - levels.springsReserved <= 0;
  const live = controller.phase === 'plan' && !controller.intro && Ads.available();
  const stuck = live && !needsSpring && controller.stuckOffer;
  useAdOffer('spring', live && needsSpring);
  useAdOffer('hint', stuck && controller.hintAvailable);
  useAdOffer('spare', stuck && controller.sparesAllowed);
  if (controller.phase !== 'plan' || controller.intro) return null;

  /* an ad, then the reward - granted ONLY on a watched ad */
  const ad = (placement: string, reward: () => void) => async () => {
    setWaiting(true);
    const ok = await Ads.rewarded(placement);
    setWaiting(false);
    if (ok) reward();
  };

  if (!needsSpring) {
    if (!controller.stuckOffer || !Ads.available()) return null;
    const hint = controller.hintAvailable, spare = controller.sparesAllowed;
    if (!hint && !spare) return null;
    return (
      <div data-ui className="offerstrip" id="stuck-offer">
        <button className="offerclose" id="btn-stuck-close" aria-label="Dismiss"
                onClick={() => controller.dismissStuck()}>&times;</button>
        <span className="offertext">Stuck?</span>
        <div className="row pair">
          {hint && (
            <button id="btn-stuck-hint" disabled={waiting}
                    onClick={ad('hint', () => controller.showHint())}>Hint (ad)</button>
          )}
          {spare && (
            <button id="btn-stuck-spare" disabled={waiting}
                    onClick={ad('spare', () => { rewards.grantRamps(1, 'grant'); controller.dismissStuck(); })}>
              Spare ramp (ad)
            </button>
          )}
        </div>
      </div>
    );
  }
  const watch = ad('spring', () => rewards.grantSprings(1, 'grant'));

  return (
    <div data-ui className="offerstrip" id="spring-offer">
      <span className="offertext">This one needs a spring.</span>
      <div className="row pair">
        <button id="btn-offer-shop" onClick={onShop}>Shop</button>
        {Ads.available() && (
          <button id="btn-offer-spring-ad" disabled={waiting} onClick={watch}>
            {waiting ? 'Loading ad…' : 'Watch ad: get 1 spring'}
          </button>
        )}
      </div>
    </div>
  );
}
