/* ============================================================
   THE SHOP

   One direction only: coins buy balls, spare ramps and
   boosters, and nothing sells them back. That is what keeps the
   wallet legible - a coin is always worth exactly what this
   panel says.

   Bundles rather than a quantity stepper. A stepper is three
   taps and a sum before you learn the price; a row of bundles
   states the whole offer at a glance, and the ones you cannot
   afford say so by being disabled rather than by failing when
   pressed.

   The BOOSTER section is not here at all before level 21. It is
   not greyed out and it is not teased: an item the player has
   never seen on a board cannot be shopped for, and a locked row
   in a shop is just an advertisement. The wallet refuses the
   purchase as well - see buyBoosters - because a section that
   merely is not rendered is not a rule.

   The bundles and their prices live on RewardManager, not here.
   A shop that names its own quantities and asks the wallet to
   price them can drift from what the wallet will actually charge
   - and the discount is the whole point of the bulk rows, so the
   two must come from one table.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { BALL_PRICE, RAMP_PRICE, BOOSTER_PRICE, BOOSTER_UNLOCK_LEVEL,
         BALL_BUNDLES, RAMP_BUNDLES, BOOSTER_BUNDLES,
         type Bundle } from '../managers/RewardManager';

/* How much better than buying singles this row is, as whole percent. The
   bulk rows are only worth a second look if the saving is stated, and it is
   derived rather than written down so it cannot disagree with the price. */
function saving(b: Bundle, unit: number): number {
  return Math.round((1 - b.coins / (b.n * unit)) * 100);
}

export function ShopPanel({ onClose }: { onClose: () => void }) {
  const { rewards } = useGame();
  useGameVersion();

  return (
    <div className="overlay" id="shoppanel">
      <div className="card shopcard">
        <div className="big">Shop</div>
        <div className="sub" id="shop-coins">
          You have <b className="coinamt"><i className="coin" />{rewards.coins}</b> coins.
        </div>

        <div className="scroll">
          <h4>Balls</h4>
          <p className="shopnote">
            Every drop costs one ball, win or lose. {BALL_PRICE} coins each,
            and fewer the more you take.
          </p>
          <div className="buyrow">
            {BALL_BUNDLES.map(b => {
              const cost = rewards.ballCost(b.n);
              const off = saving(b, BALL_PRICE);
              return (
                <button key={b.n} className="buybtn" id={`btn-buy-balls-${b.n}`}
                        disabled={!rewards.canAfford(cost)}
                        onClick={() => rewards.buyBalls(b.n)}>
                  <b><i className="pip" />{b.n}</b>
                  <span className="price"><i className="coin" />{cost}</span>
                  {off > 0 && <span className="save">{off}% off</span>}
                </button>
              );
            })}
          </div>

          <h4>Spare ramps</h4>
          <p className="shopnote">
            Every level hands you its own ramps. A spare is one more, on any
            level, whenever you want it. {RAMP_PRICE} coins each, and fewer
            the more you take.
          </p>
          <div className="buyrow">
            {RAMP_BUNDLES.map(b => {
              const cost = rewards.rampCost(b.n);
              const off = saving(b, RAMP_PRICE);
              return (
                <button key={b.n} className="buybtn" id={`btn-buy-ramps-${b.n}`}
                        disabled={!rewards.canAfford(cost)}
                        onClick={() => rewards.buyRamps(b.n)}>
                  <b><i className="rampmark" />{b.n}</b>
                  <span className="price"><i className="coin" />{cost}</span>
                  {off > 0 && <span className="save">{off}% off</span>}
                </button>
              );
            })}
          </div>
          <p className="shopnote" id="shop-ramps">
            In your drawer: <b>{rewards.extraRamps}</b> spare
            ramp{rewards.extraRamps === 1 ? '' : 's'}.
          </p>

          {rewards.boostersUnlocked && (
            <>
              <h4 id="shop-boosters-head">Boosters</h4>
              <p className="shopnote">
                Place one on any board and it fires the ball along its arrow.
                You are only charged when a drop that actually <b>fires</b> one
                goes on to win - misses are free, and so is a win it had no
                part in. {BOOSTER_PRICE} coins each, and fewer the more you
                take.
              </p>
              <div className="buyrow">
                {BOOSTER_BUNDLES.map(b => {
                  const cost = rewards.boosterCost(b.n);
                  const off = saving(b, BOOSTER_PRICE);
                  return (
                    <button key={b.n} className="buybtn" id={`btn-buy-boosters-${b.n}`}
                            disabled={!rewards.canAfford(cost)}
                            onClick={() => rewards.buyBoosters(b.n)}>
                      <b><i className="boostmark" />{b.n}</b>
                      <span className="price"><i className="coin" />{cost}</span>
                      {off > 0 && <span className="save">{off}% off</span>}
                    </button>
                  );
                })}
              </div>
              <p className="shopnote" id="shop-boostercount">
                In your bag: <b>{rewards.extraBoosters}</b>
                {' '}booster{rewards.extraBoosters === 1 ? '' : 's'}.
              </p>
            </>
          )}
          {!rewards.boostersUnlocked && (
            <p className="shopnote" id="shop-boosters-locked">
              Boosters unlock at level {BOOSTER_UNLOCK_LEVEL}.
            </p>
          )}
        </div>

        <div className="row">
          <button id="btn-shop-close" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
