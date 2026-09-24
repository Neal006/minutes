// `npm run case-studies` — runs the five case studies end to end against real OpenRouter free
// models and writes docs/case-studies.md + docs/case-studies/results.json.
//
// Each meeting is synthesized to speech (Windows SAPI; cached in case-studies/audio), then driven
// through the real HTTP API exactly like the browser recorder: 20-second WAV chunks uploaded in
// order, /finish, poll until notes are ready. Then every question goes through /api/ask.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatTs } from '../src/ai.ts';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { createAi } from '../src/providers/index.ts';
import type { CallEvent } from '../src/providers/openrouter.ts';
import { encodeWav, isSilentWav, sliceWav, wavInfo } from '../src/wav.ts';
import { CASES, VOICES, type CaseStudy } from './cases.ts';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '../../..');
const AUDIO_DIR = path.join(HERE, 'audio');
const RATE = 16_000;
const CHUNK_SEC = 20;
const GAP_SEC = 0.4;

// ── audio ──────────────────────────────────────────────────────────────────────

/** Faint noise (≈ -72 dBFS) instead of digital zeros, like a real muted mic. */
function roomTone(seconds: number): Buffer {
  const pcm = Buffer.alloc(Math.round(seconds * RATE) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round((Math.random() - 0.5) * 16), i * 2);
  return pcm;
}

function ensureAudio(c: CaseStudy): Buffer {
  const file = path.join(AUDIO_DIR, `${c.id}.wav`);
  if (existsSync(file)) return readFileSync(file);
  if (process.platform !== 'win32') throw new Error(`${file} is missing; generate it on Windows (built-in voices) or provide your own WAV`);
  const work = mkdtempSync(path.join(tmpdir(), `tts-${c.id}-`));
  const linesFile = path.join(work, 'lines.json');
  writeFileSync(linesFile, JSON.stringify(c.lines.map((l) => ({ text: l.text, ...VOICES[l.speaker] }))));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'tts.ps1'), '-In', linesFile, '-Out', work], { stdio: 'inherit' });
  const parts = [roomTone(c.leadingSilenceSec ?? 0.3)];
  c.lines.forEach((_, i) => {
    const wav = readFileSync(path.join(work, `${i}.wav`));
    const info = wavInfo(wav)!;
    parts.push(wav.subarray(info.dataOffset, info.dataOffset + info.dataLength), roomTone(GAP_SEC));
  });
  const out = encodeWav(Buffer.concat(parts), RATE);
  mkdirSync(AUDIO_DIR, { recursive: true });
  writeFileSync(file, out);
  return out;
}

// ── scoring ────────────────────────────────────────────────────────────────────

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** Word error rate: word-level edit distance / reference length. */
function wer(reference: string, hypothesis: string): number {
  const r = words(reference);
  const h = words(hypothesis);
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return r.length ? prev[h.length] / r.length : 0;
}

const has = (text: string | null | undefined, keyword: string) => (text ?? '').toLowerCase().includes(keyword.toLowerCase());

interface Meeting {
  id: string;
  title: string;
  status: string;
  error: string | null;
  summary: string | null;
  decisions: string[];
  segments: { start_ms: number; end_ms: number; text: string }[];
  action_items: { text: string; owner: string | null; due: string | null; start_ms: number | null }[];
  chunks: { total: number; pending: number; failed: number };
}

interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

// ── run ────────────────────────────────────────────────────────────────────────

if (process.argv.includes('--audio-only')) {
  // Generate/inspect the audio without calling any model.
  for (const c of CASES) {
    const audio = ensureAudio(c);
    const chunks = sliceWav(audio, CHUNK_SEC);
    const silent = chunks.filter((ch) => isSilentWav(ch.wav)).length;
    console.log(`${c.id}: ${wavInfo(audio)!.durationSec.toFixed(1)} s, ${chunks.length} chunks (${silent} silent), ${c.lines.map((l) => l.text).join(' ').split(/\s+/).length} words`);
  }
  process.exit(0);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('Set OPENROUTER_API_KEY (free key: https://openrouter.ai/keys) in .env, then rerun.');
  process.exit(1);
}

