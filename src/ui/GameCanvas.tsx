/* ============================================================
   GAME CANVAS

   Adopts the renderer's canvas into the layout and owns every
   pointer gesture on the board.

   All hit-testing is done in BOARD coordinates, so a grab radius
   means the same thing whatever size the canvas is displayed at.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { W, H, RAMP_HT } from '../physics/constants';
import { clamp, distToSeg } from '../physics/math';
import { DEL_GRAB, PICK_PAD } from '../managers/LevelManager';

export function GameCanvas() {
  const { canvas, controller, levels } = useGame();
  const host = useRef<HTMLDivElement>(null);
  useGameVersion();                       // re-render for the Skip button

  /* Mount the canvas and run the loop for as long as it is on screen. */
  useEffect(() => {
    host.current?.appendChild(canvas);
    controller.start();
    return () => { controller.stop(); canvas.remove(); };
  }, [canvas, controller]);

  /* The board is height-driven, so it has to repaint on any resize. */
  useEffect(() => {
    const onResize = () => controller.notifyRampsChanged();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
    if (ro && host.current) ro.observe(host.current);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      ro?.disconnect();
    };
  }, [controller]);

  /* iOS owns the swipe-from-edge back gesture and touch-action cannot refuse
     it - only a cancelled touchstart can. And while a ramp is mid-draw the
     page must not be able to slide out from under it. */
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (controller.draft || controller.dragging) e.preventDefault();
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

  const toBoard = (e: React.PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) * (W / r.width), 0, W),
      y: clamp((e.clientY - r.top) * (H / r.height), 0, H),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (controller.phase !== 'plan') return;
    const p = toBoard(e);
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

    /* 3. empty board: drop the selection, and start a new ramp if there is room */
    if (controller.selected >= 0) { controller.selected = -1; controller.notifyRampsChanged(); }
    if (!levels.canPlaceRamp) return;
    controller.draft = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = controller.dragging;
    if (drag) {
      const p = toBoard(e);
      if (!levels.rampAt(drag.ix)) { controller.dragging = null; return; }
      if (drag.mode === 'move') levels.moveRampBy(drag.ix, p.x - drag.lx, p.y - drag.ly);
      else levels.moveRampEnd(drag.ix, drag.mode === 'p1' ? 1 : 2, p);
      drag.lx = p.x; drag.ly = p.y;
      e.preventDefault();
      return;
    }
    const d = controller.draft;
    if (!d) return;
    const p = levels.truncate({ x: d.x1, y: d.y1 }, toBoard(e));
    d.x2 = p.x; d.y2 = p.y;
    e.preventDefault();
  };

  const endDraft = () => {
    if (controller.dragging) { controller.dragging = null; controller.notifyRampsChanged(); return; }
    const d = controller.draft;
    if (!d) return;
    levels.addRamp(d);                    // silently refuses anything too short
    controller.draft = null;
    controller.notifyRampsChanged();
  };

  const step = controller.tutorialStep();

  return (
    <div className="stage" ref={host}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={e => { endDraft(); e.preventDefault(); }}
         onPointerCancel={() => {
           controller.draft = null; controller.dragging = null;
           controller.notifyRampsChanged();
         }}>
      {step > 0 && (
        /* stopPropagation: the stage's own pointerdown captures the pointer and
           calls preventDefault, which would otherwise swallow this button's
           click before it ever fired */
        <button className="tut-skip" id="btn-skip"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); controller.tutorialSkip(); }}>
          Skip
        </button>
      )}
    </div>
  );
}
