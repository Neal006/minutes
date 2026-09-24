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

export interface Stt {
  transcribe(audio: Buffer, mime: string): Promise<SttSegment[]>;
}

export interface Llm {
  extract(transcript: string): Promise<Extraction>;
  answer(question: string, sources: Source[]): Promise<string>;
}

/** Everything the pipeline needs from AI providers. Injected so tests run without network. */
export type Ai = Stt & Llm;

export const EXTRACT_SYSTEM = `You turn meeting transcripts into notes people act on.
Be faithful to the transcript: never invent owners, dates, or decisions that weren't said.
Transcripts come from speech recognition and may contain errors; prefer the obvious intended meaning.
Write in plain, direct language. Use the transcript's own names and terms.`;

export const ANSWER_SYSTEM = `You answer questions about a team's past meetings using only the numbered transcript excerpts provided.
Cite every claim with the excerpt number in square brackets, like [2] or [1][4].
If the excerpts don't contain the answer, say so plainly in one sentence. Keep answers short.`;

export const formatSources = (sources: Source[]) =>
  sources.map((s) => `[${s.n}] (${s.meeting_title}, ${formatTs(s.start_ms)}) ${s.text}`).join('\n');

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

/** Models without native JSON mode wrap output in prose or ```json fences; take the outermost object. */
export function parseJsonLoose(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`Model returned no JSON object: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Chat models transcribe without timestamps. Split the text into sentences and spread them over
 * the chunk in proportion to their length, so transcript lines still land near the right second.
 * ponytail: proportional estimate (±a few seconds); use a Whisper endpoint when exact timing matters.
 */
export function splitTimed(text: string, durationSec: number): SttSegment[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const total = sentences.reduce((n, s) => n + s.length, 0);
  let cursor = 0;
  return sentences.map((s) => {
    const start = (cursor / total) * durationSec;
    cursor += s.length;
    return { start, end: (cursor / total) * durationSec, text: s };
  });
}
