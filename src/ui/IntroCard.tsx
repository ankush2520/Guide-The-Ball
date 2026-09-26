/* ============================================================
   THE INTRO CARD

   "Here is something new." Shown before the board is playable
   (the controller refuses draws and drops while one is up):
   a drawn icon, a title, one friendly line and "Got it". When a
   level brings several new things they come one after another,
   with small dots saying how many.
   ============================================================ */
import { useEffect, useRef } from 'react';
import { useGame, useGameVersion } from '../core/GameContext';
import { drawIntroIcon, hasIcon } from './introIcons';

export function IntroCard({ hidden }: { hidden: boolean }) {
  const { controller } = useGame();
  useGameVersion();
  const card = controller.intro;
  const cv = useRef<HTMLCanvasElement>(null);

  // the icon animates (a spring's coil, a flame) on its own clock
  useEffect(() => {
    if (!card || hidden || !hasIcon(card.icon)) return;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      if (cv.current) drawIntroIcon(card.icon, cv.current, (now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [card, hidden]);

  if (!card || hidden) return null;
  const total = controller.introTotal, at = controller.introIndex;
  return (
    <div className="overlay" id="introcard">
      <div className="card intro" data-key={card.key}>
        {hasIcon(card.icon) && <canvas ref={cv} className="introicon" aria-hidden="true" />}
        <div className="big">{card.title}</div>
        <div className="sub">{card.text}</div>
        {total > 1 && (
          <div className="introdots" aria-label={`${at} of ${total}`}>
            {Array.from({ length: total }, (_, i) => <i key={i} className={i + 1 === at ? 'on' : ''} />)}
          </div>
        )}
        <div className="row">
          <button id="btn-intro-ok" className="primary" onClick={() => controller.dismissIntro()}>Got it</button>
        </div>
      </div>
    </div>
  );
}
