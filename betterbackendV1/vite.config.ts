import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// CravAche "betterbackend" build.
//
// The proven game (js/ css/ art/) lives in public/ and is served verbatim as
// classic scripts in index.html — so gameplay (drag, music, saves) is byte-for-
// byte the working vanilla version. The Vite/TS/Howler/GSAP layer lives in src/
// and is bundled. vite-plugin-pwa replaces the hand-written sw.js: it generates
// a service worker that precaches the build for offline + installable PWA, which
// is also what makes this cheap to serve to many players (returning visits are
// served from cache, not your host).
export default defineConfig({
  base: './',
  server: { port: 5190, host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // precache the bundled output + the verbatim game assets in public/
      includeAssets: ['art/**/*', 'css/**/*', 'js/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2,mp3,ogg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'CravAche',
        short_name: 'CravAche',
        description: 'An Indian ad-agency survival sim.',
        theme_color: '#0a0e1a',
        background_color: '#05070f',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'art/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'art/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
