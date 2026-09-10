/* Miss / stuck feedback and the just-in-time mechanic tips.

   A losing drop used to stop the game behind a modal. It now just says what
   happened, above the board, and hands the player straight back to planning
   with their ramps untouched. One fixed-height line, so showing it can never
   shift the board mid-drag. */
import { useGame, useGameVersion } from '../core/GameContext';

export function Flash() {
  const { controller } = useGame();
  useGameVersion();
  return (
    <div id="flash" className={'flash' + (controller.flash ? ' on' : '')} role="status" aria-live="polite">
      {controller.flash}
    </div>
  );
}
