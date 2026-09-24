import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ANSWER_SYSTEM, EXTRACT_SYSTEM, Extraction, formatSources, type Llm } from '../ai.ts';

export function anthropicLlm(env = process.env): Llm {
  const claude = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = env.CLAUDE_MODEL ?? 'claude-opus-5';
  // Refusals are rare on meeting text, but when one happens the server re-runs the
  // request on Anthropic's recommended fallback model instead of failing the meeting.
  const fallback = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  return {
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
      const res = await claude.beta.messages.create({
        model,
        max_tokens: 4000,
        system: ANSWER_SYSTEM,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: `<excerpts>\n${formatSources(sources)}\n</excerpts>\n\nQuestion: ${question}` }],
        ...fallback,
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer this question');
      return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    },
  };
}
