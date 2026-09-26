import { OpenRouter } from '@openrouter/sdk';
import type { ChatMessages } from '@openrouter/sdk/models';
import { z } from 'zod';
import { ANSWER_SYSTEM, EXTRACT_SYSTEM, Extraction, formatSources, parseJsonLoose, splitTimed, type Llm, type Stt } from '../ai.ts';
import { wavInfo } from '../wav.ts';

/**
 * Free OpenRouter models (checked 2026-09-24 with `npm run models:free`; the free lineup changes often).
 * OpenRouter tries them in order, so a model that is rate-limited or retired falls through to the next.
 * `openrouter/free` is OpenRouter's own router across whatever free models are currently up.
 */
export const DEFAULT_NOTES_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'qwen/qwen3.8-27b:free', 'openrouter/free'];
export const DEFAULT_STT_MODELS = ['thinkingmachines/inkling-small:free', 'thinkingmachines/inkling:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'];

export type OpenRouterClient = Pick<OpenRouter, 'chat'>;
type SendResult = Awaited<ReturnType<OpenRouterClient['chat']['send']>>;

/** `:free` variants and OpenRouter's free-only router cost nothing; every other id is billed per token. */
export const isFreeModel = (id: string) => id.endsWith(':free') || id === 'openrouter/free';

/** Parse a model list from env, refusing paid models unless OPENROUTER_ALLOW_PAID=1 (a typo shouldn't bill you). */
function modelList(env: NodeJS.ProcessEnv, key: 'OPENROUTER_MODELS' | 'OPENROUTER_STT_MODELS', fallback: string[]) {
  const raw = env[key];
  const models = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const chosen = models.length ? models : fallback;
  const paid = chosen.filter((id) => !isFreeModel(id));
  if (paid.length && env.OPENROUTER_ALLOW_PAID !== '1') {
    throw new Error(`${key} includes paid model(s): ${paid.join(', ')}. Use :free ids (npm run models:free) or set OPENROUTER_ALLOW_PAID=1`);
  }
  return chosen;
}

// Free models are rate-limited (HTTP 429); back off and retry instead of failing the meeting.
const REQUEST_OPTIONS = {
  retries: { strategy: 'backoff' as const, backoff: { initialInterval: 2000, maxInterval: 20_000, exponent: 2, maxElapsedTime: 90_000 }, retryConnectionErrors: true },
  retryCodes: ['429', '5XX'],
  timeoutMs: 120_000,
};

const EXTRACTION_SCHEMA = (() => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(Extraction) as Record<string, unknown>;
  return schema;
})();

export function createOpenRouterClient(env = process.env): OpenRouterClient {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
  return new OpenRouter({ apiKey: env.OPENROUTER_API_KEY, httpReferer: 'https://github.com/Neal006/minutes', appTitle: 'Minutes' });
}

/** Which model actually served a call (the fallback chain can pick any of them), and how long it took. */
export interface CallEvent {
  task: 'transcribe' | 'notes' | 'answer';
  /** Who served it: `openrouter`, the STT API host (e.g. `api.groq.com`), or `local`. */
  provider: string;
  model: string;
  /** The provider's response id (OpenRouter `gen-…`, Groq `req_…`), for audit against their logs. */
  id?: string;
  ms: number;
}
export type OnCall = (e: CallEvent) => void;

type SendRequest = Parameters<OpenRouterClient['chat']['send']>[0];
async function send(client: OpenRouterClient, task: CallEvent['task'], request: SendRequest, onCall?: OnCall) {
  const t0 = performance.now();
  let res: SendResult;
  try {
    res = await client.chat.send(request, REQUEST_OPTIONS);
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (!status) throw e;
    let message = e instanceof Error ? e.message : String(e);
    try {
      message = JSON.parse((e as { body?: string }).body ?? '').error?.message ?? message;
    } catch {}
    // 401/402/403… won't fix themselves: tell the pipeline not to burn quota retrying.
    throw Object.assign(new Error(`OpenRouter ${status}: ${message}`), { retryable: status === 408 || status === 429 || status >= 500 });
  }
  const done = 'model' in res ? { model: res.model, id: res.id } : { model: 'unknown' };
  onCall?.({ task, provider: 'openrouter', ...done, ms: Math.round(performance.now() - t0) });
  return res;
}

