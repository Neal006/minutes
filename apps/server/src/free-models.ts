// `npm run models:free` — list OpenRouter's currently free models and what each can do here.
// The free lineup changes weekly; use this to pick OPENROUTER_MODELS / OPENROUTER_STT_MODELS.
import { DEFAULT_NOTES_MODELS, DEFAULT_STT_MODELS } from './providers/openrouter.ts';

interface Model {
  id: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
}

const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20_000) });
if (!res.ok) throw new Error(`OpenRouter models API ${res.status}`);
const { data } = (await res.json()) as { data: Model[] };
const free = data.filter((m) => Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);

const rows = free.map((m) => {
  const params = m.supported_parameters ?? [];
  const audio = m.architecture?.input_modalities?.includes('audio');
  const json = params.includes('structured_outputs');
  const tag = DEFAULT_NOTES_MODELS.includes(m.id) ? 'default: notes/ask' : DEFAULT_STT_MODELS.includes(m.id) ? 'default: transcription' : '';
  return { model: m.id, context: `${Math.round(m.context_length / 1000)}k`, audio: audio ? 'yes' : '', 'json schema': json ? 'yes' : '', use: tag || (audio ? 'transcription' : json ? 'notes/ask' : '') };
});
rows.sort((a, b) => (b.use ? 1 : 0) - (a.use ? 1 : 0) || a.model.localeCompare(b.model));

console.log(`${free.length} free models on OpenRouter right now (of ${data.length}):\n`);
console.table(rows);
const missing = [...DEFAULT_NOTES_MODELS, ...DEFAULT_STT_MODELS].filter((id) => !free.some((m) => m.id === id));
if (missing.length) console.warn(`\n! Defaults no longer free/available: ${missing.join(', ')} — set OPENROUTER_MODELS / OPENROUTER_STT_MODELS in .env`);
