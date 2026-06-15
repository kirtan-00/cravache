import { expect, test } from '@playwright/test';

// The kind of check unit tests can't do: actually boot the game in a browser
// and confirm it starts cleanly (catches the "drag feels glitchy / console
// errors on boot" class of regressions).
test('boots to home and starts a shift with no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.getByText('PUNCH IN').click();
  await page.waitForTimeout(2000);
  await expect(page.locator('#game')).toBeVisible();
  expect(errors).toEqual([]);
});
