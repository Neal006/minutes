import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createAi } from './providers/index.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
mkdirSync(dataDir, { recursive: true });

const { ai, description } = createAi();
const { app, pipeline } = createApp({
  db: openDb(path.join(dataDir, 'minutes.db')),
  ai,
  audioDir: path.join(dataDir, 'audio'),
  webDist: path.join(root, 'apps/web/dist'),
  webhookUrls: (process.env.WEBHOOK_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
pipeline.recover();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Minutes API on http://localhost:${port}  (data: ${dataDir})`);
  console.log(`  AI providers → ${description}`);
  const needsKey = /openrouter/.test(description) && !process.env.OPENROUTER_API_KEY;
  if (needsKey) console.warn('  ! OPENROUTER_API_KEY not set — transcription/notes will fail (get a free key at https://openrouter.ai/keys, or set AI_PROVIDER=mock for a demo)');
});
