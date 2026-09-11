/* Miss / stuck feedback and the just-in-time mechanic tips.

   A losing drop used to stop the game behind a modal. It now just says what
   happened and hands the player straight back to planning with their ramps
   untouched. */
import { useGame, useGameVersion } from '../core/GameContext';

export function Flash() {
  const { controller } = useGame();
  useGameVersion();
  /* Rendered INSIDE the stage, floating over the top of the board. It used
     to hold a reserved line in the column so that showing it could not shift
     the board - which worked, at the cost of ~30px of permanent dead space
     above the board for a pill that is empty almost all the time. Out of
     flow it cannot shift anything, and costs nothing when it is empty. */
  return (
    <div className="flashrow">
      <div id="flash" className={'flash' + (controller.flash ? ' on' : '')}
           role="status" aria-live="polite">
        {controller.flash}
      </div>
    </div>
  );
}
