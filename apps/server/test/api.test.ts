import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { dropSilence, formatTs, parseTs, type Ai, type Extraction } from '../src/ai.ts';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { chunkPath } from '../src/pipeline.ts';
import { MARK_END, MARK_START, toFtsQuery } from '../src/search.ts';

// Fake STT: the "audio" is UTF-8 text; each `|`-separated piece becomes a 5s segment.
const fakeAi = (overrides: Partial<Ai> = {}): Ai => ({
  async transcribe(audio) {
    return audio
      .toString()
      .split('|')
      .filter(Boolean)
      .map((text, i) => ({ start: i * 5, end: i * 5 + 5, text }));
  },
  async extract(): Promise<Extraction> {
    return {
      title: 'Budget review',
      summary: 'We reviewed the budget.',
      decisions: ['Cut travel spend'],
      action_items: [{ text: 'Send revised budget', owner: 'Sam', due: 'Friday', timestamp: '00:20' }],
    };
  },
  async answer() {
    return 'Travel spend was cut [1][9].';
  },
  ...overrides,
});

const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(ai: Ai) {
  // Leading dot on purpose: data dirs under dot-folders (~/.config, .claude) must still serve audio.
  const dir = mkdtempSync(path.join(tmpdir(), '.minutes-'));
  const db = openDb(path.join(dir, 'test.db'));
  const audioDir = path.join(dir, 'audio');
  const { app, pipeline } = createApp({ db, ai, audioDir, retryDelaysMs: [1, 1] });
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, url: string, body?: unknown, contentType = 'application/json') => {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': contentType },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const newMeeting = async () => (await call('POST', '/meetings', {})).body.id as string;
  const putChunk = (id: string, seq: number, startMs: number, text: string) => call('PUT', `/meetings/${id}/chunks/${seq}?start_ms=${startMs}`, text, 'audio/webm');
  const waitStatus = async (id: string, status: string) => {
    for (let i = 0; i < 200; i++) {
      const m = (await call('GET', `/meetings/${id}`)).body;
      if (m.status === status) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`meeting never reached ${status}`);
  };
  return { base, db, audioDir, pipeline, call, newMeeting, putChunk, waitStatus };
}

test('helpers: timestamps, silence filter, FTS query safety', () => {
  assert.equal(formatTs(65_000), '1:05');
  assert.equal(formatTs(3_725_000), '1:02:05');
  assert.equal(parseTs('01:05'), 65_000);
  assert.equal(parseTs('1:02:05'), 3_725_000);
  assert.equal(parseTs('soon'), null);
  assert.equal(parseTs(null), null);

  const segs = [
    { text: 'real', no_speech_prob: 0.1, avg_logprob: -0.3 },
    { text: 'Thank you.', no_speech_prob: 0.9, avg_logprob: -1.4 },
  ];
  assert.deepEqual(dropSilence(segs).map((s) => s.text), ['real']);

  assert.equal(toFtsQuery('What did we decide about pricing?'), '"decide" "pricing"*');
  assert.equal(toFtsQuery('pricing budget', 'or'), '"pricing" OR "budget"');
  assert.equal(toFtsQuery('" NEAR( * col:x'), '"near" "col" "x"*'); // syntax neutralized
  assert.equal(toFtsQuery('the and of ?!'), null);
});

