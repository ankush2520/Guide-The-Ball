/* ============================================================
   THE SHOP

   One direction only: coins buy balls and spare ramps, and
   nothing sells them back. That is what keeps the wallet legible
   - a coin is always worth exactly what this panel says.

   Bundles rather than a quantity stepper. A stepper is three
   taps and a sum before you learn the price; a row of bundles
   states the whole offer at a glance, and the ones you cannot
   afford say so by being disabled rather than by failing when
   pressed.

   The bundles and their prices live on RewardManager, not here.
   A shop that names its own quantities and asks the wallet to
   price them can drift from what the wallet will actually charge
   - and the discount is the whole point of the bulk rows, so the
   two must come from one table.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { BALL_PRICE, RAMP_PRICE, BALL_BUNDLES, RAMP_BUNDLES,
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
        </div>

        <div className="row">
          <button id="btn-shop-close" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
