/* Everything, always available, with whatever is on the board you are
   currently looking at called out. */
import { useGame, useGameVersion } from '../core/GameContext';
import { GLOSSARY } from './glossary';
import { STARTING_BALLS, CLEAR_BONUS, AD_REWARD, STARTING_COINS,
         BALL_PRICE, RAMP_PRICE, COIN_CLEAR } from '../managers/RewardManager';

export function InfoPanel({ onClose }: { onClose: () => void }) {
  const { levels } = useGame();
  useGameVersion();
  const lv = levels.level;

  return (
    <div className="overlay" id="infopanel">
      <div className="card infocard">
        <div className="big">How to play</div>
        <div className="info scroll" id="info-body">
          <h4>The basics</h4>
          <p>Drag anywhere on the board to draw a ramp, then press <b>Drop Ball</b>.
             You never steer the ball - you set the board up beforehand and watch
             it play out.</p>
          <p>Tap a ramp you have placed to select it: drag either end to reshape it,
             drag the middle to move it, or hit the <b>&times;</b> to delete it.
             <b> Undo</b> and <b>Clear</b> work on the whole set. Missing costs you
             nothing but the ball - your ramps stay put so the next go is an
             adjustment, not a rebuild.</p>

          <h4>On the board</h4>
          {GLOSSARY.map(g => (
            <div key={g.cls} className={'iline' + (g.has(lv) ? ' here' : '')}>
              <span className={'sw ' + g.cls} />
              <span><b>{g.name}</b><span className="d">{g.long}</span></span>
            </div>
          ))}

          <h4>Balls</h4>
          <p>Every drop costs one ball, whether it wins or loses. Moving between
             levels is free.</p>
          <p>You start with <b>{STARTING_BALLS}</b>. Clearing a level for the first
             time ever pays a bonus that grows through the game
             (+{CLEAR_BONUS[0]} early, up to +{CLEAR_BONUS[CLEAR_BONUS.length - 1]} late),
             the ad button on the out-of-balls screen pays +{AD_REWARD}, and you can
             buy more with coins.</p>

          <h4>Coins</h4>
          <p><b>Every</b> level you clear pays coins &mdash; more for more stars, and
             more the deeper you are ({COIN_CLEAR[0][0]}&ndash;{COIN_CLEAR[0][2]} early,
             up to {COIN_CLEAR[COIN_CLEAR.length - 1][0]}&ndash;
             {COIN_CLEAR[COIN_CLEAR.length - 1][2]} late). Replaying a level you have
             already cleared pays a quarter of that. You start with
             <b>{STARTING_COINS}</b>, and the daily wheel pays coins too.</p>
          <p>Coins are spent in the <b>shop</b>, behind the gear:
             <b>{BALL_PRICE}</b> coins a ball, <b>{RAMP_PRICE}</b> coins a spare ramp.
             Nothing converts back the other way.</p>

          <h4>Spare ramps</h4>
          <p>Every level hands you its own ramp budget, and that never changes. A
             <b>spare</b> is one extra ramp you own outright and can spend on any
             level, whenever you want: tap the <b>Ramps</b> counter to put one on
             the board you are looking at.</p>
          <p>A spare is spent the moment you tap, and it does not follow you to the
             next level. Spares never count toward the star for coming in under the
             budget &mdash; that is always measured against the ramps the level itself
             gave you, so a spare can buy you a solution but never a star.</p>

          <h4>Level rating</h4>
          <p>Separate from the gold star pickups. Clearing a level earns one to
             three <b>&#9733;</b>: you start at three, lose one for needing a second
             try and another past three tries, and win one back for clearing it
             under the ramp budget. A scrappy but efficient solve can still reach
             three.</p>
        </div>
        <div className="row"><button id="btn-info-close" className="primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