/** Pull the assistant text out of a chat result; content may be a string or an array of parts. */
export function messageText(res: SendResult): string {
  if (!('choices' in res)) throw new Error('Unexpected streaming response');
  const choice = res.choices[0];
  if (!choice) throw new Error('OpenRouter returned no choices');
  const content = choice.message.content;
  const text = typeof content === 'string' ? content : (content ?? []).flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('');
  if (!text.trim()) throw new Error(`Empty response from ${res.model} (finish: ${choice.finishReason})`);
  return text.trim();
}

export function openRouterLlm(client: OpenRouterClient, env = process.env, onCall?: OnCall): Llm {
  const models = modelList(env, 'OPENROUTER_MODELS', DEFAULT_NOTES_MODELS);
  const route = { model: models[0], ...(models.length > 1 ? { models } : {}) };

  return {
    async extract(transcript) {
      const messages: ChatMessages[] = [
        { role: 'system', content: `${EXTRACT_SYSTEM}\nRespond with a single JSON object matching the provided schema.` },
        { role: 'user', content: `<transcript>\n${transcript}\n</transcript>` },
      ];
      // Free models occasionally return JSON that misses a field; one repair round with the
      // validation error is cheap and fixes almost all of them.
      for (let attempt = 0; ; attempt++) {
        const res = await send(
          client,
          'notes',
          {
            appTitle: 'Minutes',
            chatRequest: {
              ...route,
              messages,
              maxTokens: 4000,
              temperature: 0.2,
              responseFormat: { type: 'json_schema', jsonSchema: { name: 'meeting_notes', strict: true, schema: EXTRACTION_SCHEMA } },
            },
          },
          onCall,
        );
        const text = messageText(res);
        try {
          return Extraction.parse(parseJsonLoose(text));
        } catch (e) {
          if (attempt >= 1) throw new Error(`Notes model returned invalid JSON: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
          messages.push(
            { role: 'assistant', content: text },
            { role: 'user', content: `That JSON didn't match the schema (${e instanceof Error ? e.message.slice(0, 300) : e}). Reply with only the corrected JSON object.` },
          );
        }
      }
    },

    async answer(question, sources) {
      const res = await send(
        client,
        'answer',
        {
          appTitle: 'Minutes',
          chatRequest: {
            ...route,
            maxTokens: 1500,
            temperature: 0.2,
            messages: [
              { role: 'system', content: ANSWER_SYSTEM },
              { role: 'user', content: `<excerpts>\n${formatSources(sources)}\n</excerpts>\n\nQuestion: ${question}` },
            ],
          },
        },
        onCall,
      );
      return messageText(res);
    },
  };
}

const SILENCE_TOKEN = '<silence>';
const STT_PROMPT = `Transcribe the speech in this audio verbatim, in the language spoken.
Output only the transcript as plain text: no commentary, labels, quotes or timestamps.
If there is no intelligible speech, output exactly ${SILENCE_TOKEN}`;

/** Transcription through an audio-capable chat model (OpenRouter has no /audio/transcriptions endpoint). */
export function openRouterStt(client: OpenRouterClient, env = process.env, onCall?: OnCall): Stt {
  const models = modelList(env, 'OPENROUTER_STT_MODELS', DEFAULT_STT_MODELS);
  const route = { model: models[0], ...(models.length > 1 ? { models } : {}) };

  return {
    async transcribe(audio, mime) {
      const info = wavInfo(audio);
      if (!info) throw new Error(`OpenRouter STT needs WAV audio (got ${mime}); the web recorder converts chunks to WAV`);
      const res = await send(
        client,
        'transcribe',
        {
          appTitle: 'Minutes',
          chatRequest: {
            ...route,
            maxTokens: 2000,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: STT_PROMPT },
                  { type: 'input_audio', inputAudio: { data: audio.toString('base64'), format: 'wav' } },
                ],
              },
            ],
          },
        },
        onCall,
      );
      const text = cleanTranscript(messageText(res));
      return text ? splitTimed(text, info.durationSec) : [];
    },
  };
}

/** Strip the wrappers chat models like to add around a transcript. */
export function cleanTranscript(raw: string): string {
  let t = raw.trim();
  if (t.includes(SILENCE_TOKEN) && t.replace(SILENCE_TOKEN, '').trim().length < 3) return '';
  t = t.replace(/^```\w*\s*|\s*```$/g, '').replace(/^(transcript(ion)?|here is the transcript(ion)?[^:]*)\s*:\s*/i, '').trim();
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t;
}
