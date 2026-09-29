import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles/game.css';
import { Ads } from './ads/Ads';

/* Not awaited: an SDK that is slow or absent must never hold the game up. */
void Ads.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* The KetuGames boot loader (index.html) is painted before any script runs.
   Fade it once the first frame is up. On our own site it holds a moment so
   the logo is actually seen; on a portal build it goes as soon as the game
   can be played - no splash delay there. */
const boot = document.getElementById('boot');
if (boot) {
  const hold = import.meta.env.VITE_PLATFORM ? 0 : 1200;
  requestAnimationFrame(() => setTimeout(() => {
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 450);
  }, Math.max(0, hold - performance.now())));
}
