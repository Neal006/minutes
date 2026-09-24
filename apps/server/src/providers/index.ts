import type { Ai, Llm, Stt } from '../ai.ts';
import { isSilentWav, isWavMime } from '../wav.ts';
import { anthropicLlm } from './anthropic.ts';
import { mockAi } from './mock.ts';
import { createOpenRouterClient, openRouterLlm, openRouterStt, type OnCall, type OpenRouterClient } from './openrouter.ts';
import { localStt } from './local.ts';
import { whisperStt } from './whisper.ts';

const LLMS = ['openrouter', 'anthropic', 'mock'] as const;
const STTS = ['local', 'whisper', 'openrouter', 'mock'] as const;

export interface AiHooks {
  onCall?: OnCall;
  onSilenceSkipped?: () => void;
}

/**
 * Picks providers from env. Defaults: OpenRouter (free models) when OPENROUTER_API_KEY is set,
 * Claude when only ANTHROPIC_API_KEY is set. Transcription: Whisper-compatible API when an STT/OpenAI
 * key is set, otherwise local Whisper ($0, no key). OpenRouter audio is opt-in: it needs account credit.
 */
export function createAi(env = process.env, hooks: AiHooks = {}): { ai: Ai; description: string } {
  const llmName = env.AI_PROVIDER ?? (env.OPENROUTER_API_KEY ? 'openrouter' : env.ANTHROPIC_API_KEY ? 'anthropic' : 'openrouter');
  const sttName = env.STT_PROVIDER ?? (env.STT_API_KEY || env.OPENAI_API_KEY ? 'whisper' : llmName === 'mock' ? 'mock' : 'local');
  if (!LLMS.includes(llmName as never)) throw new Error(`AI_PROVIDER must be one of ${LLMS.join(', ')} (got "${llmName}")`);
  if (!STTS.includes(sttName as never)) throw new Error(`STT_PROVIDER must be one of ${STTS.join(', ')} (got "${sttName}")`);

  // Created on first use, so the server still boots (and serves existing notes) without a key.
  let client: OpenRouterClient | undefined;
  const openRouter: OpenRouterClient = {
    get chat() {
      return (client ??= createOpenRouterClient(env)).chat;
    },
  };
  const mock = mockAi();

  const llm: Llm = llmName === 'openrouter' ? openRouterLlm(openRouter, env, hooks.onCall) : llmName === 'anthropic' ? anthropicLlm(env) : mock;
  const stt: Stt =
    sttName === 'local' ? localStt(env, hooks.onCall) : sttName === 'openrouter' ? openRouterStt(openRouter, env, hooks.onCall) : sttName === 'whisper' ? whisperStt(env) : mock;

  return {
    ai: {
      // Near-silent WAV chunks never reach a provider: no quota spent, no hallucinated "Thank you."
      transcribe: async (audio, mime) => {
        if (isWavMime(mime) && isSilentWav(audio)) {
          hooks.onSilenceSkipped?.();
          return [];
        }
        return stt.transcribe(audio, mime);
      },
      extract: (t) => llm.extract(t),
      answer: (q, s) => llm.answer(q, s),
    },
    description: `notes/ask: ${llmName}, transcription: ${sttName}`,
  };
}
