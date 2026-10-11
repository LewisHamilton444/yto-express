// Playwright end-to-end tests for the Geofence Monitor (e2e/).
//   npx playwright test                 run everything (headless)
//   npx playwright test --headed        watch the browser (demo)
//   npx playwright test security        API security checks only (no login)
// Settings come from environment variables / e2e/.env.e2e — see e2e/env.js.
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, AUTH_FILE } from './e2e/env.js';

export default defineConfig({
  testDir: './e2e',
  // The tests share the two QA riders, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 }, // the page refreshes every 3 s; allow a few refreshes
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Logs in once and saves the session for the map tests.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // API-only security checks: no browser login needed.
    { name: 'api', testMatch: /location-security\.spec\.js/ },
    // Browser tests on #/geofence, using the saved session.
    {
      name: 'geofence',
      testMatch: /geofence-.*\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: AUTH_FILE },
    },
  ],
});
