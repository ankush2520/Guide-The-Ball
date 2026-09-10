/* Everything, always available, with whatever is on the board you are
   currently looking at called out. */
import { useGame, useGameVersion } from '../core/GameContext';
import { GLOSSARY } from './glossary';
import { ENGINES } from '../physics/engines';
import type { EngineId } from '../physics/PhysicsEngine';
import { STARTING_BALLS, CLEAR_BONUS, AD_REWARD } from '../managers/RewardManager';

export function InfoPanel({ onClose }: { onClose: () => void }) {
  const { levels, controller } = useGame();
  useGameVersion();
  const lv = levels.level;
  const current = controller.engineId;

  return (
    <div className="overlay" id="infopanel">
      <div className="card infocard">
        <div className="big">How to play</div>
        <div className="info scroll" id="info-body">
          <h4>The basics</h4>
          <p>Drag anywhere on the board to draw a ramp, then press <b>Drop Ball</b>.
             You never steer the ball - you set the board up beforehand and watch
             it play out.</p>
          <p>Tap a ramp you have placed to select it: drag either end to reshape it,
             drag the middle to move it, or hit the <b>&times;</b> to delete it.
             <b> Undo</b> and <b>Clear</b> work on the whole set. Missing costs you
             nothing but the ball - your ramps stay put so the next go is an
             adjustment, not a rebuild.</p>

          <h4>On the board</h4>
          {GLOSSARY.map(g => (
            <div key={g.cls} className={'iline' + (g.has(lv) ? ' here' : '')}>
              <span className={'sw ' + g.cls} />
              <span><b>{g.name}</b><span className="d">{g.long}</span></span>
            </div>
          ))}

          <h4>Balls</h4>
          <p>Every drop costs one ball, whether it wins or loses. Moving between
             levels is free.</p>
          <p>You start with <b>{STARTING_BALLS}</b>. Clearing a level for the first
             time ever pays a bonus that grows through the game
             (+{CLEAR_BONUS[0]} early, up to +{CLEAR_BONUS[CLEAR_BONUS.length - 1]} late),
             the daily wheel pays 1-5, and the ad button on the out-of-balls screen
             pays +{AD_REWARD}.</p>

          <h4>Physics engine</h4>
          <p>Two simulators ship with the game and either can run it. They
             agree on which levels are solvable, but not on the exact path the
             ball takes - so a solution you have memorised will need adjusting
             after a switch.</p>
          <div className="engines">
            {(Object.keys(ENGINES) as EngineId[]).map(id => {
              const label = id === 'matter' ? 'Matter.js' : 'Arcade (original)';
              const blurb = id === 'matter'
                ? 'A real rigid-body engine. Matter owns collision detection, ' +
                  'contact resolution and integration; gravity is calibrated to ' +
                  'match the original fall exactly.'
                : 'The hand-written deterministic simulator the levels were ' +
                  'designed and verified against. Tuned for readability, not realism.';
              return (
                <button key={id}
                        className={'enginebtn' + (id === current ? ' on' : '')}
                        onClick={() => controller.setEngine(id)}>
                  <b>{label}{id === current ? ' · running' : ''}</b>
                  <span className="d">{blurb}</span>
                </button>
              );
            })}
          </div>

          <h4>Level rating</h4>
          <p>Separate from the gold star pickups. Clearing a level earns one to
             three <b>&#9733;</b>: you start at three, lose one for needing a second
             try and another past three tries, and win one back for clearing it
             under the ramp budget. A scrappy but efficient solve can still reach
             three.</p>
        </div>
        <div className="row"><button id="btn-info-close" className="primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