const calls: (CallEvent & { caseId: string })[] = [];
const skipped: Record<string, number> = {};
let current = '';
const { ai, description } = createAi(process.env, {
  onCall: (e) => calls.push({ ...e, caseId: current }),
  onSilenceSkipped: () => (skipped[current] = (skipped[current] ?? 0) + 1),
});
const dataDir = mkdtempSync(path.join(tmpdir(), 'minutes-cases-'));
const { app } = createApp({ db: openDb(path.join(dataDir, 'db.sqlite')), ai, audioDir: path.join(dataDir, 'audio'), retryDelaysMs: [3000, 10_000] });
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const API = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
const json = async (method: string, url: string, body?: unknown, type = 'application/json') => {
  const res = await fetch(API + url, { method, headers: body === undefined ? {} : { 'content-type': type }, body: body === undefined ? undefined : body instanceof Buffer ? new Uint8Array(body) : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

console.log(`Providers: ${description}\n`);
const results = [];
for (const c of CASES) {
  current = c.id;
  const audio = ensureAudio(c);
  const durationSec = wavInfo(audio)!.durationSec;
  const chunks = sliceWav(audio, CHUNK_SEC);
  console.log(`▶ ${c.title}: ${durationSec.toFixed(1)} s audio, ${chunks.length} chunks`);

  const t0 = performance.now();
  const { id } = await json('POST', '/meetings', {});
  for (const [seq, ch] of chunks.entries()) await json('PUT', `/meetings/${id}/chunks/${seq}?start_ms=${Math.round(ch.startSec * 1000)}`, ch.wav, 'audio/wav');
  const tFinish = performance.now();
  await json('POST', `/meetings/${id}/finish`, { duration_ms: Math.round(durationSec * 1000) });
  let m: Meeting;
  for (;;) {
    m = await json('GET', `/meetings/${id}`);
    if (m.status === 'ready' || m.status === 'failed') break;
    if (performance.now() - t0 > 8 * 60_000) throw new Error(`${c.id}: timed out in status ${m.status}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tReady = performance.now();
  console.log(`  ${m.status} in ${((tReady - t0) / 1000).toFixed(1)} s — "${m.title}"${m.error ? ` (${m.error})` : ''}`);
  results.push({ c, id, m, durationSec, chunkCount: chunks.length, totalMs: tReady - t0, afterStopMs: tReady - tFinish });
}

// Ask questions only after every meeting is in, so retrieval has to find the right one.
const asks: Record<string, { q: string; keywords: string[]; answer: string; sources: { meeting_id: string; meeting_title: string; start_ms: number; text: string; n: number }[]; ms: number; error?: string }[]> = {};
for (const r of results) {
  current = r.c.id;
  asks[r.c.id] = [];
  for (const { q, keywords } of r.c.expect.questions) {
    const t = performance.now();
    try {
      const res = await json('POST', '/ask', { question: q });
      asks[r.c.id].push({ q, keywords, ...res, ms: performance.now() - t });
    } catch (e) {
      asks[r.c.id].push({ q, keywords, answer: '', sources: [], ms: performance.now() - t, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
server.close();

// ── report ─────────────────────────────────────────────────────────────────────

const report = results.map((r) => {
  const { c, m } = r;
  const reference = c.lines.map((l) => l.text).join(' ');
  const hypothesis = m.segments.map((s) => s.text).join(' ');
  const w = wer(reference, hypothesis);
  const checks: Check[] = [{ label: 'Notes generated', pass: m.status === 'ready', detail: m.error ?? undefined }];
  checks.push({ label: `Transcript word error rate ≤ 20%`, pass: w <= 0.2, detail: `${(w * 100).toFixed(1)}%` });
  for (const e of c.expect.actionItems) {
    const hit = m.action_items.find((a) => has(`${a.text} ${a.due ?? ''}`, e.keyword) && (!e.owner || has(a.owner, e.owner) || has(a.text, e.owner)));
    checks.push({ label: `Action item${e.owner ? ` for ${e.owner}` : ''} about "${e.keyword}"`, pass: !!hit, detail: hit ? `"${hit.text}"` : 'not found' });
  }
  if (c.expect.decisionKeywords?.length) {
    const hit = m.decisions.find((d) => c.expect.decisionKeywords!.some((k) => has(d, k)));
    checks.push({ label: `Decision about ${c.expect.decisionKeywords.map((k) => `"${k}"`).join(' / ')}`, pass: !!hit, detail: hit ? `"${hit}"` : 'not found' });
  }
  if (c.expect.forbiddenDecisionKeywords) {
    const bad = m.decisions.find((d) => c.expect.forbiddenDecisionKeywords!.some((k) => has(d, k)));
    checks.push({ label: 'No invented hire/reject decision', pass: !bad, detail: bad ? `"${bad}"` : `${m.decisions.length} decision(s) recorded` });
  }
  const names = Object.keys(VOICES).concat('Marco');
  const invented = m.action_items.filter((a) => a.owner && !names.some((n) => has(a.owner, n)));
  checks.push({ label: 'Owners are people from the meeting', pass: !invented.length, detail: invented.length ? invented.map((a) => a.owner).join(', ') : undefined });
  if (c.expect.firstSpeechAfterSec !== undefined) {
    const first = m.segments[0]?.start_ms ?? 0;
    checks.push({ label: `Transcript starts after the ${c.leadingSilenceSec} s of silence`, pass: first >= c.expect.firstSpeechAfterSec * 1000, detail: `first line at ${formatTs(first)}` });
    checks.push({ label: 'Silent chunk skipped without an API call', pass: (skipped[c.id] ?? 0) >= 1, detail: `${skipped[c.id] ?? 0} chunk(s) skipped` });
  }
  for (const a of asks[c.id]) {
    const cited = a.sources.some((s) => s.meeting_id === r.id);
    const mentions = a.keywords.some((k) => has(a.answer, k));
    checks.push({ label: `Ask: "${a.q}"`, pass: cited && mentions && !a.error, detail: a.error ?? `${mentions ? 'answer mentions ' + a.keywords.find((k) => has(a.answer, k)) : 'keyword missing'}; ${cited ? 'cites this meeting' : 'no citation to this meeting'}` });
  }
  const own = calls.filter((x) => x.caseId === c.id);
  return { ...r, wer: w, checks, calls: own, asks: asks[c.id], skipped: skipped[c.id] ?? 0 };
});

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const esc = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const modelsUsed = (cs: CallEvent[], task: CallEvent['task']) => [...new Set(cs.filter((x) => x.task === task).map((x) => x.model))].map((m) => `\`${m}\``).join(', ') || '—';
const totalChecks = report.flatMap((r) => r.checks);

const md: string[] = [
  '# Case studies: five meetings through the real pipeline',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)} with **OpenRouter free models only** (${description}). ` +
    'Each meeting was synthesized with the built-in Windows voices, split into 20-second 16 kHz WAV chunks, and uploaded through the ' +
    'same HTTP API the browser recorder uses. Nothing is mocked. Reproduce with `npm run case-studies`.',
  '',
  `**${totalChecks.filter((c) => c.pass).length} / ${totalChecks.length} checks passed.**`,
  '',
  '| # | Case | Audio | Chunks (skipped silent) | Transcript WER | Notes ready after stop | Action items | Checks |',
  '|---|---|---|---|---|---|---|---|',
  ...report.map((r, i) => `| ${i + 1} | [${r.c.title}](#${i + 1}-${r.c.id}) | ${r.durationSec.toFixed(0)} s | ${r.chunkCount} (${r.skipped}) | ${pct(r.wer)} | ${secs(r.afterStopMs)} | ${r.m.action_items.length} | ${r.checks.filter((c) => c.pass).length}/${r.checks.length} |`),
  '',
  'Free models are shared and rate-limited, so latency varies run to run; OpenRouter picks from each fallback list, and the model that actually served each call is listed per case.',
  '',
];

report.forEach((r, i) => {
  const { c, m } = r;
  md.push(
    `## ${i + 1}. ${c.id}`,
    '',
    `### ${c.title}`,
    '',
    `*Why this case:* ${c.why}`,
    '',
    `Audio ${r.durationSec.toFixed(1)} s · ${r.chunkCount} chunks · transcription by ${modelsUsed(r.calls, 'transcribe')} · notes by ${modelsUsed(r.calls, 'notes')} · ask by ${modelsUsed(r.calls, 'answer')}`,
    '',
    '<details><summary>Script (what was said)</summary>',
    '',
    ...c.lines.map((l) => `- **${l.speaker}:** ${l.text}`),
    '',
    '</details>',
    '',
    '<details><summary>Transcript (what the model heard)</summary>',
    '',
    ...m.segments.map((s) => `- \`${formatTs(s.start_ms)}\` ${s.text}`),
    '',
    '</details>',
    '',
    `**Title:** ${m.title}`,
    '',
    `**Summary:** ${m.summary ?? '—'}`,
    '',
    `**Decisions:** ${m.decisions.length ? '' : '_none recorded_'}`,
    ...m.decisions.map((d) => `- ${d}`),
    '',
    '**Action items**',
    '',
    '| Task | Owner | Due | At |',
    '|---|---|---|---|',
    ...(m.action_items.length ? m.action_items.map((a) => `| ${esc(a.text)} | ${esc(a.owner) || '—'} | ${esc(a.due) || '—'} | ${a.start_ms === null ? '—' : formatTs(a.start_ms)} |`) : ['| _none_ | | | |']),
    '',
    ...r.asks.flatMap((a) => [
      `**Ask:** ${a.q}`,
      '',
      `> ${a.error ? `⚠️ ${a.error}` : a.answer.replace(/\n+/g, ' ')}`,
      '',
      ...a.sources.map((s) => `> [${s.n}] *${s.meeting_title}* @ ${formatTs(s.start_ms)}: "${s.text}"`),
      '',
    ]),
    '**Checks**',
    '',
    ...r.checks.map((ch) => `- ${ch.pass ? '✅' : '❌'} ${ch.label}${ch.detail ? ` — ${ch.detail}` : ''}`),
    '',
    `Timing: uploads + processing ${secs(r.totalMs)}, notes ready ${secs(r.afterStopMs)} after "stop"; ${r.calls.length} model calls (${r.calls.map((x) => `${x.task} ${secs(x.ms)}`).join(', ')}).`,
    '',
  );
});

mkdirSync(path.join(ROOT, 'docs/case-studies'), { recursive: true });
writeFileSync(path.join(ROOT, 'docs/case-studies.md'), md.join('\n'));
writeFileSync(
  path.join(ROOT, 'docs/case-studies/results.json'),
  JSON.stringify(report.map(({ c, m, wer: w, checks, calls: cs, asks: a, durationSec, chunkCount, totalMs, afterStopMs, skipped: sk }) => ({ id: c.id, title: c.title, durationSec, chunkCount, skippedSilentChunks: sk, wer: w, totalMs, afterStopMs, meeting: m, asks: a, calls: cs, checks })), null, 2),
);
console.log(`\n${totalChecks.filter((c) => c.pass).length}/${totalChecks.length} checks passed → docs/case-studies.md`);
for (const r of report) for (const ch of r.checks.filter((x) => !x.pass)) console.log(`  ❌ ${r.c.id}: ${ch.label} — ${ch.detail ?? ''}`);
