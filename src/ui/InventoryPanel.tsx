/* ============================================================
   THE INVENTORY

   The full list of what can be put on the board, opened from
   the bag in the top bar. Tapping an item closes the popup on a
   board with that item already placed and selected - the next
   drag moves it, a drag on an end turns it. Straight ramps also
   have their own shortcut, the big + in the bar.

   It lists every row of ITEMS, so a new kind of item (a curved
   ramp, a placeable booster) appears here by being added there
   and given a count and a placement in the controller.

   A ramp tile counts what is left of this level's budget, and
   shows the spares in the drawer beside it: once the level's
   own ramps are gone, tapping the tile spends a spare. With
   neither, the tile is disabled and the shop is one tap away.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { ITEMS, type ItemKind } from '../items/items';

interface Props {
  onClose: () => void;
  onShop: () => void;
}

/* A little picture of each item, in the marks the rest of the UI uses. */
function ItemArt({ kind }: { kind: ItemKind }) {
  switch (kind) {
    case 'ramp': return <i className="itemart rampart" />;
  }
}

export function InventoryPanel({ onClose, onShop }: Props) {
  const { controller } = useGame();
  useGameVersion();
  const planning = controller.phase === 'plan';

  const take = (kind: ItemKind) => {
    if (controller.placeItem(kind)) onClose();
  };

  return (
    <div className="overlay" id="inventorypanel"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card invcard">
        <div className="big">Items</div>
        <div className="sub">Tap an item to put it on the board.</div>

        <div className="itemgrid">
          {ITEMS.map(it => {
            const { left, spare } = controller.itemCount(it.kind);
            const usable = planning && (left > 0 || spare > 0);
            return (
              <button key={it.kind} id={`btn-item-${it.kind}`} className="itemtile"
                      disabled={!usable} onClick={() => take(it.kind)}>
                <ItemArt kind={it.kind} />
                <b className="itemname">{it.name}</b>
                <span className="itemcount" id={`item-count-${it.kind}`}>×{left}</span>
                {spare > 0 && <span className="itemspare">+{spare} spare</span>}
                <span className="itemblurb">{it.blurb}</span>
              </button>
            );
          })}
        </div>

        <div className="row">
          <button id="btn-inv-shop" onClick={onShop}>Shop</button>
          <button id="btn-inv-close" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
