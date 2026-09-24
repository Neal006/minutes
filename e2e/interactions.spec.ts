// Interactions that Obscura 0.2.3 can't drive faithfully, run in Chromium instead
// (see e2e/README.md for the details of each gap).
import { expect, test } from '@playwright/test';
import { createMeeting } from './fixtures.ts';

test('"/" focuses search without typing a slash', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.meeting-list li').first()).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.locator('.search-box input')).toBeFocused();
  await expect(page.locator('.search-box input')).toHaveValue('');
  await page.keyboard.type('billing');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/search\?q=billing$/);

  // Typing "/" inside a text field is just a slash.
  await page.goto('/#/ask');
  await page.locator('.ask-form textarea').type('a/b');
  await expect(page.locator('.ask-form textarea')).toHaveValue('a/b');
});

test('checking off an action item persists and updates the list count', async ({ page, request }) => {
  const id = await createMeeting(request, ["I'll send the deck to the team", 'We agreed on the scope', "I'll book the venue"]);
  await page.goto(`/#/m/${id}`);
  const first = page.locator('.items li').filter({ hasText: 'send the deck' });
  await first.locator('input[type=checkbox]').check();
  await expect(first).toHaveClass(/done/);

  await page.reload(); // state comes back from the server
  await expect(page.locator('.items li').filter({ hasText: 'send the deck' }).locator('input')).toBeChecked();
  await page.goto('/#/');
  await expect(page.locator('.meeting-list a').filter({ hasText: "Mock: I'll send the deck" })).toContainText('1 open action item');
});

test('a failed toggle is rolled back', async ({ page, request }) => {
  const id = await createMeeting(request, ["I'll write the release notes"]);
  await page.route('**/api/action-items/*', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
  await page.goto(`/#/m/${id}`);
  const box = page.locator('.items input[type=checkbox]');
  await box.click();
  await expect(box).not.toBeChecked(); // optimistic update reverted
});
