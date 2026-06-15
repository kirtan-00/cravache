# CravAche — betterbackendV1

The **modern-vanilla** build of CravAche: the proven imperative canvas game, wrapped
in a real toolchain (Vite + TypeScript + PWA + Howler + GSAP + Vitest + Playwright +
Biome). **No UI framework** — the game stays canvas + `window.G`, which is the right
shape for a 60fps game (and why dragging is smooth here).

## Run it

```bash
npm install
npm run dev        # http://localhost:5190
npm run build      # static, PWA-enabled bundle in dist/  (deploy to any CDN)
npm run preview    # serve the built bundle
npm test           # Vitest unit tests (pure engine logic)
npm run e2e        # Playwright smoke test (needs: npx playwright install chromium)
npm run lint       # Biome
```

Deploy `dist/` to any static host / CDN (Cloudflare Pages, Netlify, Vercel). Being
client-side + PWA-cached, it serves any number of concurrent players for ~free; each
player's progress saves in their own browser via localStorage.

## Layout

- `public/` — the **proven game**, served verbatim as classic scripts (load order in
  `index.html` matters). `public/js/` is the engine + render + trial layers on a global
  `window.G`. `public/css/`, `public/art/` are the assets. `public/songs/` is where the
  in-game Alexa speaker's track files go.
- `src/` — the **bundled TS layer**: `audio.ts` (Howler playlist for the speaker),
  `main.ts` (entry), `util.ts` (+ Vitest tests). New typed modules land here.
- `vite.config.ts` — `vite-plugin-pwa` generates the service worker + manifest.

## Features in this build

- **In-game Alexa speaker** (`src/audio.ts`): Howler playlist that plays
  `public/songs/01.mp3 … 04.mp3` in sequence on loop at +20% volume. If the folder has
  no audio files (default), it falls back to the built-in generative chiptune. **Drop the
  4 song files in `public/songs/` to switch to real tracks** (see note below).
- **Minimal 6PM call** (`public/js/render/modals.js` + `public/css/call.css`): a small
  ringing-landline widget, bottom-left, hold-to-LISTEN / HANG UP.
- **Right-corner brief stack** (`public/js/render/dock.js` + `public/css/briefs.css`):
  incoming briefs stack top-right, capped at 3 visible + a "+N more queued" pill.
- **Playable arcade** (`public/js/arcade.js` + `public/css/arcade.css`): click the arcade
  cabinet → a self-contained Breakout ("Brick Buster"). Esc / X / backdrop to close.
- **Water-cooler pour** animation + a synthesized "glug" SFX (`office_trial.js` +
  `audio.js`).
- **Parody client names** (`public/js/embed-data.js`): real brands → recognizable-but-safe
  parodies (Zomato→Tomato, Emirates→Emiraat, Induben Khakhrawala→Binduben Khakhrawala …).
- **Balance**: chaos decays 2 pts / in-game day; autoassign costs ₹6,00,000; the chaos
  crisis "restructure" wipe costs 70% of current cash; wall posters removed from the shop.

> **Songs / copyright note:** the speaker mechanism is built and ready, but no audio files
> are bundled. The 4 tracks are copyrighted YouTube audio — fine to drop in for a personal
> build, but do **not** ship them on a public site. With no files present, the generative
> music plays instead.

## Migration path (next step for full "modern" benefits)

The game code in `public/js/` runs as classic scripts (proven, byte-for-byte the working
game) but isn't yet bundled/tree-shaken/type-checked. To get those benefits, migrate the
`window.G` IIFE modules into typed ES modules under `src/` incrementally — start with the
pure engine systems (economy, chaos, verdict), which then become unit-testable in Vitest
like `src/util.ts` already is.
