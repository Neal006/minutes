// Recording needs getUserMedia + MediaRecorder, which Obscura doesn't implement, so these run in
// Chromium with a fake microphone (a steady beep) and the mock AI provider.
import { expect, test } from '@playwright/test';

test('record → live banner → stop → notes, with WAV chunks uploaded', async ({ page }) => {
  const uploads: { type: string | null; status: number }[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/chunks/')) uploads.push({ type: res.request().headers()['content-type'] ?? null, status: res.status() });
  });

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page).toHaveURL(/#\/m\/[0-9a-f-]{36}$/);
  await expect(page.locator('.rec-pill')).toBeVisible();
  await expect(page.locator('.banner.live')).toContainText('Recording');
  await expect(page.locator('.rec-pill')).toContainText('0:03', { timeout: 6000 }); // timer ticks

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.rec-idle')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.summary')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.transcript li').first()).toContainText('mock transcript of recorded audio');
  await expect(page.locator('.transcript audio')).toHaveCount(1); // playback file uploaded

  expect(uploads.length).toBeGreaterThanOrEqual(1);
  expect(uploads.every((u) => u.type === 'audio/wav' && u.status === 202)).toBe(true);
});

test('chunks that fail to upload are retried until they get through', async ({ page }) => {
  let failures = 0;
  await page.route('**/api/meetings/*/chunks/*', async (route) => {
    if (failures < 2) {
      failures++;
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('.banner.live')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.locator('.toast.warn')).toContainText('Connection lost');
  await expect(page.locator('.summary')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.toast.warn')).toHaveCount(0);
  expect(failures).toBe(2);
});

test('a denied microphone shows a clear, dismissible error', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Record' }).click();
  const toast = page.locator('.toast[role=alert]');
  await expect(toast).toContainText('Microphone access was denied');
  await expect(page).toHaveURL(/#\/$/); // no meeting was created
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});
