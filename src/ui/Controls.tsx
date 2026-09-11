/* ============================================================
   THE ACTION ROW

   One decision lives here - drop the ball - and two repairs.
   Drop therefore gets the width, the height and the colour;
   Undo and Clear shrink to their own labels and sit at the end
   of the row, where a misfire costs a tap rather than a ball.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export function Controls() {
  const { controller, levels } = useGame();
  useGameVersion();

  const planning = controller.phase === 'plan';
  const none = levels.rampsUsed === 0;

  return (
    <>
      <div className="controls">
        {/* stays enabled at zero balls on purpose - the press opens the
            out-of-balls screen rather than dropping a ball */}
        <button id="btn-drop"
                className={'primary' + (controller.tutorialStep() === 2 ? ' tut-pulse' : '')}
                disabled={!planning}
                onClick={() => controller.drop()}>Drop Ball</button>
        <button id="btn-undo" className="mini" disabled={!planning || none}
                onClick={() => { levels.undoRamp(); controller.selected = -1;
                                 controller.notifyRampsChanged(); }}>Undo</button>
        <button id="btn-clear" className="mini" disabled={!planning || none}
                onClick={() => { levels.clearRamps(); controller.selected = -1;
                                 controller.notifyRampsChanged(); }}>Clear</button>
      </div>
      <p className="hint" id="hint">{controller.hint}</p>
    </>
  );
}
