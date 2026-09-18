/* ============================================================
   THE LEVEL PILL

   Which board this is - "Level 12" - as a small chip in the top
   bar, in the gap between the + button and the bag.

   It used to sit under the board and carry the city name too
   ("Level 12 · Frostvale II"). Both changed for the same
   reason: the row it lived in cost the board height, and the
   bar already had empty space beside the +. Only the NUMBER is
   up here - a long city name would not survive the width the
   gap gives it, and the picker it opens names every board
   anyway.

   Tapping it opens the level picker, as it always did.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export function LevelPill({ onOpen }: { onOpen: () => void }) {
  const { levels } = useGame();
  useGameVersion();
  return (
    <button className="levelpill" id="level-title" title="Choose a level"
            aria-label={`Level ${levels.level.id} — choose a level`} onClick={onOpen}>
      <span className="lvnum">Level</span>{' '}<b className="lvid">{levels.level.id}</b>
    </button>
  );
}
