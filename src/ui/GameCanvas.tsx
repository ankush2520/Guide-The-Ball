/* ============================================================
   GAME CANVAS

   Adopts the renderer's canvas into the layout and owns every
   pointer gesture on the board.

   Nothing is DRAWN here any more: ramps come out of the
   inventory popup (InventoryPanel). The board handles only what
   is already on it - select a ramp, move it, turn it by an end,
   delete it with its × - and a tap on empty board drops the ball.

   All hit-testing is done in BOARD coordinates, so a grab radius
   means the same thing whatever size the canvas is displayed at.
   ============================================================ */
import { useEffect, useRef, type ReactNode } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { H, RAMP_HT, BOARD } from '../physics/constants';
import { clamp, distToSeg } from '../physics/math';
import { DEL_GRAB, PICK_PAD } from '../managers/LevelManager';

/* `children` is painted ON the board (the status caption). Nothing sits
   under the board any more - the level chip moved into the HUD, and the
   slot is the board and nothing else, down to the bottom of the column. */
export function GameCanvas({ children }: { children?: ReactNode }) {
  const { canvas, controller, levels } = useGame();
  const host = useRef<HTMLDivElement>(null);
  /* Where a press on EMPTY board began. It drops the ball only if it comes
     up as a TAP: a finger that slides - most often one that just missed the
     ramp it meant to drag - is not a request to spend a ball. Cleared at the
     start of every gesture so a release can never be judged against a stale
     one. */
  const tap = useRef<{ x: number; y: number; ripple: HTMLElement | null } | null>(null);
  /* Whether the ramp drag in progress has actually moved anything. A tap on a
     ramp starts a drag too, and only a real move counts as adjusting it. */
  const dragMoved = useRef(false);

  /* Beyond this, in board units, a press has become a slide and will not
     drop. The board is 480 wide against ~265-370 CSS px, so 14 units is
     about 8-10 CSS px - comfortably over a tap's own wobble. */
  const TAP_SLOP = 14;

  /* ============================================================
     PRESS FEEDBACK

     A tap can only be told from a slide once the finger lifts,
     so the drop waits for the release - about 120ms of a normal
     tap. A bare board gave nothing back in that time, and the
     silence read as lag. The ripple answers the touch itself,
     at the spot it landed.
     ============================================================ */
  const ripple = (e: React.PointerEvent): HTMLElement | null => {
    const stage = host.current;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'tap-ripple';
    el.style.left = `${e.clientX - r.left}px`;
    el.style.top = `${e.clientY - r.top}px`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    stage.appendChild(el);
    return el;
  };
  useGameVersion();                       // re-render for the Skip button

  /* Mount the canvas and run the loop for as long as it is on screen. */
  useEffect(() => {
    host.current?.appendChild(canvas);
    controller.start();
    return () => { controller.stop(); canvas.remove(); };
  }, [canvas, controller]);

  /* ============================================================
     SIZING THE BOARD

     CSS cannot do this one. The board must be the LARGER of the
     two fits - by width or by height, whichever runs out first -
     and `aspect-ratio` only solves that when the constrained
     axis is the automatic one. Written either way round, one of
     the two cases silently stretched the canvas instead: a 3:5
     board was rendering at 0.543 on every phone.

     So the slot takes the leftover space, and the box is
     computed here from BOARD.w / H - the same numbers the
     renderer draws with, so the canvas and its frame cannot
     disagree about the shape. The chrome above and below then
     matches the result through --board-w.

     Observing the SLOT, not the stage: the slot's size comes
     from the column and never from its child, so writing the
     stage's size back cannot feed into the measurement.
     ============================================================ */
  useEffect(() => {
    const fit = () => {
      const stage = host.current, slot = stage?.parentElement;
      if (stage && slot) {
        const r = slot.getBoundingClientRect();
        const ratio = BOARD.w / H;
        // -2 for the stage's 1px border, which sits outside the board itself
        const avW = Math.max(0, r.width - 2), avH = Math.max(0, r.height - 2);
        const w = Math.min(avW, avH * ratio);
        if (w > 0) {
          stage.style.width = `${Math.round(w)}px`;
          stage.style.height = `${Math.round(w / ratio)}px`;
          slot.parentElement?.style.setProperty('--board-w', `${Math.round(w)}px`);
          slot.parentElement?.style.setProperty('--board-h', `${Math.round(w / ratio) + 2}px`);
        }
      }
      controller.notifyRampsChanged();
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro && host.current?.parentElement) ro.observe(host.current.parentElement);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      ro?.disconnect();
    };
  }, [controller]);

  /* iOS owns the swipe-from-edge back gesture and touch-action cannot refuse
     it - only a cancelled touchstart can. And while a ramp is being dragged
     the page must not be able to slide out from under it. */
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (controller.dragging) e.preventDefault();
    };
    canvas.addEventListener('touchstart', stop, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    gestures.forEach(n => document.addEventListener(n, stop, { passive: false }));
    return () => {
      canvas.removeEventListener('touchstart', stop);
      document.removeEventListener('touchmove', onTouchMove);
      gestures.forEach(n => document.removeEventListener(n, stop));
    };
  }, [canvas, controller]);

  /* The canvas spans the BOARD, which on a tablet reaches past the design box
     on both sides, so a pointer at the very left edge is x0 (negative) rather
     than 0. Everything downstream stays in design coordinates. */
  const toBoard = (e: React.PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp(BOARD.x0 + (e.clientX - r.left) * (BOARD.w / r.width), BOARD.x0, BOARD.x1),
      y: clamp((e.clientY - r.top) * (H / r.height), 0, H),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (controller.phase !== 'plan') return;
    const p = toBoard(e);
    tap.current = null;
    dragMoved.current = false;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();

    /* 1. the selected ramp's own controls win over everything else */
    const sel = controller.selected;
    if (sel >= 0 && sel < levels.rampsUsed) {
      const s = levels.rampAt(sel)!;
      const g = levels.grabRadius(s);
      const del = levels.deleteButtonAt(s);
      if (Math.hypot(p.x - del.x, p.y - del.y) <= DEL_GRAB) {
        levels.removeRamp(sel); controller.selected = -1;
        controller.notifyRampsChanged(); return;
      }
      if (Math.hypot(p.x - s.x1, p.y - s.y1) <= g) {
        controller.dragging = { mode: 'p1', ix: sel, lx: p.x, ly: p.y }; return;
      }
      if (Math.hypot(p.x - s.x2, p.y - s.y2) <= g) {
        controller.dragging = { mode: 'p2', ix: sel, lx: p.x, ly: p.y }; return;
      }
      if (distToSeg(p.x, p.y, s) <= RAMP_HT + PICK_PAD) {
        controller.dragging = { mode: 'move', ix: sel, lx: p.x, ly: p.y }; return;
      }
    }

    /* 2. tapping any other placed ramp selects it, and the same gesture can go
          straight on to dragging it - a tap that never moves just selects */
    const pick = levels.pickRamp(p.x, p.y);
    if (pick >= 0) {
      controller.selected = pick;
      controller.dragging = { mode: 'move', ix: pick, lx: p.x, ly: p.y };
      controller.notifyRampsChanged();
      return;
    }

    /* 3. empty board. With a ramp selected, the tap only puts it down -
          dropping the ball on it would spend a ball the player never meant
          to. Otherwise it is the drop, decided on release. */
    if (controller.selected >= 0) {
      controller.selected = -1; controller.notifyRampsChanged();
      return;
    }
    tap.current = { x: p.x, y: p.y, ripple: ripple(e) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toBoard(e);
    const drag = controller.dragging;
    if (drag) {
      if (!levels.rampAt(drag.ix)) { controller.dragging = null; return; }
      if (drag.mode === 'move') levels.moveRampBy(drag.ix, p.x - drag.lx, p.y - drag.ly);
      else levels.rotateRamp(drag.ix, drag.mode === 'p1' ? 1 : 2, p);
      if (p.x !== drag.lx || p.y !== drag.ly) dragMoved.current = true;
      drag.lx = p.x; drag.ly = p.y;
      e.preventDefault();
      return;
    }
    const t = tap.current;
    if (t && Math.hypot(p.x - t.x, p.y - t.y) > TAP_SLOP) {
      t.ripple?.remove();
      tap.current = null;                   // a slide, not a tap
    }
  };

  const endGesture = () => {
    const t = tap.current;
    tap.current = null;
    if (controller.dragging) {
      controller.dragging = null;
      if (dragMoved.current) controller.rampAdjusted();
      else controller.notifyRampsChanged();
      return;
    }
    if (!t) return;
    t.ripple?.classList.add('go');
    controller.drop();
  };

  // Skip ends the walkthrough; the retry bubble after it has its own OK
  const step = controller.tutorialStep();
  const skippable = step !== null && step !== 'retry';

  return (
    <div className="board-slot">
    <div className="stage" ref={host}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={e => { endGesture(); e.preventDefault(); }}
         onPointerCancel={() => {
           tap.current?.ripple?.remove(); tap.current = null;
           controller.dragging = null;
           controller.notifyRampsChanged();
         }}>
      {skippable && (
        /* stopPropagation: the stage's own pointerdown captures the pointer and
           calls preventDefault, which would otherwise swallow this button's
           click before it ever fired */
        <button className="tut-skip" id="btn-skip"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); controller.tutorialSkip(); }}>
          Skip
        </button>
      )}
      {/* on-board chrome: the status caption. Out of flow and
          pointer-transparent, so it can never swallow a tap. */}
      {children}
    </div>
    </div>
  );
}
