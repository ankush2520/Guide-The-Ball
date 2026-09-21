/* Everything, always available, with whatever is on the board you are
   currently looking at called out. */
import { useGame, useGameVersion } from '../core/GameContext';
import { GLOSSARY } from './glossary';
import { STARTING_BALLS, CLEAR_BONUS, AD_REWARD, STARTING_COINS,
         BALL_PRICE, RAMP_PRICE, SPRING_PRICE, SPRING_UNLOCK_LEVEL,
         COIN_CLEAR } from '../managers/RewardManager';

export function InfoPanel({ onClose }: { onClose: () => void }) {
  const { levels } = useGame();
  useGameVersion();
  /* The PLAY level, so anything the player has just put down is marked as
     being on this board - which it is. */
  const lv = levels.playLevel;

  return (
    <div className="overlay" id="infopanel">
      <div className="card infocard">
        <div className="big">How to play</div>
        <div className="info scroll" id="info-body">
          <h4>The basics</h4>
          <p><b>Drag across the board to draw a ramp.</b> Where you press is one
             end, where you let go is the other - so one drag sets where it is,
             how long it is and which way it points. Then <b>tap</b> empty board
             to drop the ball. You never steer the ball: you set the board up
             beforehand and watch it play out.</p>
          <p>A drag draws, a tap drops, and neither can be the other. The counter
             at the top left says how many ramps this board will take. The
             <b>bag</b> beside the level number holds the items you own.</p>
          <p>Tap a ramp you have placed to select it: drag the middle to move it,
             drag either end to reshape it, or hit the <b>&times;</b> to take it
             back. Missing costs you nothing but the ball - your ramps stay put so
             the next go is an adjustment, not a rebuild.</p>

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
          <p>Clearing a level pays coins the <b>first time you beat it</b> &mdash;
             more for more stars, and more the deeper you are
             ({COIN_CLEAR[0][0]}&ndash;{COIN_CLEAR[0][2]} early, up to
             {COIN_CLEAR[COIN_CLEAR.length - 1][0]}&ndash;
             {COIN_CLEAR[COIN_CLEAR.length - 1][2]} late). Replaying a board you have
             already cleared pays nothing: a drop costs a ball, so a board you can
             already beat would otherwise print money. Replays are for a better
             star rating. You start with <b>{STARTING_COINS}</b>, and the daily
             wheel pays coins too.</p>
          <p>Coins are spent in the <b>shop</b>, behind the gear:
             <b>{BALL_PRICE}</b> coins a ball, <b>{RAMP_PRICE}</b> coins a spare ramp,
             and both come cheaper by the bundle. Nothing converts back the
             other way.</p>

          <h4>Spare ramps</h4>
          <p>Every level hands you its own ramp budget, and that never changes. A
             <b>spare</b> is one extra ramp you own outright, and it is spent
             automatically: once a board's own ramps are gone, the next one you
             draw comes out of the drawer. The <b>+N</b> on the ramps counter is
             what is in there.</p>
          <p>A spare is spent by a ramp you actually keep - a drag too short to
             become one costs nothing - and it does not follow you to the next
             level. Spares never count toward the star for coming in under the
             budget &mdash; that is always measured against the ramps the level
             itself gave you, so a spare can buy you a solution but never a star.</p>

          <h4>Springs</h4>
          <p>From level <b>{SPRING_UNLOCK_LEVEL}</b> you can carry your own
             <b> springs</b>, and the first one is free. A spring does not go on
             the board &mdash; it goes on a <b>ramp you drew</b>. Draw the ramp
             first, then open the bag, tap the spring, and tap that ramp.</p>
          <p>It is a <b>brass coil</b>, and the ramp still bounces the ball
             exactly the way it always did &mdash; the angle you drew it at is
             the angle the ball mirrors off. What the spring adds is
             <b>speed</b>: the ball comes off that ramp <b>four times faster</b>
             than it went in, which no ordinary ramp can do, since every normal
             bounce loses a little. That is the one thing it is for, and it is
             why a few boards late in the game cannot be solved without one.</p>
          <p>A spring is only taken out of your bag if the ball actually
             <b> bounces off</b> it and that drop <b>wins</b>. Fit it, miss,
             move the ramp, drop again as often as you like &mdash; it costs
             nothing until it works. More are <b>{SPRING_PRICE}</b> coins each
             in the shop.</p>

          <h4>Mystery boxes</h4>
          <p>Some boards carry a <b>chest</b>. Hit it with the ball on the way
             past and it pays out something random: coins, balls, a spare ramp,
             occasionally a spring or a free spin of the wheel. It never
             changes where the ball goes, so it is always worth routing through
             if you can.</p>
          <p>Each chest can be opened <b>once</b>, and it stays opened &mdash;
             replaying the level shows the empty outline where it was.</p>
          <p>A few targets have a <b>present sitting inside them</b>. Land in one
             and the gift is unwrapped for you before the win card, and it pays
             the same kinds of prize a chest does. Once only, like a chest -
             clear that board again and the target is empty.</p>

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
