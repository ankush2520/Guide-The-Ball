/* ============================================================
   THE SHOP

   One direction only: coins buy spare ramps and springs, and
   nothing sells them back. Balls are not sold - every level
   hands out its own (RewardManager.ballsFor). That is what keeps the
   wallet legible - a coin is always worth exactly what this
   panel says.

   Bundles rather than a quantity stepper. A stepper is three
   taps and a sum before you learn the price; a row of bundles
   states the whole offer at a glance, and the ones you cannot
   afford say so by being disabled rather than by failing when
   pressed.

   The SPRING section is not here at all before level 10. It is
   not greyed out and it is not teased: an item the player has
   never seen on a board cannot be shopped for, and a locked row
   in a shop is just an advertisement. The wallet refuses the
   purchase as well - see buySprings - because a section that
   merely is not rendered is not a rule.

   The bundles and their prices live on RewardManager, not here.
   A shop that names its own quantities and asks the wallet to
   price them can drift from what the wallet will actually charge
   - and the discount is the whole point of the bulk rows, so the
   two must come from one table.
   ============================================================ */
import { useState } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { COSMETICS, type Cosmetic, type CosmeticKind } from '../cosmetics/cosmetics';
import { RAMP_PRICE, SPRING_PRICE, SPRING_UNLOCK_LEVEL,
         RAMP_BUNDLES, SPRING_BUNDLES,
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
  /* Two tabs: the items that help you solve boards, and STYLE - looks only,
     the coin sink with nothing to do with winning. */
  const [tab, setTab] = useState<'items' | 'style'>('items');

  return (
    <div className="overlay" id="shoppanel">
      <div className="card shopcard">
        <div className="big">Shop</div>
        <div className="sub" id="shop-coins">
          You have <b className="coinamt"><i className="coin" />{rewards.coins}</b> coins.
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" id="tab-items" className={tab === 'items' ? 'on' : ''}
                  aria-selected={tab === 'items'} onClick={() => setTab('items')}>Items</button>
          <button role="tab" id="tab-style" className={tab === 'style' ? 'on' : ''}
                  aria-selected={tab === 'style'} onClick={() => setTab('style')}>Style</button>
        </div>

        {tab === 'style' ? <StyleTab /> : (
        <div className="scroll">
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

          {rewards.springsUnlocked && (
            <>
              <h4 id="shop-springs-head">Springs</h4>
              <p className="shopnote">
                A brass coil that fits onto a ramp <b>you</b> drew and makes it
                throw <b>four times harder</b>. You are only charged when a drop
                that actually <b>bounces off</b> one goes on to win - misses are
                free, and so is a win it had no part in.
                {' '}{SPRING_PRICE} coins each, and fewer the more you take.
              </p>
              <div className="buyrow">
                {SPRING_BUNDLES.map(b => {
                  const cost = rewards.springCost(b.n);
                  const off = saving(b, SPRING_PRICE);
                  return (
                    <button key={b.n} className="buybtn" id={`btn-buy-springs-${b.n}`}
                            disabled={!rewards.canAfford(cost)}
                            onClick={() => rewards.buySprings(b.n)}>
                      <b><i className="springmark" />{b.n}</b>
                      <span className="price"><i className="coin" />{cost}</span>
                      {off > 0 && <span className="save">{off}% off</span>}
                    </button>
                  );
                })}
              </div>
              <p className="shopnote" id="shop-springcount">
                In your bag: <b>{rewards.springs}</b>
                {' '}spring{rewards.springs === 1 ? '' : 's'}.
              </p>
            </>
          )}
          {!rewards.springsUnlocked && (
            <p className="shopnote" id="shop-springs-locked">
              Springs unlock at level {SPRING_UNLOCK_LEVEL}.
            </p>
          )}
        </div>
        )}

        <div className="row">
          <button id="btn-shop-close" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   THE STYLE TAB

   Ball skins, trail colours and ramp colours - looks only. Each
   tile shows its swatch and what tapping it does: buy (coins),
   wear (owned), wearing, or "chest only" for the ones only star
   chests hand out.
   ============================================================ */
const KINDS: { kind: CosmeticKind; title: string }[] = [
  { kind: 'ball', title: 'Ball skins' },
  { kind: 'trail', title: 'Trails' },
  { kind: 'ramp', title: 'Ramp colours' },
];

function Swatch({ c }: { c: Cosmetic }) {
  if (c.kind === 'ball')
    return <i className="swatch ball" style={{ background:
      `radial-gradient(circle at 35% 30%, ${c.colors[0]}, ${c.colors[1]} 45%, ${c.colors[2]})` }} />;
  if (c.kind === 'trail')
    return <i className="swatch trail" style={{ background: c.colors[0] === 'rainbow'
      ? 'linear-gradient(90deg,#ff5f6d,#ffc371,#47e891,#4aa3ff,#b57cff)'
      : `linear-gradient(90deg, transparent, ${c.colors[0]})` }} />;
  return <i className="swatch ramp" style={{ background: c.colors[0] }} />;
}

function StyleTab() {
  const { rewards } = useGame();
  return (
    <div className="scroll" id="shop-style">
      {KINDS.map(({ kind, title }) => (
        <div key={kind}>
          <h4>{title}</h4>
          <div className="stylegrid">
            {COSMETICS.filter(c => c.kind === kind).map(c => {
              const owned = rewards.ownsCosmetic(c.id);
              const worn = rewards.cosmeticsSelected[kind] === c.id;
              const label = worn ? 'Wearing' : owned ? 'Wear'
                : c.price === null ? (typeof c.from === 'object' ? 'Challenge Run' : 'Chest only') : `${c.price}`;
              const can = worn ? false : owned ? true : c.price !== null && rewards.canAfford(c.price);
              return (
                <button key={c.id} id={`style-${c.id}`} className={'styletile' + (worn ? ' worn' : '')}
                        disabled={!can && !worn} aria-pressed={worn}
                        onClick={() => { if (worn) return;
                                         if (owned) rewards.selectCosmetic(c.id); else rewards.buyCosmetic(c.id); }}>
                  <Swatch c={c} />
                  <b>{c.name}</b>
                  <span className="price">
                    {!owned && c.price !== null && <i className="coin" />}{label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
