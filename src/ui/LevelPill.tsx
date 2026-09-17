/* ============================================================
   THE LEVEL PILL

   Which board this is - "Level 12 · Frostvale II" - in a small
   pill under the board. It moved down here to give the top bar
   to the + button. Tapping it opens the level picker, as the
   title in the bar used to.

   Kept to one short line so it costs the board as little
   height as possible; a long city name is ellipsised rather
   than wrapped.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export function LevelPill({ onOpen }: { onOpen: () => void }) {
  const { levels } = useGame();
  useGameVersion();
  return (
    <div className="levelrow">
      <button className="title levelpill" id="level-title" title="Choose a level" onClick={onOpen}>
        <span className="lvnum">Level {levels.level.id}</span>
        <b className="lvname">{levels.cityName}</b>
      </button>
    </div>
  );
}
