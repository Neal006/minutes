import type { Ai, Extraction } from '../ai.ts';
import { wavInfo } from '../wav.ts';

/**
 * Deterministic, offline provider for e2e tests and key-less demos (AI_PROVIDER=mock). Never used
 * unless asked for. Non-WAV bodies are read as UTF-8 so tests can upload a scripted transcript:
 * "first line|second line" becomes two 5-second segments.
 */
export function mockAi(): Ai {
  const failedOnce = new Set<string>();
  return {
    async transcribe(audio) {
      const info = wavInfo(audio);
      if (info) return [{ start: 0, end: info.durationSec, text: 'This is a mock transcript of recorded audio.' }];
      return audio
        .toString('utf8')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text, i) => ({ start: i * 5, end: i * 5 + 5, text }));
    },

    async extract(transcript) {
      // "[[flaky]]" in a transcript makes the first extraction fail, to exercise the retry UI.
      if (transcript.includes('[[flaky]]') && !failedOnce.has(transcript)) {
        failedOnce.add(transcript);
        throw new Error('Mock provider: simulated outage (try again)');
      }
      const lines = transcript
        .split('\n')
        .map((l) => l.match(/^\[([\d:]+)\] (.*)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map(([, ts, text]) => ({ ts, text: text.replace('[[flaky]]', '').trim() }));
      const x: Extraction = {
        title: `Mock: ${lines[0]?.text.split(/\s+/).slice(0, 5).join(' ') ?? 'meeting'}`,
        summary: `Mock summary of ${lines.length} transcript line${lines.length === 1 ? '' : 's'}. It opened with: "${lines[0]?.text ?? ''}"`,
        decisions: lines.filter((l) => /\b(decided|agreed|decision)\b/i.test(l.text)).map((l) => l.text),
        action_items: lines
          .filter((l) => /\b(I'll|I will)\b/i.test(l.text))
          .map((l) => ({ text: l.text, owner: null, due: null, timestamp: l.ts })),
      };
      return x;
    },

    async answer(_question, sources) {
      return `Mock answer: the most relevant excerpt is [${sources[0].n}].`;
    },
  };
}
