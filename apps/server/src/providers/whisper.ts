import { dropSilence, type Stt } from '../ai.ts';
import type { OnCall } from './openrouter.ts';

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

/** Any OpenAI-compatible /audio/transcriptions endpoint: OpenAI, Groq (free tier), or a local faster-whisper server. */
export function whisperStt(env = process.env, onCall?: OnCall): Stt {
  const url = (env.STT_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.STT_MODEL ?? 'whisper-1';
  const key = env.STT_API_KEY ?? env.OPENAI_API_KEY;

  return {
    async transcribe(audio, mime) {
      if (!key) throw new Error('No STT key: set STT_API_KEY or OPENAI_API_KEY');
      const base = mime.split(';')[0];
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: base }), `chunk.${EXTENSIONS[base] ?? 'webm'}`);
      form.append('model', model);
      form.append('response_format', 'verbose_json');
      const t0 = performance.now();
      const res = await fetch(`${url}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as {
        text?: string;
        duration?: number;
        segments?: { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }[];
        x_groq?: { id?: string };
      };
      const id = json.x_groq?.id ?? res.headers.get('x-request-id') ?? undefined;
      onCall?.({ task: 'transcribe', provider: new URL(url).host, model, id, ms: Math.round(performance.now() - t0) });
      // Some OpenAI-compatible servers omit segments; fall back to one span for the whole chunk.
      const segs = json.segments ?? [{ start: 0, end: json.duration ?? 0, text: json.text ?? '' }];
      return dropSilence(segs)
        .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
        .filter((s) => s.text);
    },
  };
}
