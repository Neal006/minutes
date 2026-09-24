import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// One fresh data dir per run, shared with workers through the environment.
process.env.MINUTES_E2E_DATA ??= mkdtempSync(path.join(tmpdir(), 'minutes-e2e-'));
export const APP_PORT = 3100;
export const OBSCURA_PORT = 9333;
const obscura = path.resolve('tools/obscura', process.platform === 'win32' ? 'obscura.exe' : 'obscura');
const env = { ...process.env, DATA_DIR: process.env.MINUTES_E2E_DATA, PORT: String(APP_PORT), AI_PROVIDER: 'mock', STT_PROVIDER: 'mock' } as Record<string, string>;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one Obscura worker; tests share one server
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/.results',
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: 'retain-on-failure' },
  webServer: [
    {
      // The app with seeded demo meetings and the deterministic mock AI provider.
      command: 'npx tsx apps/server/src/seed.ts && npx tsx apps/server/src/index.ts',
      url: `http://localhost:${APP_PORT}/api/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Obscura: Rust headless browser speaking CDP. It blocks loopback by default (SSRF guard).
      command: `"${obscura}" serve --port ${OBSCURA_PORT} --allow-private-network`,
      url: `http://127.0.0.1:${OBSCURA_PORT}/json/version`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    // User-behavior flows in Obscura (no getUserMedia/media playback there, see e2e/README.md).
    { name: 'obscura', testMatch: /behavior\.spec\.ts/ },
    // Recording needs a microphone (fake audio device), plus the few interactions Obscura can't drive.
    {
      name: 'chromium',
      testMatch: /(recording|interactions)\.spec\.ts/,
      use: {
        browserName: 'chromium',
        permissions: ['microphone'],
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
  ],
});
