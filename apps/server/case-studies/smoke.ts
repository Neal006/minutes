// Real calls to check keys/models before a full case-study run: notes always, STT with --stt.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createAi } from '../src/providers/index.ts';
import { sliceWav } from '../src/wav.ts';

const { ai, description } = createAi(process.env, { onCall: (e) => console.log(`  ↳ ${e.task} served by ${e.model} in ${e.ms} ms`) });
console.log(description);

let transcript = '[0:00] Jordan, can you own the calendar sync fix?\n[0:04] Yes. I will have a fix ready for review by Wednesday.\n[0:09] We decided to push dark mode to next sprint.';
if (process.argv.includes('--stt')) {
  const [first] = sliceWav(readFileSync(path.join(import.meta.dirname, 'audio/sprint-planning.wav')), 20);
  const segs = await ai.transcribe(first.wav, 'audio/wav');
  console.log('transcript:', segs.map((s) => `[${s.start.toFixed(1)}s] ${s.text}`).join('\n  '));
  transcript = segs.map((s) => `[0:${String(Math.floor(s.start)).padStart(2, '0')}] ${s.text}`).join('\n');
}
console.log('notes:', JSON.stringify(await ai.extract(transcript), null, 2));
