import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanExtraction, parseJsonLoose, splitTimed, type Extraction } from '../src/ai.ts';
import { createAi } from '../src/providers/index.ts';
import { localStt } from '../src/providers/local.ts';
import { cleanTranscript, openRouterLlm, openRouterStt, type OpenRouterClient } from '../src/providers/openrouter.ts';
import { encodeWav, isSilentWav, rmsDbfs, sliceWav, wavInfo } from '../src/wav.ts';

const RATE = 16_000;
function tone(seconds: number, amplitude: number): Buffer {
  const pcm = Buffer.alloc(seconds * RATE * 2);
  for (let i = 0; i < seconds * RATE; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * amplitude * 32767), i * 2);
  return encodeWav(pcm, RATE);
}

/** A stand-in for the OpenRouter SDK client that records requests and replays canned replies. */
function fakeClient(replies: string[]) {
  const calls: { req: any; opts: any }[] = [];
  const client = {
    chat: {
      async send(req: any, opts: any) {
        calls.push({ req, opts });
        const content = replies[Math.min(calls.length - 1, replies.length - 1)];
        return { id: 'gen-1', model: 'fake/model:free', created: 0, object: 'chat.completion', systemFingerprint: null, choices: [{ index: 0, finishReason: 'stop', message: { role: 'assistant', content } }] };
      },
    },
  } as unknown as OpenRouterClient;
  return { client, calls };
}

const GOOD: Extraction = {
  title: 'Pricing sync',
  summary: 'We picked a flat plan.',
  decisions: ['Flat Team plan'],
  action_items: [{ text: 'Draft copy', owner: 'Priya', due: 'Friday', timestamp: '03:30' }],
};

test('wav: parse, loudness, silence gate, slicing', () => {
  const loud = tone(2, 0.3);
  const info = wavInfo(loud)!;
  assert.equal(info.sampleRate, RATE);
  assert.equal(info.durationSec, 2);
  assert.ok(rmsDbfs(loud, info) > -15);
  assert.equal(isSilentWav(loud), false);
  assert.equal(isSilentWav(tone(2, 0.001)), true); // ≈ -63 dBFS room tone
  assert.equal(wavInfo(Buffer.from('not a wav at all, just text')), null);

  // Extra RIFF chunks before "data" (LIST/INFO from many encoders) are skipped correctly.
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO')]);
  const withList = Buffer.concat([loud.subarray(0, 36), list, loud.subarray(36)]);
  assert.equal(wavInfo(withList)!.durationSec, 2);

  const parts = sliceWav(tone(45, 0.3), 20);
  assert.deepEqual(parts.map((p) => p.startSec), [0, 20, 40]);
  assert.deepEqual(parts.map((p) => wavInfo(p.wav)!.durationSec), [20, 20, 5]);
});

test('cleanExtraction fixes what free models actually returned in case-study run 1', () => {
  const repeated = [
    { text: 'Confirm EU region launch date', owner: 'Vendor', due: 'Friday', timestamp: null },
    { text: 'Bring Marco from legal to next call', owner: 'Dana', due: null, timestamp: '1:02' },
  ];
  const x = cleanExtraction({
    title: 'postmortem.json',
    summary: ' Summary. ',
    decisions: ['Push dark mode.', 'push dark-mode', 'Circuit breaker'],
    action_items: [
      ...Array.from({ length: 8 }, () => repeated).flat(), // the model looped 8 times
      { text: 'Ask Sam to send his notes', owner: 'Unspecified (likely the speaker who will ask Sam)', due: 'TBD', timestamp: null },
      { text: 'Hand off specs', owner: '', due: 'tomorrow', timestamp: null },
      { text: 'Add an alert', owner: 'Speaker', due: '', timestamp: null },
      { text: 'Fix the sync bug', owner: 'Jordan', due: 'Wednesday', timestamp: '0:14' },
    ],
  });
  assert.equal(x.title, 'postmortem');
  assert.equal(x.summary, 'Summary.');
  assert.deepEqual(x.decisions, ['Push dark mode.', 'Circuit breaker']);
  assert.deepEqual(
    x.action_items.map((a) => [a.text, a.owner, a.due]),
    [
      ['Confirm EU region launch date', null, 'Friday'],
      ['Bring Marco from legal to next call', 'Dana', null],
      ['Ask Sam to send his notes', null, null],
      ['Hand off specs', null, 'tomorrow'],
      ['Add an alert', null, null],
      ['Fix the sync bug', 'Jordan', 'Wednesday'],
    ],
  );
  assert.equal(cleanExtraction({ ...x, title: '  ' }).title, 'Untitled meeting');
});

test('text helpers: loose JSON, transcript cleanup, proportional timing', () => {
  assert.deepEqual(parseJsonLoose('Sure! ```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => parseJsonLoose('no json here'), /no JSON object/);

  assert.equal(cleanTranscript('<silence>'), '');
  assert.equal(cleanTranscript(' "<silence>" '), '');
  assert.equal(cleanTranscript('Transcript: "Hello team."'), 'Hello team.');
  assert.equal(cleanTranscript('```\nHello team.\n```'), 'Hello team.');
  assert.equal(cleanTranscript('We shipped it. Great work'), 'We shipped it. Great work');

  const segs = splitTimed('Short one. This sentence is quite a bit longer than that! Done?', 10);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].start, 0);
  assert.ok(Math.abs(segs[2].end - 10) < 1e-9);
  assert.ok(segs[1].end - segs[1].start > segs[0].end - segs[0].start); // longer text, more time
  assert.deepEqual(splitTimed('   ', 10), []);
});

