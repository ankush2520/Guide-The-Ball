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
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createGameBus, type GameBus } from './events';
import { LevelManager } from '../managers/LevelManager';
import { RewardManager } from '../managers/RewardManager';
import { GameController } from '../managers/GameController';
import { Renderer } from '../render/Renderer';
import { LEVELS } from '../levels';
import { createEngine, preferredEngineId } from '../physics/engines';
import { installGameHook } from './debugHook';

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
    const bus = createGameBus();
    const levels = new LevelManager(bus);
    const rewards = new RewardManager(bus, LEVELS.length);

    const canvas = document.createElement('canvas');
    canvas.id = 'board';
    canvas.setAttribute('aria-label', 'Game board');

    const renderer = new Renderer(canvas);
    /* Which simulator runs the game. ?engine=… wins, then the last choice,
       then the default - see src/physics/engines.ts. */
    const controller = new GameController(bus, levels, rewards, renderer,
                                          createEngine(preferredEngineId()));
    // resume where the player left off, exactly as the original did
    controller.setLevel(rewards.highest);

    const services: GameServices = { bus, levels, rewards, controller, canvas };
    installGameHook(services);      // the Playwright suite and the solver sweep
    return services;
  }, []);

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
