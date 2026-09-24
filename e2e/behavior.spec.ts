// User-behavior tests, driven through the Obscura headless browser over CDP.
// Seeded meetings are read-only here; tests that change data create their own meetings.
import { APP, createMeeting, expect, test, waitForStatus } from './fixtures.ts';

test('browse meetings and read the notes of one', async ({ page }) => {
  await page.goto(`${APP}/#/`);
  await expect(page.locator('.row-title')).toContainText(['Pricing page redesign sync', 'Acme onboarding call', 'Transcription latency review']);
  await expect(page.locator('.meeting-list li').first()).toContainText('3 open action items');

  await page.locator('.row-title', { hasText: 'Pricing page redesign sync' }).click();
  await expect(page).toHaveURL(/#\/m\/seed-pricing$/);
  await expect(page.locator('.title-input')).toHaveValue('Pricing page redesign sync');
  await expect(page.locator('.summary')).toContainText('flat Team plan');
  await expect(page.locator('.decisions li')).toHaveCount(2);
  await expect(page.locator('.items li')).toHaveCount(3);
  await expect(page.locator('.items li').filter({ hasText: 'billing migration plan' })).toContainText('Marcus');
  await expect(page.locator('.transcript li')).toHaveCount(12);

  await page.locator('.brand').click();
  await expect(page).toHaveURL(/#\/$/);
});

test('search from the header and jump to the exact moment', async ({ page }) => {
  await page.goto(`${APP}/#/`);
  await expect(page.locator('.meeting-list li').first()).toBeVisible();
  // The "/" shortcut is covered in Chromium (interactions.spec.ts): Obscura types the "/" into
  // the box even though the handler calls preventDefault().
  await page.locator('.search-box input').fill('billing');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/search\?q=billing/);
  await expect(page.locator('.page-title')).toContainText('billing');
  await expect(page.locator('.result-group mark').first()).toHaveText('billing');
  const hit = page.locator('.result-group li a').filter({ hasText: 'migration plan' });
  await expect(hit.locator('.ts')).toHaveText('2:41');

  await hit.click();
  await expect(page).toHaveURL(/#\/m\/seed-pricing\?t=161000/);
  await expect(page.locator('.transcript li.active')).toContainText('migration plan for the billing service');
});

test('a search with no hits offers to ask instead', async ({ page }) => {
  await page.goto(`${APP}/#/search?q=zebra%20migration%20budget%20flamingo`);
  // AND semantics: not every word appears together, so nothing matches.
  await expect(page.locator('.empty')).toContainText('No transcript mentions');
  await page.getByText('ask a question').click();
  await expect(page).toHaveURL(/#\/ask\?q=/);
  await expect(page.locator('.ask-form textarea')).toHaveValue('zebra migration budget flamingo');
});

test('ask a question and follow a citation to the source', async ({ page }) => {
  await page.goto(`${APP}/#/ask`);
  await page.getByRole('button', { name: 'What did we decide about pricing?' }).click();
  await expect(page.locator('.question')).toHaveText('What did we decide about pricing?');
  await expect(page.locator('.answer')).toContainText('Mock answer');
  await expect(page.locator('.sources li')).toHaveCount(1);

  const cite = page.locator('.answer a.cite');
  await expect(cite).toHaveText('1');
  await cite.click();
  await expect(page).toHaveURL(/#\/m\/seed-[a-z]+\?t=\d+/);
  await expect(page.locator('.transcript li.active')).toHaveCount(1);
});

test('asking with nothing relevant says so, without citations', async ({ page }) => {
  await page.goto(`${APP}/#/ask`);
  await page.locator('.ask-form textarea').fill('What is the airspeed of an unladen swallow?');
  await page.keyboard.press('Enter');
  await expect(page.locator('.answer')).toHaveText("I couldn't find anything about that in your meetings.");
  await expect(page.locator('.sources')).toHaveCount(0);
});

test('rename a meeting: Escape cancels, Enter saves', async ({ page, request }) => {
  const id = await createMeeting(request, ['Kickoff for the onboarding revamp']);
  await page.goto(`${APP}/#/m/${id}`);
  const title = page.locator('.title-input');
  await expect(title).toHaveValue('Mock: Kickoff for the onboarding revamp');

  await title.click();
  await title.fill('Throwaway');
  await title.press('Escape');
  await expect(title).toHaveValue('Mock: Kickoff for the onboarding revamp');

  await title.click();
  await title.fill('Onboarding revamp kickoff');
  await title.press('Enter');
  await expect.poll(async () => (await (await request.get(`${APP}/api/meetings/${id}`)).json()).title).toBe('Onboarding revamp kickoff');
  await page.goto(`${APP}/#/m/${id}`);
  await expect(page.locator('.title-input')).toHaveValue('Onboarding revamp kickoff');
});

test('deleting needs a second click, and the first click times out', async ({ page, request }) => {
  const id = await createMeeting(request, ['Temporary meeting to delete']);
  await page.goto(`${APP}/#/m/${id}`);
  // exact: "Delete" would otherwise also match "Click again to delete".
  const del = page.getByRole('button', { name: 'Delete', exact: true });
  const confirm = page.getByRole('button', { name: 'Click again to delete', exact: true });
  await del.click();
  await expect(confirm).toBeVisible();
  await expect(del).toBeVisible({ timeout: 5000 }); // reverted after 3s, nothing deleted
  expect((await request.get(`${APP}/api/meetings/${id}`)).status()).toBe(200);

  await del.click();
  await confirm.click();
  await expect(page).toHaveURL(/#\/$/);
  expect((await request.get(`${APP}/api/meetings/${id}`)).status()).toBe(404);
});

test('an interrupted recording can be processed from its page', async ({ page, request }) => {
  const id = await createMeeting(request, ["The laptop died mid-meeting", "I'll resend the invite"], { finish: false });
  await page.goto(`${APP}/#/m/${id}`);
  await expect(page.locator('.banner.warn')).toContainText('interrupted');
  await expect(page.locator('.transcript li')).toHaveCount(2); // transcript arrived before the crash
  await page.getByRole('button', { name: 'Process now' }).click();
  await expect(page.locator('.summary')).toContainText('Mock summary of 2 transcript lines');
  await expect(page.locator('.items li')).toHaveCount(1);
});

test('when notes fail, the error is shown and "Try again" recovers', async ({ page, request }) => {
  const id = await createMeeting(request, ['[[flaky]] Quarterly planning review'], { expect: 'failed' });
  await page.goto(`${APP}/#/m/${id}`);
  await expect(page.locator('.banner.error')).toContainText('simulated outage');
  await expect(page.locator('.notes-pending')).toContainText('Notes unavailable');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.summary')).toContainText('Mock summary');
  await waitForStatus(request, id, 'ready');
});

test('an unknown meeting shows a way back', async ({ page }) => {
  await page.goto(`${APP}/#/m/does-not-exist`);
  await expect(page.locator('.empty')).toContainText("doesn't exist");
  await page.getByText('Back to meetings').click();
  await expect(page).toHaveURL(/#\/$/);
});

test('transcript text is never rendered as HTML', async ({ page, request }) => {
  const id = await createMeeting(request, ['<img src=x onerror="window.__xss=1"> pricing <b>bold</b>']);
  await page.goto(`${APP}/#/search?q=pricing%20bold`);
  await expect(page.locator('.result-group li').first()).toContainText('<img src=x');
  await page.goto(`${APP}/#/m/${id}`);
  await expect(page.locator('.transcript li').first()).toContainText('<b>bold</b>');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('.transcript img, .result-group img').count()).toBe(0);
});
