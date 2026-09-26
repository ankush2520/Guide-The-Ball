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
   ============================================================ */
const SDK_SRC: Record<string, string> = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
};

function portalSdk(platform: string): Plugin {
  return {
    name: 'portal-sdk',
    transformIndexHtml() {
      const src = SDK_SRC[platform];
      return src ? [{ tag: 'script', attrs: { src }, injectTo: 'head-prepend' }] : [];
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = (loadEnv(mode, process.cwd(), '').VITE_PLATFORM || process.env.VITE_PLATFORM || '').toLowerCase();
  if (platform && !SDK_SRC[platform]) throw new Error(`VITE_PLATFORM "${platform}" - expected crazygames or poki`);
  return {
    plugins: [react(), portalSdk(platform)],
    // the game shipped as a single portable file; keep the build relative so it
    // still runs from a file:// path or any sub-directory on a portal
    base: './',
    build: { outDir: 'dist', target: 'es2020' },
  };
});