test('OpenRouter notes: schema-constrained request, fenced JSON, model fallbacks, 429 retries', async () => {
  const { client, calls } = fakeClient(['```json\n' + JSON.stringify(GOOD) + '\n```']);
  const llm = openRouterLlm(client, { OPENROUTER_MODELS: 'a/one:free, b/two:free' });
  assert.deepEqual(await llm.extract('[0:01] hello'), GOOD);

  const { chatRequest } = calls[0].req;
  assert.equal(chatRequest.model, 'a/one:free');
  assert.deepEqual(chatRequest.models, ['a/one:free', 'b/two:free']);
  assert.equal(chatRequest.responseFormat.type, 'json_schema');
  assert.equal(chatRequest.responseFormat.jsonSchema.strict, true);
  assert.equal(chatRequest.responseFormat.jsonSchema.schema.$schema, undefined);
  assert.deepEqual(chatRequest.responseFormat.jsonSchema.schema.required, ['title', 'summary', 'decisions', 'action_items']);
  assert.ok(calls[0].opts.retryCodes.includes('429'));
});

test('OpenRouter notes: one repair round on invalid JSON, then a clear error', async () => {
  const repaired = fakeClient([JSON.stringify({ title: 'x' }), JSON.stringify(GOOD)]);
  assert.deepEqual(await openRouterLlm(repaired.client, {}).extract('[0:01] hi'), GOOD);
  assert.equal(repaired.calls.length, 2);
  const retryMessages = repaired.calls[1].req.chatRequest.messages;
  assert.equal(retryMessages.at(-2).role, 'assistant');
  assert.match(retryMessages.at(-1).content, /didn't match the schema/);

  const broken = fakeClient(['not json', 'still not json']);
  await assert.rejects(openRouterLlm(broken.client, {}).extract('[0:01] hi'), /invalid JSON/);
  assert.equal(broken.calls.length, 2);
});

test('OpenRouter transcription: WAV as input_audio, silence token, timing, non-WAV rejected', async () => {
  const wav = tone(8, 0.3);
  const { client, calls } = fakeClient(['Hello team. Let us start with pricing.']);
  const stt = openRouterStt(client, {});
  const segs = await stt.transcribe(wav, 'audio/wav');
  assert.deepEqual(segs.map((s) => s.text), ['Hello team.', 'Let us start with pricing.']);
  assert.ok(Math.abs(segs[1].end - 8) < 1e-9);

  const content = calls[0].req.chatRequest.messages[0].content;
  assert.equal(content[1].type, 'input_audio');
  assert.equal(content[1].inputAudio.format, 'wav');
  assert.equal(Buffer.from(content[1].inputAudio.data, 'base64').length, wav.length);
  assert.ok(calls[0].req.chatRequest.models.length >= 2); // free audio models fall back to each other

  assert.deepEqual(await openRouterStt(fakeClient(['<silence>']).client, {}).transcribe(wav, 'audio/wav'), []);
  await assert.rejects(stt.transcribe(Buffer.from('webm bytes'), 'audio/webm'), /needs WAV/);
});

test('OpenRouter errors: concise message, and only transient ones are retryable', async () => {
  const failing = (statusCode: number) =>
    ({
      chat: {
        async send() {
          throw Object.assign(new Error('API error occurred: {...huge dump...}'), { statusCode, body: JSON.stringify({ error: { message: 'This request requires at least $0.50 in balance for audio' } }) });
        },
      },
    }) as unknown as OpenRouterClient;
  const err = await openRouterStt(failing(402), {}).transcribe(tone(2, 0.3), 'audio/wav').catch((e) => e);
  assert.equal(err.message, 'OpenRouter 402: This request requires at least $0.50 in balance for audio');
  assert.equal(err.retryable, false);
  assert.equal((await openRouterLlm(failing(429), {}).answer('q', []).catch((e) => e)).retryable, true);
  assert.equal((await openRouterLlm(failing(503), {}).answer('q', []).catch((e) => e)).retryable, true);
});

test('local Whisper validates input before loading the model', async () => {
  const stt = localStt({});
  assert.throws(() => stt.transcribe(Buffer.from('webm'), 'audio/webm'), (e: Error & { retryable?: boolean }) => /needs 16-bit PCM WAV/.test(e.message) && e.retryable === false);
  const wav44k = encodeWav(Buffer.alloc(44_100 * 2), 44_100);
  assert.throws(() => stt.transcribe(wav44k, 'audio/wav'), /needs 16 kHz/);
});

test('provider selection and the silence gate', async () => {
  assert.match(createAi({ OPENROUTER_API_KEY: 'k' }).description, /notes\/ask: openrouter, transcription: local/);
  assert.match(createAi({ OPENROUTER_API_KEY: 'k', STT_PROVIDER: 'openrouter' }).description, /transcription: openrouter/);
  assert.match(createAi({ ANTHROPIC_API_KEY: 'k' }).description, /notes\/ask: anthropic/);
  assert.match(createAi({ OPENROUTER_API_KEY: 'k', GROQ: '', STT_API_KEY: 'g' }).description, /transcription: whisper/);
  assert.match(createAi({ AI_PROVIDER: 'mock' }).description, /mock, transcription: mock/);
  assert.throws(() => createAi({ AI_PROVIDER: 'gpt' }), /AI_PROVIDER must be one of/);

  // No key: the server still boots; the error surfaces on first use, with a helpful message.
  const { ai } = createAi({});
  await assert.rejects(ai.extract('[0:01] hi'), /OPENROUTER_API_KEY is not set/);

  const mock = createAi({ AI_PROVIDER: 'mock' }).ai;
  assert.deepEqual(await mock.transcribe(tone(3, 0.0005), 'audio/wav'), []); // gated: never reaches a provider
  assert.equal((await mock.transcribe(tone(3, 0.3), 'audio/wav')).length, 1);
});
