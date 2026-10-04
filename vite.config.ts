import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* ============================================================
   ONE BUILD PER PORTAL

   Neither portal injects its SDK for us: the game has to load
   it itself, and each portal wants only its own. So the build
   is told which portal it is for and puts that one <script> in
   the page head, where it runs before the game's module - which
   is what lets Ads.init() find it on its first look.

     npm run build              # own site / no ads (ketugames.com)
     npm run build:crazygames   # VITE_PLATFORM=crazygames
     npm run build:poki         # VITE_PLATFORM=poki
     VITE_GD_GAME_ID=<id> npm run build:gamedistribution
   ============================================================ */
const SDK_SRC: Record<string, string> = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
  gamedistribution: 'https://html5.api.gamedistribution.com/main.min.js',
};

function portalSdk(platform: string, gdGameId: string): Plugin {
  return {
    name: 'portal-sdk',
    transformIndexHtml() {
      const src = SDK_SRC[platform];
      if (!src) return [];
      /* GameDistribution reads its options from a global that must exist
         BEFORE its script runs, and every event is forwarded to the game. One
         inline script does both, in that order, so nothing depends on how the
         page head is assembled: it sets the options, then writes the SDK tag
         synchronously (the game's own module runs after it). */
      if (platform === 'gamedistribution')
        return [{ tag: 'script', injectTo: 'head-prepend',
          children: 'window.GD_OPTIONS_SET=true;window.GD_OPTIONS={gameId:' + JSON.stringify(gdGameId) +
                    ',onEvent:function(e){if(window.__gdOnEvent)window.__gdOnEvent(e);}};' +
                    'document.write(\'<script src="' + src + '"><\\/script>\');' }];
      return [{ tag: 'script', attrs: { src }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = (loadEnv(mode, process.cwd(), '').VITE_PLATFORM || process.env.VITE_PLATFORM || '').toLowerCase();
  if (platform && !SDK_SRC[platform]) throw new Error(`VITE_PLATFORM "${platform}" - expected crazygames, poki or gamedistribution`);
  const gdGameId = loadEnv(mode, process.cwd(), '').VITE_GD_GAME_ID || process.env.VITE_GD_GAME_ID || '';
  if (platform === 'gamedistribution' && !gdGameId)
    throw new Error('gamedistribution build needs your game ID: VITE_GD_GAME_ID=<id from the GameDistribution dashboard> npm run build:gamedistribution');
  return {
    plugins: [react(), portalSdk(platform, gdGameId)],
    // the game shipped as a single portable file; keep the build relative so it
    // still runs from a file:// path or any sub-directory on a portal
    base: './',
    build: { outDir: 'dist', target: 'es2020' },
  };
});
