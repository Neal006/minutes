// Live e2e: the real app, real OpenRouter (free models) and real Groq Whisper, nothing mocked.
// The browser's microphone plays a synthesized meeting; every AI call is logged with the provider's
// response id and checked afterwards. Needs keys, spends free-tier quota, so it is not part of CI.
//   LIVE_ENV_FILE=path/to/.env npm run e2e:live        (default: ./.env)
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const envFile = path.resolve(process.env.LIVE_ENV_FILE ?? '.env');
if (!existsSync(envFile)) throw new Error(`Live e2e needs real keys: ${envFile} not found (set LIVE_ENV_FILE)`);
process.loadEnvFile(envFile);
for (const key of ['OPENROUTER_API_KEY', 'STT_API_KEY']) {
  if (!process.env[key]) throw new Error(`Live e2e needs ${key} in ${envFile}`);
}

process.env.MINUTES_LIVE_DATA ??= mkdtempSync(path.join(tmpdir(), 'minutes-live-'));
process.env.AI_CALL_LOG = path.join(process.env.MINUTES_LIVE_DATA, 'ai-calls.jsonl');
process.env.LIVE_AUDIO = path.join(process.env.MINUTES_LIVE_DATA, 'meeting.wav');
const PORT = 3200;

export default defineConfig({
  testDir: 'e2e/live',
  globalSetup: './e2e/live/make-audio.ts',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0, // a retry would hide a flaky provider; fail loudly instead
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/live-report' }]],
  outputDir: 'e2e/.live-results',
  use: { baseURL: `http://localhost:${PORT}`, screenshot: 'on', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx tsx apps/server/src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    // Providers pinned to the real ones, so a mock can never answer: OpenRouter (free-only guard) + Whisper API.
    env: { ...process.env, DATA_DIR: process.env.MINUTES_LIVE_DATA, PORT: String(PORT), AI_PROVIDER: 'openrouter', STT_PROVIDER: 'whisper' } as Record<string, string>,
    stdout: 'pipe',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'live',
      use: {
        browserName: 'chromium',
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${process.env.LIVE_AUDIO}%noloop`,
          ],
        },
      },
    },
  ],
});
