/* ============================================================
   THE WIN CARD

   Deliberately short. It used to spell out the try count, the
   ramp count, which star was missed and how to earn it, a
   ball bonus and the next level's number - five lines of prose
   over a board the player wants to get back to. Everything in
   it except the payout is either already on screen (the level
   number, the Next button) or explained once in the info panel
   (how the rating works).

   What is left is what the player came for: did I win, how well,
   and what did it pay. The payout is also the ANCHOR the coin
   flight launches from - see CoinFlight.

   The one thing added back is the bouncing ball above the title.
   It is not prose and it is not a number: it costs no reading,
   it holds the card's own height, and it is the BOARD's ball -
   now wearing how well you did on its face, so the rating lands
   twice: once countable in the stars, once as an expression -
   the white-to-gold one with the amber bloom - rather than the
   silvery mark the HUD counts spare balls with. Those are two
   different things and a win card is the worst place to confuse
   them: one is what you just did, the other is what it cost.
   ============================================================ */
import { useEffect, useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { Ads } from '../ads/Ads';
import { useAdOffer, useAdsReady } from '../ads/useAdOffer';
import { ChestBar } from './ChestPanel';
import { MIDGAME_FROM_LEVEL } from '../managers/RewardManager';

export function WinOverlay() {
  const { controller } = useGame();
  useGameVersion();
  const adsReady = useAdsReady();

  const [waiting, setWaiting] = useState(false);
  const card = controller.winCard;
  /* With no ad to choose, there is no choice to make: the clear is collected
     the moment the card is up, so its coins fly off the card into the counter
     like any other payout - instead of being paid silently on the way out. */
  useEffect(() => {
    if (!adsReady && card && !card.collected && card.coins > 0 && controller.phase === 'over')
      controller.collectWin(false);
  }, [adsReady, card, controller, controller.phase]);
  useAdOffer('double', controller.phase === 'over' && !!card && !card.collected && card.coins > 0
                       && adsReady);
  if (controller.phase !== 'over' || !card) return null;
  /* A first clear pays on a CHOICE: collect it, or watch an ad for double -
     two equal buttons. Replays pay nothing, so they go straight to the usual
     Replay / Next. */
  /* With no ad to offer (own site, adblock, unfilled), "Collect" would be a
     lone extra tap on every first clear - so the card goes straight to
     Replay / Next, and leaving it pays the plain amount (see setLevel). */
  const owed = !card.collected && card.coins > 0 && adsReady;
  /* NEXT: the one natural break an interstitial may use (Ads.midgame stops
     gameplay around it; the phase change after it starts gameplay again). */
  const next = async () => {
    if (controller.levels.level.id >= MIDGAME_FROM_LEVEL) {
      setWaiting(true);
      await Ads.midgame();
      setWaiting(false);
    }
    controller.nextLevel();
  };
  const settle = () => {
    setWaiting(true);
    window.setTimeout(() => setWaiting(false), 400);
  };
  const double = async () => {
    setWaiting(true);
    const ok = await Ads.rewarded('double');
    setWaiting(false);
    if (ok) { controller.collectWin(true); settle(); }
  };
  /* Collect swaps the pair for Replay / Next IN THE SAME PLACE, so the second
     tap of a double-tap would land on Replay and drop a ball. The new pair
     ignores taps for a moment after the swap. */
  const collect = () => { controller.collectWin(false); settle(); };

  return (
    <div className="overlay" id="overlay">
      <div className="card win" id="card">
        {/* Fixed height, and the ball moves only by transform, so the hop
            cannot shift a single row of the card under it.

            The face is worn on the BALL, as children of it, so the squash and
            stretch carry it: a grin that stayed rigid while the ball flattened
            under it would read as a sticker rather than as a face.

            How pleased it is, is the rating. `joy2`/`joy3` only ADD to the
            face below them, so the plain .dancer is already a whole, valid
            one-star face - a rating that somehow arrived outside 1-3 gets a
            quieter smile, never a broken one. */}
        <div className="dancefloor" aria-hidden="true">
          <i className="dancershade" />
          <i className={`dancer joy${card.stars}`}>
            <i className="eye l" /><i className="eye r" />
            <i className="cheek l" /><i className="cheek r" />
            <i className="mouth" />
          </i>
        </div>
        <div className="big" id="ov-title">
          {card.challenge?.done ? 'Challenge cleared!' : 'Target hit!'}
        </div>
        {card.challenge && (
          <div className="sub" id="ov-challenge">
            {card.challenge.done
              ? (card.challenge.skin ? 'A new ball skin is yours - wear it from the shop\'s Style tab.'
                                     : 'Every level in a row. Well played!')
              : `Challenge Run: level ${card.challenge.at} of ${card.challenge.of} · ${card.challenge.balls} balls left`}
          </div>
        )}
        <div className="stars" id="ov-stars">
          {[0, 1, 2].map(i => <i key={i} className={i < card.stars ? 'on' : ''}>&#9733;</i>)}
        </div>
        <div className="rewards" id="ov-rewards">
          {/* A REPLAY PAYS NOTHING - see coinsFor - so there is no chip to
              show, and a "+0" would be worse than none: it reads as a payout
              that failed rather than as a board already earned. The line that
              replaces it says which it is, once, where the number was. */}
          {card.coins > 0 ? (
            <span className="reward" id="ov-coins">
              <i className="coin" /><b>+{card.collected ? card.paid : card.coins}</b>
            </span>
          ) : (
            <span className="nopay" id="ov-nopay">Already earned &mdash; replays are practice</span>
          )}
          {/* The one thing on this card that went the other way. A spring is
              charged for by the win, so the win is where it has to be shown -
              a bag that is quietly one lighter afterwards reads as a bug. */}
          {card.springs > 0 && (
            <span className="reward spent" id="ov-springs" title="Springs used">
              <i className="springmark" /><b>&minus;{card.springs}</b>
            </span>
          )}
        </div>
        {/* Two choices, not three. Replay and Adjust both meant "stay on this
            level" and the difference between them - one re-drops for you, the
            other hands the board back to edit first - was too fine to be
            worth a third button on a card this short. */}
        <ChestBar small />
        {owed ? (
          <div className="row pair">
            <button id="btn-collect" disabled={waiting} onClick={collect}>
              Collect {card.coins}
            </button>
            {adsReady && (
              <button id="btn-collect-ad" disabled={waiting} onClick={double}>
                {waiting ? 'Loading ad…' : `Watch ad: collect ${card.coins * 2}`}
              </button>
            )}
          </div>
        ) : (
        <div className="row">
          <button id="btn-retry" disabled={waiting} onClick={() => controller.retry()}>Replay</button>
          {!card.isLast && (
            <button id="btn-next" className="primary" disabled={waiting} onClick={next}>Next</button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
