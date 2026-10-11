// Logs in ONCE before the map tests and saves the session to
// e2e/.auth/admin.json (git-ignored), so the tests don't log in every time
// and never trip the login rate limit. "Remember me" is ticked because only
// then does the app keep the session in storage Playwright can save.
import { test as setup, expect } from '@playwright/test';
import { AUTH_FILE, E2E_EMAIL, E2E_PASSWORD } from './env.js';

setup('log in as super admin', async ({ page }) => {
  setup.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD (see e2e/.env.e2e.example).');
  setup.setTimeout(120_000); // a sleeping Render backend can take a minute to wake up

  await page.goto('/');
  await page.getByPlaceholder('Enter your email').fill(E2E_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(E2E_PASSWORD);
  await page.locator('#login-remember').check({ force: true });
  await page.locator('button[type="submit"]').click();

  // Super admin's sidebar has Tracking & Maps → Geofence Monitor.
  await expect(page.getByText('Geofence Monitor')).toBeVisible({ timeout: 90_000 });
  await page.context().storageState({ path: AUTH_FILE });
});
