import { test, expect } from '@playwright/test';

// Minimal public-surface smoke test. Expands in E10 (Quality) to cover the
// seed-to-graph flow. Everything here must work without authentication.
test('dashboard loads and shows the OSINT shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  // Brand mark is present on every page via the header.
  await expect(page.getByText('RTAIP')).toBeVisible();
});

test('admin surface is not reachable anonymously', async ({ page }) => {
  await page.goto('/admin');
  // RequireAdmin redirects unauthenticated visitors back to the dashboard.
  await expect(page).not.toHaveURL(/\/admin$/);
});
