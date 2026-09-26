/* ============================================================
   THE OFFER STRIP

   A small bar over the bottom of the board, for help that only
   makes sense on THIS board right now - and that needs buttons,
   so it cannot be the flash (which is text, and goes away).

   Today: a board that needs a spring, with none in the bag -
   [Shop] [Watch ad: get 1 spring], side by side and the same
   size (CrazyGames: an ad button must never be bigger than the
   non-ad one beside it). The ad button hides where no ad can be
   shown; the reward is granted only on a watched ad.
   ============================================================ */
import { useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Ads } from '../ads/Ads';

export function OfferStrip({ onShop }: { onShop: () => void }) {
  const { controller, levels, rewards } = useGame();
  useGameVersion();
  const [waiting, setWaiting] = useState(false);

  const needsSpring = !!levels.level.needsSpring && rewards.springsUnlocked
    && rewards.springs - levels.springsReserved <= 0;
  if (!needsSpring || controller.phase !== 'plan' || controller.intro) return null;

  const watch = async () => {
    setWaiting(true);
    const ok = await Ads.rewarded('spring');
    setWaiting(false);
    if (ok) rewards.grantSprings(1, 'grant');
  };

  return (
    <div className="offerstrip" id="spring-offer">
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
