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
import { useEffect, useRef, useState } from 'react';
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
import { CoinFlight } from './CoinFlight';
import { Confetti } from './Confetti';
import { Sound } from '../audio/Sound';

type Panel = 'levels' | 'info' | 'spin' | 'noballs' | 'settings' | 'shop';

function Game() {
  const { bus, levels, controller, rewards } = useGame();
  /* A STACK, not a single panel. The wheel has to open ON TOP of the
     out-of-balls screen - it is one of the two ways out of it - and closing
     the wheel has to hand that screen back rather than dismissing both. The
     settings panel needs the same thing twice over: both the wheel and the
     info panel open FROM it, and closing either has to land back on it. The
     z-index order the stylesheet states is what keeps them layered. */
  const [stack, setStack] = useState<Panel[]>([]);
  /* The offer timer reads the stack without wanting to be restarted every
     time a panel opens, so it reads it through a ref. */
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const open = (p: Panel) => setStack(s => (s.includes(p) ? s : [...s, p]));
  const close = () => setStack(s => s.slice(0, -1));
  const has = (p: Panel) => stack.includes(p);

  /* The out-of-balls screen is opened by the GAME, not by a button - pressing
     Drop with an empty tank has to lead somewhere. */
  useEffect(() => bus.on('balls:empty', () => open('noballs')), [bus]);

  /* ============================================================
     THE WHEEL LETS ITSELF IN

     A daily reward nobody remembers to collect is not a daily
     reward, so once a spin comes due the wheel opens itself.

     It waits for a QUIET moment to do it, because interrupting
     is the whole risk here: nothing else on screen, the board in
     planning rather than mid-drop, and the tutorial finished.
     A player who has never seen the game does not want a modal
     first. RewardManager.shouldOfferSpin() then makes it once
     per availability rather than once per check - see the note
     there on why closing it must not re-arm it.

     __gtbNoAutoSpin turns it off. It is read live, and the test
     suite sets it before the app boots, because a modal that can
     appear on a timer makes every other test in the file
     non-deterministic - and reading a flag is the only kind of
     off switch that can be in place before the first check runs.
     ============================================================ */
  useEffect(() => {
    const offer = () => {
      if ((window as unknown as Record<string, unknown>).__gtbNoAutoSpin) return;
      if (stackRef.current.length > 0) return;
      if (controller.phase !== 'plan' || controller.tutorialStep() !== 0) return;
      if (!rewards.shouldOfferSpin()) return;
      rewards.markSpinOffered();
      open('spin');
    };
    const id = setInterval(offer, 1000);
    offer();
    return () => clearInterval(id);
  }, [controller, rewards]);

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
      {/* Both of these paint OVER the card rather than inside it. The burst
          sits under the coin flight, because the coins are the payout and the
          paper is only applause. */}
      <Confetti />
      {/* Above every panel: it flies from the win card to the HUD, so it has
          to paint over both of them. */}
      <CoinFlight />
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
