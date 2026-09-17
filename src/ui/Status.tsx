/* ============================================================
   THE STATUS PILL

   One slot on the board's top edge, and two things that can be
   in it:

   - the FLASH: miss / stuck feedback and the just-in-time
     mechanic tips. A losing drop used to stop the game behind a
     modal; it now just says what happened here and hands the
     player straight back to planning with their ramps untouched.
   - the DROP CUE: how to drop, now that no button does.

   They share the slot and are decided in the SAME render from
   the same state, so they cannot both be up: the flash wins
   while it has something to say, and the cue takes the slot
   back the moment it is cleared - planning, nothing selected.
   Both switch instantly rather than crossfading, so there is no
   frame where one is fading out under the other.

   Why the top EDGE and not on the board or under it:
   - under the board it cost a row of height on every phone;
   - on the board it sat over the ball's start (every spawn is at
     y=40, marker from y=27) on most levels;
   - straddling the frame it covers only the board's top ~15
     units, which nothing on any level uses.
   It is out of flow and pointer-transparent, so it can neither
   move the board nor swallow a tap meant for it.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export const DROP_CUE = 'Touch or click on screen to drop ball';

export function Status() {
  const { controller } = useGame();
  useGameVersion();
  const flash = controller.flash;
  const cue = !flash && controller.phase === 'plan' && controller.selected < 0;
  return (
    <div className="status">
      <div id="flash" className={'flash' + (flash ? ' on' : '')}
           role="status" aria-live="polite">
        {flash}
      </div>
      <div id="drop-cue" className={'drop-cue' + (cue ? ' on' : '')}>{DROP_CUE}</div>
    </div>
  );
}
