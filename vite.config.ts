import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // the game shipped as a single portable file; keep the build relative so it
  // still runs from a file:// path or any sub-directory on a portal
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
});
