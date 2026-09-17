/* ============================================================
   THE COACH

   The first-run walkthrough's speech bubble. One short card per
   step (see TutStep in GameController), with an arrow at the
   thing it is talking about: the target, the + button, the ramp
   itself.

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
  add:   { title: 'Add a ramp', text: 'Tap the big + to put a ramp on the board.' },
  aim:   { title: 'Aim it',
           text: 'Drag it under the ball. Drag a yellow end to tilt it.',
           button: 'Done' },
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
    const fromEl = (sel: string, side: 'above' | 'below'): Spot | null => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: side === 'below' ? b.bottom : b.top, side };
    };

    /* where this step points, in viewport px */
    const spot = (): Spot | null => {
      const lv = levels.level;
      switch (step) {
        case 'intro': {
          const t = lv.target;
          return { ...fromBoard(t.x, t.y - t.r - 26), side: 'above' };
        }
        case 'add':  return fromEl('#btn-add-ramp', 'below');
        case 'aim': {
          const r = levels.rampAt(0);
          if (!r) return null;
          const mx = (r.x1 + r.x2) / 2, my = (r.y1 + r.y2) / 2;
          // on the far side of the ramp from its ×, so the card never hides it
          const below = levels.deleteButtonAt(r).y < my;
          return { ...fromBoard(mx, my + (below ? 64 : -64)), side: below ? 'below' : 'above' };
        }
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
