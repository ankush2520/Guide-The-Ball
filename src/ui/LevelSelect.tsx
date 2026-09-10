/* The level picker. Cleared levels stay unlocked; everything past the
   player's high-water mark is locked. */
import { useGame } from '../core/GameContext';
import { LEVELS } from '../levels';

export function LevelSelect({ onClose }: { onClose: () => void }) {
  const { controller, levels, rewards } = useGame();

  return (
    <div className="overlay" id="select">
      <div className="card selcard">
        <div className="big">Levels</div>
        <div className="sub" id="sel-sub">
          Unlocked {rewards.highest + 1} of {LEVELS.length}. Clear a level to open the next.
        </div>
        <div className="grid scroll" id="lvgrid">
          {LEVELS.map((lv, i) => {
            const locked = i > rewards.highest;          // locked past your best
            const got = rewards.bestStars[i] | 0;
            const cls = i === levels.levelIndex ? 'cur' : i < rewards.highest ? 'done' : '';
            return (
              <button key={lv.id} className={cls} disabled={locked}
                      title={locked ? 'Locked' : lv.name}
                      onClick={() => { controller.setLevel(i); onClose(); }}>
                {lv.id}
                {got > 0 && <span className="gstars">{'\u2605'.repeat(got)}</span>}
              </button>
            );
          })}
        </div>
        <div className="row"><button id="btn-close-sel" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
