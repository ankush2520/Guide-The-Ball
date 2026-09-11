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
        <div className="row">
          <button id="btn-retry" onClick={() => controller.retry()}>Replay</button>
          <button id="btn-adjust" onClick={() => controller.adjust()}>Adjust</button>
          {!card.isLast && (
            <button id="btn-next" className="primary" onClick={() => controller.nextLevel()}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
