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
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { BALL_PRICE, RAMP_PRICE } from '../managers/RewardManager';

const BALL_BUNDLES = [1, 10, 50];
const RAMP_BUNDLES = [1, 3, 10];

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
            Every drop costs one ball, win or lose. {BALL_PRICE} coins each.
          </p>
          <div className="buyrow">
            {BALL_BUNDLES.map(n => {
              const cost = rewards.ballCost(n);
              return (
                <button key={n} className="buybtn" id={`btn-buy-balls-${n}`}
                        disabled={!rewards.canAfford(cost)}
                        onClick={() => rewards.buyBalls(n)}>
                  <b><i className="pip" />{n}</b>
                  <span className="price"><i className="coin" />{cost}</span>
                </button>
              );
            })}
          </div>

          <h4>Spare ramps</h4>
          <p className="shopnote">
            Every level hands you its own ramps. A spare is one more, on any
            level, whenever you want it. {RAMP_PRICE} coins each.
          </p>
          <div className="buyrow">
            {RAMP_BUNDLES.map(n => {
              const cost = rewards.rampCost(n);
              return (
                <button key={n} className="buybtn" id={`btn-buy-ramps-${n}`}
                        disabled={!rewards.canAfford(cost)}
                        onClick={() => rewards.buyRamps(n)}>
                  <b><i className="rampmark" />{n}</b>
                  <span className="price"><i className="coin" />{cost}</span>
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
