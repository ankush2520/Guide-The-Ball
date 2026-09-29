/* ============================================================
   THE LEVEL PICKER - a carousel of worlds

   One WORLD per page: its name on a banner in its own sky, its
   twenty levels and nothing else - so a player always knows which world they are
   looking at, and the grid is never a wall of 140 numbers.

   Arrows either side of the banner and a swipe across the page
   move between worlds; the dots underneath say where you are.
   It opens on the world you are playing. A world not reached yet
   shows its levels locked, and says which level opens it.

   Cleared levels stay unlocked; everything past the player's
   high-water mark is locked. The star-chest bar sits above the
   carousel (it counts stars from every world), and each twenty-
   level world lists its own levels.
   ============================================================ */
import { useRef, useState } from 'react';
import { useGame } from '../core/GameContext';
import { LEVELS, COUNTRIES, cityOf } from '../levels';
import { ChestBar } from './ChestPanel';

/** Only the worlds that actually have levels in the game. */
const WORLDS = COUNTRIES.filter(c => c.from <= LEVELS.length);
/** A swipe has to travel this far (px) to turn the page. */
const SWIPE = 40;

export function LevelSelect({ onClose, onChest }: { onClose: () => void; onChest: () => void }) {
  const { controller, levels, rewards } = useGame();
  const here = Math.max(0, WORLDS.findIndex(c => levels.level.id >= c.from && levels.level.id <= c.to));
  const [page, setPage] = useState(here);
  const go = (p: number) => setPage(Math.max(0, Math.min(WORLDS.length - 1, p)));
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const w = WORLDS[page];
  const n = w.to - w.from + 1;
  const reached = w.from - 1 <= rewards.highest;              // its first level is open
  let stars = 0;
  for (let id = w.from; id <= w.to; id++) stars += rewards.bestStars[id - 1] | 0;

  return (
    <div className="overlay" id="select">
      <div className="card selcard">
        <div className="big">Levels</div>
        {/* star chest progress, and the chest itself once it is earned */}
        <div className="chestrow">
          <ChestBar />
          {rewards.chestReady() && (
            <button id="btn-open-chest" className="primary" onClick={onChest}>Open chest</button>
          )}
        </div>

        {/* THE WORLD BANNER - in the world's own sky, arrows either side */}
        <div className="worldnav">
          <button className="worldarrow" id="btn-world-prev" aria-label="Previous world"
                  disabled={page === 0} onClick={() => go(page - 1)}>&#8249;</button>
          <div className="worldbanner" id="world-banner"
               style={{ background: `linear-gradient(135deg, ${w.sky[0]}, ${w.sky[1]} 55%, ${w.sky[2]})`,
                        borderColor: w.accent }}>
            <small>World {page + 1} &middot; levels {w.from}&ndash;{w.to}</small>
            <b id="world-name">{w.name}</b>
            <span className="worldmech">{w.mechanic.charAt(0).toUpperCase() + w.mechanic.slice(1)}</span>
            <span className="worldstars" title="Stars earned in this world">
              &#9733; {stars} / {n * 3}
            </span>
          </div>
          <button className="worldarrow" id="btn-world-next" aria-label="Next world"
                  disabled={page === WORLDS.length - 1} onClick={() => go(page + 1)}>&#8250;</button>
        </div>

        {/* THIS WORLD'S LEVELS - swipe sideways to change world */}
        <div className="worldpage"
             onPointerDown={e => { swipe.current = { x: e.clientX, y: e.clientY }; }}
             onPointerUp={e => {
               const s = swipe.current; swipe.current = null;
               if (!s) return;
               const dx = e.clientX - s.x, dy = e.clientY - s.y;
               if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) go(page + (dx < 0 ? 1 : -1));
             }}
             onPointerCancel={() => { swipe.current = null; }}>
          <div className="grid" id="lvgrid" key={w.id}>
            {LEVELS.slice(w.from - 1, w.to).map((lv, k) => {
              const i = w.from - 1 + k;
              const locked = i > rewards.highest;          // locked past your best
              const got = rewards.bestStars[i] | 0;
              const cls = i === levels.levelIndex ? 'cur' : i < rewards.highest ? 'done' : '';
              return (
                <button key={lv.id} className={cls} disabled={locked}
                        title={locked ? 'Locked' : cityOf(lv)}
                        onClick={() => { controller.setLevel(i); onClose(); }}>
                  {lv.id}
                  {got > 0 && <span className="gstars">{'★'.repeat(got)}</span>}
                </button>
              );
            })}
          </div>
          {!reached && (
            <div className="worldlock" id="world-lock">
              <i className="lockicon" aria-hidden="true" />
              Clear level {w.from - 1} to open {w.name}
            </div>
          )}
        </div>

        {/* where you are among the worlds - tap a dot to jump */}
        <div className="worlddots" role="tablist" aria-label="Worlds">
          {WORLDS.map((c, k) => (
            <button key={c.id} role="tab" aria-selected={k === page} aria-label={c.name}
                    className={k === page ? 'on' : ''} style={k === page ? { background: c.accent } : undefined}
                    onClick={() => go(k)} />
          ))}
        </div>

        <div className="row"><button id="btn-close-sel" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
