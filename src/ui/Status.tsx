/* ============================================================
   THE STATUS CAPTION

   One line of plain text along the board's bottom edge, placed
   the way a Reel or a Short places its subtitles, and two things
   that can be in it:

   - the FLASH: miss / stuck feedback and the just-in-time
     mechanic tips. A losing drop used to stop the game behind a
     modal; it now just says what happened here and hands the
     player straight back to planning with their ramps untouched.
   - the CUE: how to drop, now that no button does - or, on the
     very first board, where the ramps are.

   They share the slot and are decided in the SAME render from
   the same state, so they cannot both be up: the flash wins
   while it has something to say, and the cue takes the slot
   back the moment it is cleared - planning, nothing selected.
   Both switch instantly rather than crossfading, so there is no
   frame where one is fading out under the other.

   Deliberately quiet - no background, low contrast - so it
   informs without competing with the board. The bottom edge is
   the one band no level puts anything in (targets end by
   y=776) and far from the ball's start at y=40. It is out of
   flow and pointer-transparent, so it can neither move the
   board nor swallow a tap meant for it.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';
import { countryOf } from '../levels';
import { isLightSky } from '../render/palette';

export const DROP_CUE = 'Touch or click on screen to drop ball';

export function Status() {
  const { controller } = useGame();
  useGameVersion();
  const flash = controller.flash;
  const text = controller.cue;
  const cue = !flash && !!text;
  // light text over the night boards, dark over the day ones
  const dark = !isLightSky(countryOf(controller.levels.level.id).sky[1]);
  return (
    <div className={'status' + (dark ? ' on-dark' : '')}>
      <div id="flash" className={'flash' + (flash ? ' on' : '')}
           role="status" aria-live="polite">
        {flash}
      </div>
      <div id="drop-cue" className={'drop-cue' + (cue ? ' on' : '')}>{text ?? DROP_CUE}</div>
    </div>
  );
}
