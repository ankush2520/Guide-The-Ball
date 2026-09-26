/* The level picker. Cleared levels stay unlocked; everything past the
   player's high-water mark is locked. */
import { useGame } from '../core/GameContext';
import { LEVELS, COUNTRIES, cityOf } from '../levels';
import { CHALLENGE_BALLS } from '../managers/RewardManager';
import { ChestBar } from './ChestPanel';

export function LevelSelect({ onClose, onChest }: { onClose: () => void; onChest: () => void }) {
  const { controller, levels, rewards } = useGame();

  return (
    <div className="overlay" id="select">
      <div className="card selcard">
        <div className="big">Levels</div>
        <div className="sub" id="sel-sub">
          Unlocked {rewards.highest + 1} of {LEVELS.length}. Clear a level to open the next.
        </div>
        {/* star chest progress, and the chest itself once it is earned */}
        <div className="chestrow">
          <ChestBar />
          {rewards.chestReady() && (
            <button id="btn-open-chest" className="primary" onClick={onChest}>Open chest</button>
          )}
        </div>
        {/* CHALLENGE RUNS - one per twenty-city world, open once that world
            is cleared: all its levels in a row on one pool of balls. */}
        <div className="challenges" id="challenges">
          {COUNTRIES.filter(c => c.to - c.from + 1 >= 20 && c.from <= LEVELS.length).map(c => {
            const done = !!rewards.challengesDone[c.id];
            const open = rewards.worldCleared(c.from, c.to);
            return (
              <div key={c.id} className={'chrow' + (done ? ' done' : '')}>
                <span className="chname"><b>{c.name}</b> Challenge Run{done && <i className="badge">&#10003; cleared</i>}</span>
                <button id={`btn-challenge-${c.id}`} disabled={!open}
                        title={open ? `All ${c.to - c.from + 1} levels in a row, ${CHALLENGE_BALLS} balls`
                                    : `Clear levels ${c.from}-${c.to} to unlock`}
                        onClick={() => { controller.startChallenge(c.id); onClose(); }}>
                  {open ? (done ? 'Play again' : 'Play') : `Clear ${c.from}-${c.to}`}
                </button>
              </div>
            );
          })}
        </div>
        <div className="grid scroll" id="lvgrid">
          {LEVELS.map((lv, i) => {
            const locked = i > rewards.highest;          // locked past your best
            const got = rewards.bestStars[i] | 0;
            const cls = i === levels.levelIndex ? 'cur' : i < rewards.highest ? 'done' : '';
            return (
              <button key={lv.id} className={cls} disabled={locked}
                      title={locked ? 'Locked' : cityOf(lv)}
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
