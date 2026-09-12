/* ============================================================
   THE WIN CARD

   Deliberately short. It used to spell out the try count, the
   ramp count, which star was missed and how to earn it, the
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
import { useGame, useGameVersion } from '../core/GameContext';

export function WinOverlay() {
  const { controller } = useGame();
  useGameVersion();

  const card = controller.winCard;
  if (controller.phase !== 'over' || !card) return null;

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
        <div className="big" id="ov-title">Target hit!</div>
        <div className="stars" id="ov-stars">
          {[0, 1, 2].map(i => <i key={i} className={i < card.stars ? 'on' : ''}>&#9733;</i>)}
        </div>
        <div className="rewards" id="ov-rewards">
          <span className="reward" id="ov-coins">
            <i className="coin" /><b>+{card.coins}</b>
          </span>
          {card.bonus > 0 && (
            <span className="reward" id="ov-balls" title="First clear bonus">
              <i className="pip" /><b>+{card.bonus}</b>
            </span>
          )}
        </div>
        {/* Two choices, not three. Replay and Adjust both meant "stay on this
            level" and the difference between them - one re-drops for you, the
            other hands the board back to edit first - was too fine to be
            worth a third button on a card this short. */}
        <div className="row">
          <button id="btn-retry" onClick={() => controller.retry()}>Replay</button>
          {!card.isLast && (
            <button id="btn-next" className="primary" onClick={() => controller.nextLevel()}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
