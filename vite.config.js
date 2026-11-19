import { defineConfig } from 'vite';

// Relative base: the built site works from any sub-path (GitHub Pages, itch.io, a CDN folder...).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 0,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
