import { chromium, expect, test as base, type APIRequestContext, type Browser } from '@playwright/test';

export const APP = 'http://localhost:3100';
const OBSCURA = 'http://127.0.0.1:9333';

/** `page` backed by Obscura over CDP, one fresh page per test. */
export const test = base.extend<object, { obscura: Browser }>({
  obscura: [
    async ({}, use) => {
      const browser = await chromium.connectOverCDP(OBSCURA);
      await use(browser);
      await browser.close();
    },
    { scope: 'worker' },
  ],
  page: async ({ obscura }, use) => {
    const context = obscura.contexts()[0] ?? (await obscura.newContext());
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});
export { expect };

type Status = 'recording' | 'processing' | 'ready' | 'failed';

export async function waitForStatus(request: APIRequestContext, id: string, status: Status) {
  await expect
    .poll(async () => (await (await request.get(`${APP}/api/meetings/${id}`)).json()).status, { timeout: 10_000 })
    .toBe(status);
}

/**
 * Create a meeting through the real API. With the mock provider a non-WAV chunk is read as
 * text: each `lines` entry becomes a 5-second transcript segment.
 */
export async function createMeeting(request: APIRequestContext, lines: string[], opts: { finish?: boolean; expect?: Status } = {}) {
  const { id } = await (await request.post(`${APP}/api/meetings`, { data: {} })).json();
  const put = await request.put(`${APP}/api/meetings/${id}/chunks/0?start_ms=0`, { data: Buffer.from(lines.join('|')), headers: { 'content-type': 'audio/x-mock' } });
  expect(put.status()).toBe(202);
  if (opts.finish !== false) {
    await request.post(`${APP}/api/meetings/${id}/finish`, { data: { duration_ms: lines.length * 5000 } });
    await waitForStatus(request, id, opts.expect ?? 'ready');
  }
  return id as string;
}
