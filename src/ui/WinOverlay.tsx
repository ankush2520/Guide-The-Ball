/* The win card. Only a WIN reaches here - a miss is handled by the flash
   line, which keeps the player on the board. */
import { useGame, useGameVersion } from '../core/GameContext';

export function WinOverlay() {
  const { controller } = useGame();
  useGameVersion();

  const card = controller.winCard;
  if (controller.phase !== 'over' || !card) return null;

  let sub = card.isLast ? 'That was the last level for now.'
                        : `On to level ${card.nextId}.`;
  if (card.bonus > 0)
    sub = `First clear: +${card.bonus} ball${card.bonus === 1 ? '' : 's'}. ${sub}`;

  return (
    <div className="overlay" id="overlay">
      <div className="card win" id="card">
        <div className="big" id="ov-title">Target hit!</div>
        <div className="stars" id="ov-stars">
          {[0, 1, 2].map(i => <i key={i} className={i < card.stars ? 'on' : ''}>&#9733;</i>)}
        </div>
        <div className="starnote" id="ov-starnote">{card.note}</div>
        {/* The takings, next to the stars that set them - three stars pays
            roughly double one, and that is only legible if the two are read
            together. */}
        <div className="payout" id="ov-coins">
          <i className="coin" /><b>+{card.coins}</b> coins
        </div>
        <div className="sub" id="ov-sub">{sub}</div>
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
