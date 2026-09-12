/* ============================================================
   GAME CONTEXT

   Builds the object graph once and hands it down. React holds a
   REFERENCE to the managers, never a copy of their state: the
   game is a 60Hz simulation and putting the ball's position in
   React state would re-render the tree sixty times a second.

   Components read live values through useGameVersion(), which
   subscribes to the controller's version counter - so a
   re-render happens when something the UI actually shows has
   changed, and not on every frame.

   The canvas is created HERE rather than by JSX so the whole
   graph can be built eagerly: the renderer needs a real element,
   and a half-built controller that components have to null-check
   is worse than owning one detached node.
   ============================================================ */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createGameBus, type GameBus } from './events';
import { LevelManager } from '../managers/LevelManager';
import { RewardManager } from '../managers/RewardManager';
import { GameController } from '../managers/GameController';
import { Renderer } from '../render/Renderer';
import { LEVELS } from '../levels';
import { createEngine } from '../physics/engines';
import { setBoardPad, PAD_TABLET } from '../physics/constants';
import { installGameHook } from './debugHook';

/* ============================================================
   BOARD PROFILE

   A tablet and a desktop get a 3:4 board; a phone keeps the 3:5
   one the levels are designed in. The test is the viewport's
   SHORTER side, which is what makes it survive a rotation: an
   iPad is over 640 both ways round and a phone is under it both
   ways round, so neither ever changes shape mid-level. Only
   dragging a desktop window across the threshold can do that.

   The same query is in the stylesheet, on .stage's aspect-ratio.
   They have to agree - the canvas is the board - so if one moves
   the other moves with it.
   ============================================================ */
const TABLET = '(min-width: 640px) and (min-height: 640px)';

const padFor = (wide: boolean) => (wide ? PAD_TABLET : 0);

export interface GameServices {
  bus: GameBus;
  levels: LevelManager;
  rewards: RewardManager;
  controller: GameController;
  /** The board itself. GameCanvas adopts this node into the layout. */
  canvas: HTMLCanvasElement;
}

const Ctx = createContext<GameServices | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const services = useMemo<GameServices>(() => {
    /* Before ANY of it: the renderer sizes its surface from the board and the
       managers clamp ramps to it, so the profile has to be settled first. */
    setBoardPad(padFor(typeof matchMedia === 'function' && matchMedia(TABLET).matches));

    const bus = createGameBus();
    const levels = new LevelManager(bus);
    const rewards = new RewardManager(bus, LEVELS.length);

    const canvas = document.createElement('canvas');
    canvas.id = 'board';
    canvas.setAttribute('aria-label', 'Game board');

    const renderer = new Renderer(canvas);
    const controller = new GameController(bus, levels, rewards, renderer,
                                          createEngine());
    // resume where the player left off, exactly as the original did - and
    // `resumeAt` rather than `highest` so the dev unlock cannot send a boot
    // to the final level. See RewardManager.
    controller.setLevel(rewards.resumeAt);

    const services: GameServices = { bus, levels, rewards, controller, canvas };
    installGameHook(services);      // the Playwright suite and the solver sweep
    return services;
  }, []);

  /* Dragging a desktop window across the threshold reshapes the board under
     the player. Nothing in flight breaks - there are no side walls, so a ball
     mid-drop is at a valid position on either board - but ramps drawn out in
     a tablet's margins would be left hanging off a phone-sized one, so they
     are pulled back in. */
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(TABLET);
    const onChange = () => {
      setBoardPad(padFor(mq.matches));
      services.levels.reclampRamps();
      services.controller.renderer.invalidateBackdrop();
      services.controller.notifyRampsChanged();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [services]);

  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useGame(): GameServices {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside <GameProvider>');
  return v;
}

/** Re-render whenever the controller says something the UI shows has changed. */
export function useGameVersion(): number {
  const { controller } = useGame();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
