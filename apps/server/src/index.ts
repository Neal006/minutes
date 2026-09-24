import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { realAi } from './ai.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
mkdirSync(dataDir, { recursive: true });

const { app, pipeline } = createApp({
  db: openDb(path.join(dataDir, 'minutes.db')),
  ai: realAi(),
  audioDir: path.join(dataDir, 'audio'),
  webDist: path.join(root, 'apps/web/dist'),
  webhookUrls: (process.env.WEBHOOK_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});
pipeline.recover();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Minutes API on http://localhost:${port}  (data: ${dataDir})`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('  ! ANTHROPIC_API_KEY not set — notes and Ask will fail');
  if (!process.env.OPENAI_API_KEY && !process.env.STT_API_KEY) console.warn('  ! OPENAI_API_KEY / STT_API_KEY not set — transcription will fail');
});
