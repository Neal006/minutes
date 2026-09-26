// Live, nothing mocked: speech → Groq Whisper → transcript; OpenRouter (free) → notes and answers.
// Afterwards every AI call is checked for provenance, and each OpenRouter response id is looked up in
// OpenRouter's own generation log (model served, cost).
import { readFileSync, statSync } from 'node:fs';
import { expect, test } from '@playwright/test';

type Call = { task: 'transcribe' | 'notes' | 'answer'; provider: string; model: string; id?: string; ms: number; at: string };

function aiCalls(): Call[] {
  try {
    return readFileSync(process.env.AI_CALL_LOG!, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** OpenRouter's record of a generation. Stats land a few seconds after the response, so poll. */
async function openRouterGeneration(id: string): Promise<{ model: string; total_cost: number; provider_name?: string }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });
    if (res.ok) return (await res.json()).data;
    if (res.status !== 404) throw new Error(`OpenRouter generation ${id}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`OpenRouter has no record of generation ${id}`);
}

test('a spoken meeting is transcribed by Groq, then summarized and answered by free OpenRouter models', async ({ page }, testInfo) => {
  const audioSec = (statSync(process.env.LIVE_AUDIO!).size - 44) / 32_000;

  // 1. Record through the real UI. Chromium's microphone plays the synthesized meeting (e2e/live/script.ts).
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page).toHaveURL(/#\/m\/[0-9a-f-]{36}$/);
  const meetingId = page.url().split('/m/')[1];
  await expect(page.locator('.banner.live')).toContainText('Recording');
  await page.waitForTimeout((audioSec + 2) * 1000);
  await page.getByRole('button', { name: 'Stop' }).click();

  // 2. Transcript (Groq) and notes (OpenRouter) as the user sees them.
  await expect(page.locator('.summary')).toBeVisible({ timeout: 180_000 });
  const transcript = await page.locator('.transcript').innerText();
  expect(transcript).not.toContain('mock transcript');
  for (const said of [/pricing/i, /twelve|12/i, /friday/i, /beta customers/i, /billing migration/i]) expect(transcript).toMatch(said);

  const notes = await page.locator('section', { has: page.locator('.summary') }).innerText();
  expect(notes).toMatch(/pricing|team plan/i);
  await expect(page.locator('.items li').first()).toBeVisible();
  await testInfo.attach('meeting.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  // 3. Ask a question in the UI; the answer must come back grounded in this meeting.
  await page.goto('/#/ask');
  const box = page.getByPlaceholder('e.g. What did we promise Acme?');
  await box.fill('When is the pricing page draft due?');
  await box.press('Enter');
  const answer = page.locator('.turn .answer').first();
  await expect(answer).toBeVisible({ timeout: 120_000 });
  await expect(answer).toContainText(/friday/i);
  await expect(page.locator(`.turn a.cite[href*="${meetingId}"]`).first()).toBeVisible();
  await testInfo.attach('ask.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  // 4. Provenance: every call went to Groq or OpenRouter free models, and nothing else answered.
  const calls = aiCalls();
  const byTask = (t: Call['task']) => calls.filter((c) => c.task === t);
  expect(byTask('transcribe').length).toBeGreaterThan(0);
  expect(byTask('notes').length).toBeGreaterThan(0);
  expect(byTask('answer').length).toBeGreaterThan(0);
  for (const c of byTask('transcribe')) {
    expect(c).toMatchObject({ provider: 'api.groq.com', model: 'whisper-large-v3-turbo' });
    expect(c.id, 'Groq request id').toBeTruthy();
  }

  const verified = [];
  for (const c of [...byTask('notes'), ...byTask('answer')]) {
    expect(c.provider).toBe('openrouter');
    expect(c.model).toMatch(/:free$|^openrouter\/free$/);
    expect(c.id).toMatch(/^gen-/);
    const gen = await openRouterGeneration(c.id!);
    // The log stores the dated canonical slug (…-a12b-20230311:free) of the alias the API returned.
    const canonical = (m: string) => m.replace(/-\d{8}(?=:free$)/, '');
    expect(gen.model, `OpenRouter's log for ${c.id}`).toMatch(/:free$/);
    expect(canonical(gen.model), `OpenRouter's log for ${c.id}`).toBe(canonical(c.model));
    expect(gen.total_cost, `cost of ${c.id}`).toBe(0);
    verified.push({ ...c, openrouter: { model: gen.model, provider: gen.provider_name, total_cost: gen.total_cost } });
  }
  expect(calls.every((c) => c.provider === 'api.groq.com' || c.provider === 'openrouter')).toBe(true);

  const report = { meetingId, transcribe: byTask('transcribe'), openrouter: verified };
  await testInfo.attach('provenance.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify(report, null, 2));
});
