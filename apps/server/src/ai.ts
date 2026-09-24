import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

/** A transcribed span, in seconds relative to the start of the audio chunk. */
export interface SttSegment {
  start: number;
  end: number;
  text: string;
}

export const Extraction = z.object({
  title: z.string().describe('Short, specific meeting title (max ~8 words)'),
  summary: z.string().describe('3-6 sentence summary of what was discussed and why it matters'),
  decisions: z.array(z.string()).describe('Concrete decisions that were made; empty if none'),
  action_items: z.array(
    z.object({
      text: z.string().describe('The task, starting with a verb'),
      owner: z.string().nullable().describe('Person responsible, only if stated or clearly implied'),
      due: z.string().nullable().describe('Due date/time as said (e.g. "Friday"), only if stated'),
      timestamp: z.string().nullable().describe('mm:ss of the transcript line it came from'),
    }),
  ),
});
export type Extraction = z.infer<typeof Extraction>;

export interface Source {
  n: number;
  meeting_title: string;
  start_ms: number;
  text: string;
}

/** Everything the pipeline needs from AI providers. Injected so tests run without network. */
export interface Ai {
  transcribe(audio: Buffer, mime: string): Promise<SttSegment[]>;
  extract(transcript: string): Promise<Extraction>;
  answer(question: string, sources: Source[]): Promise<string>;
}

// Whisper's own "this was silence" heuristic: it tends to hallucinate "Thank you." on quiet audio.
export function dropSilence<T extends { no_speech_prob?: number; avg_logprob?: number }>(segs: T[]): T[] {
  return segs.filter((s) => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1));
}

export function formatTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(hh ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "mm:ss" or "h:mm:ss" → ms; null when unparseable. */
export function parseTs(ts: string | null): number | null {
  if (!ts || !/^\d{1,2}(:\d{1,2}){1,2}$/.test(ts.trim())) return null;
  return ts.trim().split(':').reduce((acc, p) => acc * 60 + Number(p), 0) * 1000;
}

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

const EXTRACT_SYSTEM = `You turn meeting transcripts into notes people act on.
Be faithful to the transcript: never invent owners, dates, or decisions that weren't said.
Transcripts come from speech recognition and may contain errors; prefer the obvious intended meaning.
Write in plain, direct language. Use the transcript's own names and terms.`;

const ANSWER_SYSTEM = `You answer questions about a team's past meetings using only the numbered transcript excerpts provided.
Cite every claim with the excerpt number in square brackets, like [2] or [1][4].
If the excerpts don't contain the answer, say so plainly in one sentence. Keep answers short.`;

export function realAi(env = process.env): Ai {
  const claude = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = env.CLAUDE_MODEL ?? 'claude-opus-5';
  const sttUrl = (env.STT_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const sttModel = env.STT_MODEL ?? 'whisper-1';
  const sttKey = env.STT_API_KEY ?? env.OPENAI_API_KEY;

  // Refusals are rare on meeting text, but when one happens the server re-runs the
  // request on Anthropic's recommended fallback model instead of failing the meeting.
  const fallback = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  return {
    async transcribe(audio, mime) {
      if (!sttKey) throw new Error('No STT key: set OPENAI_API_KEY or STT_API_KEY');
      const base = mime.split(';')[0];
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: base }), `chunk.${EXTENSIONS[base] ?? 'webm'}`);
      form.append('model', sttModel);
      form.append('response_format', 'verbose_json');
      const res = await fetch(`${sttUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sttKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as {
        text?: string;
        duration?: number;
        segments?: { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }[];
      };
      // Some OpenAI-compatible servers omit segments; fall back to one span for the whole chunk.
      const segs = json.segments ?? [{ start: 0, end: json.duration ?? 0, text: json.text ?? '' }];
      return dropSilence(segs)
        .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
        .filter((s) => s.text);
    },

    async extract(transcript) {
      const res = await claude.beta.messages.parse({
        model,
        max_tokens: 16000,
        system: EXTRACT_SYSTEM,
        output_config: { effort: 'medium', format: betaZodOutputFormat(Extraction) },
        messages: [{ role: 'user', content: `<transcript>\n${transcript}\n</transcript>` }],
        ...fallback,
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined to process this transcript');
      if (!res.parsed_output) throw new Error(`Extraction returned no structured output (stop: ${res.stop_reason})`);
      return res.parsed_output;
    },

    async answer(question, sources) {
      const excerpts = sources
        .map((s) => `[${s.n}] (${s.meeting_title}, ${formatTs(s.start_ms)}) ${s.text}`)
        .join('\n');
      const res = await claude.beta.messages.create({
        model,
        max_tokens: 4000,
        system: ANSWER_SYSTEM,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: `<excerpts>\n${excerpts}\n</excerpts>\n\nQuestion: ${question}` }],
        ...fallback,
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer this question');
      return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    },
  };
}
