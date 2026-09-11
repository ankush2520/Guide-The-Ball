/* ============================================================
   APP

   The shell: chrome above the board, the board, the controls
   below it, and the modals.

   The flash is the one piece of chrome that lives INSIDE the
   stage: it is feedback about the board, and out of flow it
   costs the board no height - see .flashrow.

   The modals are VIEWPORT-level, not children of the stage.
   They used to live inside .stage, which is sized to the board's
   3:5 aspect - so on a short window the stage was barely 190px
   wide and every card was clipped: the info panel lost its title
   and its Close button. Keeping them out here means the board's
   shape can never crop them.
   ============================================================ */
import { useEffect, useState } from 'react';
import { GameProvider, useGame } from '../core/GameContext';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { Controls } from './Controls';
import { Flash } from './Flash';
import { WinOverlay } from './WinOverlay';
import { LevelSelect } from './LevelSelect';
import { NoBallsPanel } from './NoBallsPanel';
import { InfoPanel } from './InfoPanel';
import { SpinPanel } from './SpinPanel';
import { SettingsPanel } from './SettingsPanel';
import { ShopPanel } from './ShopPanel';
import { Sound } from '../audio/Sound';

type Panel = 'levels' | 'info' | 'spin' | 'noballs' | 'settings' | 'shop';

function Game() {
  const { bus, levels } = useGame();
  /* A STACK, not a single panel. The wheel has to open ON TOP of the
     out-of-balls screen - it is one of the two ways out of it - and closing
     the wheel has to hand that screen back rather than dismissing both. The
     settings panel needs the same thing twice over: both the wheel and the
     info panel open FROM it, and closing either has to land back on it. The
     z-index order the stylesheet states is what keeps them layered. */
  const [stack, setStack] = useState<Panel[]>([]);
  const open = (p: Panel) => setStack(s => (s.includes(p) ? s : [...s, p]));
  const close = () => setStack(s => s.slice(0, -1));
  const has = (p: Panel) => stack.includes(p);

  /* The out-of-balls screen is opened by the GAME, not by a button - pressing
     Drop with an empty tank has to lead somewhere. */
  useEffect(() => bus.on('balls:empty', () => open('noballs')), [bus]);

  /* A country recolours the chrome accent. The entity palette never changes. */
  useEffect(() => {
    const apply = () => document.documentElement.style
      .setProperty('--accent', levels.country.accent);
    apply();
    return bus.on('level:changed', apply);
  }, [bus, levels]);

  /* Autoplay policy: keep trying on every gesture until the context is really
     running. Capture phase, and several event names, because iOS hands the
     permission out on some gestures and not others.

     Neither visibilitychange nor pageshow is a user gesture - pageshow in
     particular fires on the ordinary first load - so those NUDGE rather than
     unlock. Building the context there is what would break iOS. */
  useEffect(() => {
    const names = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const unlock = () => Sound.unlock();
    names.forEach(n => window.addEventListener(n, unlock, true));
    const onVis = () => (document.hidden ? Sound.pause() : Sound.nudge());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', Sound.nudge);
    return () => {
      names.forEach(n => window.removeEventListener(n, unlock, true));
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', Sound.nudge);
    };
  }, []);

  /* Deliberately NO keyboard handling beyond this. CrazyGames requires that
     Escape and the browser's own shortcuts always reach the browser, and the
     surest way to pass that gate is to have almost nothing listening. */

  return (
    <>
      <div className="app">
        <Hud onOpenLevels={() => open('levels')}
             onOpenSettings={() => open('settings')} />
        <GameCanvas><Flash /></GameCanvas>
        <Controls />
      </div>

      <WinOverlay />
      {has('noballs') && <NoBallsPanel onClose={close} onSpin={() => open('spin')}
                                       onShop={() => open('shop')} />}
      {has('levels')  && <LevelSelect  onClose={close} />}
      {has('settings') && <SettingsPanel onClose={close}
                                         onOpenInfo={() => open('info')}
                                         onOpenShop={() => open('shop')}
                                         onOpenSpin={() => open('spin')} />}
      {has('shop')    && <ShopPanel    onClose={close} />}
      {has('spin')    && <SpinPanel    onClose={close} />}
      {has('info')    && <InfoPanel    onClose={close} />}
    </>
  );
}

export function App() {
  return <GameProvider><Game /></GameProvider>;
}
