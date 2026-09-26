/* ============================================================
   GAME CANVAS

   Adopts the renderer's canvas into the layout and owns every
   pointer gesture on the board.

   A RAMP IS DRAWN HERE. A drag that starts on empty board is a
   new ramp: the press is one end, the finger is the other, and
   what is on screen while you drag is exactly what gets placed.
   Position, length and angle in one gesture.

   That shares the empty board with the drop, and the two are
   told apart by the same slop the tap already used: let go
   without having moved and it is a tap, which drops the ball;
   move past TAP_SLOP and it is a ramp. A drag can never drop,
   and a tap can never draw.

   Everything already ON the board comes first, unchanged: select
   a ramp, drag an end to reshape it, drag the middle to move it,
   × to delete.

   A SPRING out of the bag needs no grammar of its own at all,
   which is most of why it replaced the bar. It has no position,
   no length and no heading to set - it goes on a ramp - so the
   whole gesture is ONE TAP on one of the player's own lines,
   tested before everything else while it is armed. A tap that
   lands anywhere else puts it back in the bag rather than
   fitting it somewhere meaningless.

   All hit-testing is done in BOARD coordinates, so a grab radius
   means the same thing whatever size the canvas is displayed at.
   ============================================================ */
import { useEffect, useRef, type ReactNode } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { H, RAMP_HT, BOARD, PLAY } from '../physics/constants';
import { clamp, distToSeg } from '../physics/math';
import { unviewX, unviewY } from '../render/view';
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
  /* The canvas's rect, measured once per gesture. Reading it inside every
     pointermove forces a synchronous layout, and a drag fires a move per
     frame - with the ripple writing style into the same frame, that is the
     classic read/write thrash. The board cannot move under a finger: fit()
     clears this whenever the layout it was measured against changes. */
  const rect = useRef<DOMRect | null>(null);

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
      rect.current = null;              // whatever we measured is now stale
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

  /* ============================================================
     KEEPING THE PAGE STILL UNDER A DRAG

     iOS owns the swipe-from-edge back gesture and touch-action
     cannot refuse it - only a cancelled touchstart can. And
     while a ramp is being dragged the page must not be able to
     slide out from under it.

     The touchmove guard is ARMED PER GESTURE rather than left on
     the document for the life of the page. A non-passive
     touchmove listener on the document tells the browser that
     any touch, anywhere, might be cancelled, so it can no longer
     move the page on the compositor and has to wait for our
     JavaScript before it responds to the finger - on every
     touch, including the ones we never had any intention of
     blocking. That is paid as input latency, which is exactly
     the kind of small, constant lag that is hard to point at.

     Armed on pointerdown, dropped on the way back up, so the
     cost is only ever carried by a gesture that is actually on
     the board and can actually be cancelled.
     ============================================================ */
  const touchGuard = useRef<((e: TouchEvent) => void) | null>(null);
  const armTouchGuard = () => {
    if (touchGuard.current) return;
    const h = (e: TouchEvent) => {
      if (controller.dragging || controller.draft)
        e.preventDefault();
    };
    touchGuard.current = h;
    document.addEventListener('touchmove', h, { passive: false });
  };
  const dropTouchGuard = () => {
    if (!touchGuard.current) return;
    document.removeEventListener('touchmove', touchGuard.current);
    touchGuard.current = null;
  };

  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    canvas.addEventListener('touchstart', stop, { passive: false });
    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    gestures.forEach(n => document.addEventListener(n, stop, { passive: false }));
    return () => {
      canvas.removeEventListener('touchstart', stop);
      dropTouchGuard();
      gestures.forEach(n => document.removeEventListener(n, stop));
    };
  }, [canvas, controller]);

  /* The canvas spans the BOARD, which on a tablet reaches past the design box
     on both sides, so a pointer at the very left edge is x0 (negative) rather
     than 0. Everything downstream stays in design coordinates.

     Two steps, because the scene is painted smaller than the board it sits in
     (see render/view.ts): the rect gives VIEW coordinates - where the finger
     landed on the surface - and unview backs out the scale to say which part
     of the LEVEL that was. A tap out in the sky margin lands past the design
     box and is clamped to its edge, exactly as one past a tablet's margin
     always has been. */
  const toBoard = (e: React.PointerEvent) => {
    const r = rect.current ?? (rect.current = canvas.getBoundingClientRect());
    const vx = BOARD.x0 + (e.clientX - r.left) * (BOARD.w / r.width);
    const vy = (e.clientY - r.top) * (H / r.height);
    return {
      x: clamp(unviewX(vx), PLAY.x0, PLAY.x1),
      y: clamp(unviewY(vy), PLAY.y0, PLAY.y1),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    /* A press that starts on UI laid over the board - a button, or a panel
       marked data-ui (the offer strips) - belongs to that UI, never to the
       board: it must not draw, select, or drop the ball. Checked first, so
       no gesture is even armed and the release cannot turn it into a drop. */
    if ((e.target as Element).closest?.('button, a, input, select, textarea, [data-ui]')) return;
    if (controller.phase !== 'plan') return;
    /* the tail of a tap on a card or panel that just closed - see holdBoardInput */
    if (controller.boardInputHeld) return;
    rect.current = null;                // a fresh measure for this gesture
    armTouchGuard();
    const p = toBoard(e);
    tap.current = null;
    dragMoved.current = false;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();

    /* 0. A SPRING IS ARMED. It beats every other reading of a tap, including
          the controls of whatever happens to be selected: the player has just
          said "this one goes on a ramp", and the next thing they touch is the
          answer. On a ramp it fits; anywhere else it goes back in the bag. */
    if (controller.armedSpring) {
      const onRamp = levels.pickRamp(p.x, p.y);
      if (onRamp >= 0) controller.fitSpring(onRamp);
      else controller.disarmSpring();
      return;
    }

    /* 1. the selected ramp's own controls win over everything else */
    const sel = controller.selected;
    if (sel >= 0 && sel < levels.rampsUsed) {
      const s = levels.rampAt(sel)!;
      const g = levels.grabRadius(s);
      const del = levels.deleteButtonAt(s);
      if (Math.hypot(p.x - del.x, p.y - del.y) <= DEL_GRAB) {
        controller.removeRamp(sel); return;
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

    /* 3. empty board. With something selected, the gesture only puts it down -
          drawing or dropping straight off a deselect is a move the player did
          not ask for. Otherwise it is a ramp if it travels and the drop if it
          does not, decided on release. */
    if (controller.selected >= 0) {
      controller.selected = -1;
      controller.notifyRampsChanged();
      return;
    }
    tap.current = { x: p.x, y: p.y, ripple: ripple(e) };
    /* Armed now, drawn from the first move. With no ramps left this simply
       does not start, and the gesture stays a tap - which is the right
       outcome: there is nothing to draw, but there is still a ball to drop. */
    controller.beginDraft(p);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toBoard(e);
    const drag = controller.dragging;
    if (drag) {
      if (!levels.rampAt(drag.ix)) { controller.dragging = null; return; }
      if (drag.mode === 'move') levels.moveRampBy(drag.ix, p.x - drag.lx, p.y - drag.ly);
      else levels.moveRampEnd(drag.ix, drag.mode === 'p1' ? 1 : 2, p);
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
    /* The ramp follows the finger from here. Updated even inside the slop, so
       the line is already the right length the instant it appears rather than
       jumping to catch up. */
    if (controller.draft) {
      controller.updateDraft(p);
      e.preventDefault();
    }
  };

  const endGesture = () => {
    dropTouchGuard();
    const t = tap.current;
    tap.current = null;
    if (controller.dragging) {
      controller.dragging = null;
      if (dragMoved.current) controller.rampAdjusted();
      else controller.notifyRampsChanged();
      return;
    }
    /* A DRAG PLACES THE RAMP, A TAP DROPS. `t` survives only if the finger
       never left the slop, so the two can never both fire: the draft is
       thrown away under MIN_RAMP, and a tap's draft is always under it. */
    if (controller.draft) {
      const drew = controller.commitDraft();
      if (drew) { t?.ripple?.remove(); return; }
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
           dropTouchGuard();
           tap.current?.ripple?.remove(); tap.current = null;
           controller.dragging = null;
           controller.cancelDraft();
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
