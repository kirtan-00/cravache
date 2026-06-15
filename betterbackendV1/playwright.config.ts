import { defineConfig } from '@playwright/test';

// E2E smoke tests. Boots the dev server, then drives the real game in a browser
// (PUNCH IN, drag a brief onto a desk) — the kind of check that catches "the
// drag feels glitchy" regressions that unit tests can't.
// Run `npx playwright install chromium` once before `npm run e2e`.
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:5190' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
