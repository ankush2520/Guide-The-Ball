/* ============================================================
   THE COACH

   The first-run walkthrough's speech bubble. One short card per
   step (see TutStep in GameController), with an arrow at the
   thing it is talking about: the target, or the stretch of board
   the ramp should be drawn across.

   It never blocks play. The card ignores the pointer - a tap on
   it lands on whatever is underneath, which in the "drop" step
   is exactly the tap it asks for - and only its own button takes
   input. Skip, on the board, ends the whole walkthrough.

   Its anchor moves (a ramp being dragged, a board resizing), so
   it re-measures every frame while it is up and writes the
   position straight to the element rather than re-rendering.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import type { TutStep } from '../managers/GameController';
import { BOARD, H } from '../physics/constants';

type Side = 'above' | 'below' | 'none';
interface Spot { x: number; y: number; side: Side }

interface Copy { title?: string; text: string; button?: string }

const COPY: Record<TutStep, Copy> = {
  intro: { title: 'Get the ball in the target!',
           text: "You can't steer the ball. Place ramps so it bounces into the green target, then drop it.",
           button: "Let's go" },
  draw:  { title: 'Draw a ramp',
           text: 'Press on the board and drag. Where you drag is the ramp - ' +
                 'put one under the ball.' },
  drop:  { title: 'Drop it!', text: 'Tap any empty space to drop the ball.' },
  retry: { title: 'So close!',
           text: 'Your ramp stays put. Adjust it a little and drop again.',
           button: 'OK' },
};

/** Gap between the arrow's tip and the thing it points at, in CSS px. */
const GAP = 12;

export function Coach({ hidden }: { hidden: boolean }) {
  const { controller, levels, canvas } = useGame();
  useGameVersion();
  const card = useRef<HTMLDivElement>(null);
  const step = controller.tutorialStep();

  useEffect(() => {
    if (!step || hidden) return;
    let raf = 0;

    const fromBoard = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (x - BOARD.x0) * r.width / BOARD.w, y: r.top + y * r.height / H };
    };
    /* where this step points, in viewport px */
    const spot = (): Spot | null => {
      const lv = levels.level;
      switch (step) {
        case 'intro': {
          const t = lv.target;
          return { ...fromBoard(t.x, t.y - t.r - 26), side: 'above' };
        }
        /* Under the spot the board is asking them to draw across - which is
           the ball's own fall line, low enough to be well clear of the
           gesture itself. The card must not sit ON the stretch of board the
           player is being told to drag over. */
        case 'draw':
          return { ...fromBoard(lv.spawn.x, H * 0.62), side: 'below' };
        case 'drop':
        case 'retry': {
          // whichever half of the board the ramp is NOT in
          const r = levels.rampAt(0);
          const high = !r || (r.y1 + r.y2) / 2 < H / 2;
          return { ...fromBoard((BOARD.x0 + BOARD.x1) / 2, high ? H * 0.62 : H * 0.24), side: 'none' };
        }
      }
    };

    const place = () => {
      const el = card.current, s = spot();
      if (el && s) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = el.offsetWidth, h = el.offsetHeight;
        const left = Math.min(Math.max(s.x - w / 2, 10), vw - w - 10);
        let top = s.side === 'below' ? s.y + GAP
                : s.side === 'above' ? s.y - h - GAP
                : s.y - h / 2;
        top = Math.min(Math.max(top, 10), vh - h - 10);
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.setProperty('--ax', `${Math.min(Math.max(s.x - left, 22), w - 22)}px`);
        el.dataset.side = s.side;
        el.style.visibility = 'visible';
      } else if (el) {
        el.style.visibility = 'hidden';
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [step, hidden, canvas, levels]);

  if (!step || hidden) return null;
  const c = COPY[step];
  return (
    <div ref={card} key={step} id="coach" data-step={step}
         className="coach"
         role="status" aria-live="polite" style={{ visibility: 'hidden' }}>
      {c.title && <b className="coach-title">{c.title}</b>}
      <p className="coach-text">{c.text}</p>
      {c.button && (
        <button id="btn-coach-next" className="primary"
                onClick={() => controller.tutorialNext()}>{c.button}</button>
      )}
    </div>
  );
}
