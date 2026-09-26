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
