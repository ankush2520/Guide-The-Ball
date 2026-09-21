/* ============================================================
   THE INVENTORY TRAY

   What the player OWNS and can put on the board, opened from the
   bag in the top bar. Tapping an item closes the tray on a board
   with that item already placed and selected - the next drag
   moves it, a drag on its knob aims it.

   RAMPS ARE NOT IN HERE. A ramp is drawn freehand, straight onto
   the board, out of a per-level budget; this tray is for scarce
   things you own. That split is deliberate and it is the reason
   the bar's + button is gone.

   It lists every row of ITEMS the player has UNLOCKED, so a new
   kind of item appears here by being added there and given a
   count and a placement in the controller. The spring is simply
   absent before level 21 - see GameController.itemUnlocked -
   which today means the tray can be empty, and an empty tray has
   to say so rather than look broken.

   A spring tile counts what is in the bag, minus any already
   on this board - one that is placed is reserved, not spent,
   and comes back the moment it is taken off again.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { ITEMS, type ItemKind } from '../items/items';
import { SPRING_UNLOCK_LEVEL } from '../managers/RewardManager';

interface Props {
  onClose: () => void;
  onShop: () => void;
}

/* A little picture of each item, in the marks the rest of the UI uses. */
function ItemArt({ kind }: { kind: ItemKind }) {
  switch (kind) {
    case 'spring': return <i className="itemart springart" />;
  }
}

export function InventoryPanel({ onClose, onShop }: Props) {
  const { controller } = useGame();
  useGameVersion();
  const planning = controller.phase === 'plan';
  const shown = ITEMS.filter(it => controller.itemUnlocked(it.kind));

  const take = (kind: ItemKind) => {
    if (controller.placeItem(kind)) onClose();
  };

  return (
    <div className="overlay" id="inventorypanel"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card invcard">
        <div className="big">Items</div>
        <div className="sub">
          {shown.length
            ? 'Tap an item, then tap the ramp you want it on.'
            : 'Nothing to place yet.'}
        </div>

        {/* An empty tray explains itself and points at the two things that
            fill it, rather than being a blank card. */}
        {!shown.length && (
          <p className="emptytray" id="inv-empty">
            Ramps are drawn straight onto the board &mdash; press and drag.
            Items you can <b>own and place</b> show up here; springs are the
            first, and they unlock at level {SPRING_UNLOCK_LEVEL}.
          </p>
        )}

        <div className="itemgrid">
          {shown.map(it => {
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
