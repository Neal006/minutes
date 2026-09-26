import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createAi } from './providers/index.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
mkdirSync(dataDir, { recursive: true });

// One line per AI call: who served it, which model, and the provider's response id (no content).
// AI_CALL_LOG=<file> also appends them as JSON lines, e.g. for the live e2e provenance check.
const callLog = process.env.AI_CALL_LOG;
const { ai, description } = createAi(process.env, {
  onCall: (e) => {
    console.log(`[ai] ${e.task} ← ${e.provider} ${e.model} ${e.id ?? '(no id)'} ${e.ms} ms`);
    if (callLog) appendFileSync(callLog, `${JSON.stringify({ ...e, at: new Date().toISOString() })}\n`);
  },
});
const { app, pipeline } = createApp({
  db: openDb(path.join(dataDir, 'minutes.db')),
  ai,
  audioDir: path.join(dataDir, 'audio'),
  webDist: path.join(root, 'apps/web/dist'),
  webhookUrls: (process.env.WEBHOOK_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
pipeline.recover();

const port = Number(process.env.PORT ?? 3001);
// The app has no login of its own, so it only listens on loopback unless told otherwise
// (the Docker image sets HOST=0.0.0.0; Cloudflare Access guards it there).
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Minutes API on http://${host === '127.0.0.1' ? 'localhost' : host}:${port}  (data: ${dataDir})`);
  console.log(`  AI providers → ${description}`);
  const needsKey = /openrouter/.test(description) && !process.env.OPENROUTER_API_KEY;
  if (needsKey) console.warn('  ! OPENROUTER_API_KEY not set — transcription/notes will fail (get a free key at https://openrouter.ai/keys, or set AI_PROVIDER=mock for a demo)');
});
