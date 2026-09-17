/* ============================================================
   THE HINT LINE

   This used to be the action row - Drop Ball, Undo, Clear. All
   three are gone: the drop is now a tap anywhere on the board
   (GameCanvas), and a ramp is removed with the × that appears
   when you select it, which is why that × is drawn large.

   What is left is the desktop hint line. The drop cue that says
   how to drop now shares the status pill on the board's top edge
   with the miss flash (Status.tsx), which gave its row's height
   back to the board.

   Losing the row bought the board the height it used to cost,
   which on a phone is the difference between a 301px board and
   a full-width one. The hint that was under it stays for
   desktop, where the height is free; on a phone it is hidden by
   the same rule that hid it before.
   ============================================================ */
import { useGame, useGameVersion } from '../core/GameContext';

export function Controls() {
  const { controller } = useGame();
  useGameVersion();

  return <p className="hint" id="hint">{controller.hint}</p>;
}