test('record → live transcript → notes → search → ask → delete', async () => {
  let failOnce = true;
  const ai = fakeAi({
    async transcribe(audio, mime) {
      if (audio.toString().startsWith('travel') && failOnce) {
        failOnce = false;
        throw new Error('flaky STT');
      }
      return fakeAi().transcribe(audio, mime);
    },
  });
  const { base, call, newMeeting, putChunk, waitStatus, audioDir } = await start(ai);
  const id = await newMeeting();

  assert.equal((await putChunk(id, 0, 0, 'hello team|the budget is tight')).status, 202);
  assert.equal((await putChunk(id, 1, 20_000, 'travel spend is cut|send the revised budget')).status, 202);

  // Retry after a lost response: the done chunk is acknowledged, not reprocessed.
  await new Promise((r) => setTimeout(r, 50));
  const dup = await putChunk(id, 0, 0, 'DIFFERENT AUDIO');
  assert.deepEqual(dup, { status: 200, body: { status: 'done' } });

  assert.equal((await call('POST', `/meetings/${id}/finish`, { duration_ms: 30_000 })).status, 202);
  const m = await waitStatus(id, 'ready');

  assert.equal(m.title, 'Budget review');
  assert.deepEqual(m.decisions, ['Cut travel spend']);
  assert.equal(m.duration_ms, 30_000);
  assert.deepEqual(m.chunks, { total: 2, pending: 0, failed: 0 });
  assert.deepEqual(
    m.segments.map((s: { start_ms: number; text: string }) => [s.start_ms, s.text]),
    [[0, 'hello team'], [5000, 'the budget is tight'], [20_000, 'travel spend is cut'], [25_000, 'send the revised budget']],
  );
  assert.equal(m.action_items[0].start_ms, 20_000);
  assert.equal(m.action_items[0].owner, 'Sam');

  // Playback audio supports HTTP Range so the <audio> element can seek.
  assert.equal((await call('PUT', `/meetings/${id}/audio`, 'full-recording-bytes', 'audio/webm')).status, 204);
  const ranged = await fetch(`${base}/meetings/${id}/audio`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-type'), 'audio/webm');
  assert.equal(await ranged.text(), 'full');

  // Chunks can't be added after the meeting is finished.
  assert.equal((await putChunk(id, 2, 40_000, 'late')).status, 409);

  const hits = (await call('GET', '/search?q=budg')).body;
  assert.equal(hits.length, 2);
  assert.ok(hits[0].snippet.includes(`${MARK_START}budget${MARK_END}`));
  assert.equal(hits[0].meeting_id, id);

  const ask = (await call('POST', '/ask', { question: 'what happened to travel spend?' })).body;
  assert.equal(ask.answer, 'Travel spend was cut [1][9].');
  assert.deepEqual(ask.sources.map((s: { n: number }) => s.n), [1]); // cited + in range only

  const item = m.action_items[0].id;
  assert.equal((await call('PATCH', `/action-items/${item}`, { done: true })).status, 200);
  assert.equal((await call('GET', `/meetings/${id}`)).body.action_items[0].done, 1);

  // Renaming locks the title so a later reprocess won't overwrite it.
  await call('PATCH', `/meetings/${id}`, { title: 'Q3 budget' });
  await call('POST', `/meetings/${id}/reprocess`);
  assert.equal((await waitStatus(id, 'ready')).title, 'Q3 budget');

  assert.equal((await call('DELETE', `/meetings/${id}`)).status, 204);
  assert.equal((await call('GET', `/meetings/${id}`)).status, 404);
  assert.deepEqual((await call('GET', '/search?q=budget')).body, []); // FTS rows removed by trigger
  assert.equal(existsSync(path.join(audioDir, id)), false);
});

test('extraction failure → failed with error → reprocess recovers', async () => {
  let calls = 0;
  const { call, newMeeting, putChunk, waitStatus } = await start(
    fakeAi({
      async extract(t) {
        if (++calls === 1) throw new Error('529 overloaded');
        return fakeAi().extract(t);
      },
    }),
  );
  const id = await newMeeting();
  await putChunk(id, 0, 0, 'some words');
  await call('POST', `/meetings/${id}/finish`, {});
  const failed = await waitStatus(id, 'failed');
  assert.equal(failed.error, '529 overloaded');

  await call('POST', `/meetings/${id}/reprocess`);
  const ready = await waitStatus(id, 'ready');
  assert.equal(ready.error, null);
  assert.equal(ready.duration_ms, 5000); // derived from the transcript when the client didn't send one
});

test('silent meeting skips the LLM; a chunk that keeps failing does not block notes', async () => {
  let extracted = 0;
  const ai = fakeAi({
    async transcribe(audio, mime) {
      if (audio.toString() === 'broken') throw new Error('bad audio');
      return fakeAi().transcribe(audio, mime);
    },
    async extract(t) {
      extracted++;
      return fakeAi().extract(t);
    },
  });
  const { call, newMeeting, putChunk, waitStatus, audioDir } = await start(ai);

  const silent = await newMeeting();
  await call('POST', `/meetings/${silent}/finish`, {});
  const s = await waitStatus(silent, 'ready');
  assert.equal(s.summary, 'No speech detected.');
  assert.equal(extracted, 0);

  const partial = await newMeeting();
  await putChunk(partial, 0, 0, 'good audio');
  await putChunk(partial, 1, 20_000, 'broken');
  await call('POST', `/meetings/${partial}/finish`, {});
  const p = await waitStatus(partial, 'ready');
  assert.deepEqual(p.chunks, { total: 2, pending: 0, failed: 1 });
  assert.equal(p.segments.length, 1);
  // Transcribed chunk files are deleted; the failed one is kept so "Retry" can use it.
  assert.equal(existsSync(chunkPath(audioDir, partial, 0)), false);
  assert.equal(existsSync(chunkPath(audioDir, partial, 1)), true);
});

test('non-retryable STT errors (bad key, no credit) are not retried', async () => {
  let calls = 0;
  const { call, newMeeting, putChunk, waitStatus } = await start(
    fakeAi({
      async transcribe() {
        calls++;
        throw Object.assign(new Error('OpenRouter 402: needs balance'), { retryable: false });
      },
    }),
  );
  const id = await newMeeting();
  await putChunk(id, 0, 0, 'words');
  await call('POST', `/meetings/${id}/finish`, {});
  const m = await waitStatus(id, 'ready');
  assert.equal(calls, 1);
  assert.deepEqual(m.chunks, { total: 1, pending: 0, failed: 1 });
});

test('input validation at the API boundary', async () => {
  const { call, newMeeting, putChunk } = await start(fakeAi());
  const id = await newMeeting();
  assert.equal((await putChunk('nope', 0, 0, 'x')).status, 404);
  assert.equal((await call('PUT', `/meetings/${id}/chunks/-1?start_ms=0`, 'x', 'audio/webm')).status, 400);
  assert.equal((await call('PUT', `/meetings/${id}/chunks/0?start_ms=abc`, 'x', 'audio/webm')).status, 400);
  assert.equal((await call('PUT', `/meetings/${id}/chunks/0?start_ms=0`, 'x', 'text/plain')).status, 415);
  assert.equal((await call('PATCH', `/meetings/${id}`, { title: '  ' })).status, 400);
  assert.equal((await call('PATCH', '/action-items/999', { done: 'yes' })).status, 400);
  assert.equal((await call('PATCH', '/action-items/999', { done: true })).status, 404);
  assert.equal((await call('POST', '/ask', { question: '' })).status, 400);
  assert.equal((await call('POST', '/ask', { question: 'anything about zebras?' })).body.sources.length, 0);
  assert.deepEqual((await call('GET', '/search?q=%22%20NEAR(')).body, []);
  assert.equal((await call('GET', '/nope')).status, 404);
});

test('restart recovery resumes pending chunks and finalizes', async () => {
  const { db, audioDir, pipeline, call, newMeeting, waitStatus } = await start(fakeAi());
  const id = await newMeeting();
  // Simulate a crash: chunk saved + marked pending, meeting finished, but nothing processed.
  await mkdir(path.join(audioDir, id), { recursive: true });
  await writeFile(chunkPath(audioDir, id, 0), 'recovered words');
  db.prepare("INSERT INTO chunks (meeting_id, seq, start_ms, mime) VALUES (?, 0, 0, 'audio/webm')").run(id);
  db.prepare("UPDATE meetings SET status = 'processing' WHERE id = ?").run(id);

  pipeline.recover();
  const m = await waitStatus(id, 'ready');
  assert.equal(m.segments[0].text, 'recovered words');
  assert.equal((await call('GET', '/meetings')).body[0].open_items, 1);
});
