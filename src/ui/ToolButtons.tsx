/* ============================================================
   THE TOOLS BY THE THUMB

   A round button floating in the board's bottom-right corner -
   the thing used WHILE solving a board, one tap away:

   - BOUNCY (trampoline + count): tap, then draw a ramp - that
     ramp is a trampoline. Glows while armed; tap again to put it
     back. From level 10 on.

   `data-ui` and real <button>s, so a press here belongs to the
   button and never reaches the board under it (GameCanvas).
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export function ToolButtons() {
  const { controller } = useGame();
  useGameVersion();
  const planning = controller.phase === 'plan';

  const bouncyOn = controller.itemUnlocked('spring');
  const bouncyLeft = controller.itemCount('spring').left;

  if (!bouncyOn) return null;
  return (
    <div className="tools" data-ui>
      {bouncyOn && (
        <button id="btn-bouncy" className={'toolbtn bouncybtn' + (controller.armedSpring ? ' armed' : '')}
                title="Bouncy ramp - tap, then draw a ramp. It throws the ball 4x harder."
                aria-label={`Bouncy ramp, ${bouncyLeft} left`} aria-pressed={controller.armedSpring}
                disabled={!planning || (!controller.armedSpring && bouncyLeft <= 0)}
                onClick={() => controller.toggleBouncy()}>
          <i className="springmark" />
          <b className="badge" id="bouncy-count">{bouncyLeft}</b>
        </button>
      )}
    </div>
  );
}
