import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Ai, Source } from './ai.ts';
import type { ActionItem, Db, Meeting } from './db.ts';
import { chunkPath, createPipeline } from './pipeline.ts';
import { searchSegments } from './search.ts';

export interface AppDeps {
  db: Db;
  ai: Ai;
  audioDir: string;
  webDist?: string;
  webhookUrls?: string[];
  retryDelaysMs?: number[];
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_AUDIO = '25mb'; // OpenAI's transcription upload limit

function nonNegInt(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(400, `${name} must be a non-negative integer`);
  return n;
}

export function createApp({ db, ai, audioDir, webDist, webhookUrls = [], retryDelaysMs }: AppDeps) {
  const pipeline = createPipeline({ db, ai, audioDir, retryDelaysMs, onReady: (id) => void notifyWebhooks(id) });
  const app = express();
  app.disable('x-powered-by');
  const json = express.json({ limit: '100kb' });
  const raw = express.raw({ type: () => true, limit: MAX_AUDIO });

  const mustGetMeeting = (id: string) => {
    const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined;
    if (!m) throw new HttpError(404, 'Meeting not found');
    return m;
  };
  const audioBody = (req: Request) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Expected a non-empty audio body');
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!mime.startsWith('audio/') && !mime.startsWith('video/')) throw new HttpError(415, 'Content-Type must be audio/*');
    return { body: req.body as Buffer, mime };
  };

  async function notifyWebhooks(meetingId: string) {
    if (!webhookUrls.length) return;
    const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId) as Meeting | undefined;
    if (!m) return;
    const items = db.prepare('SELECT text, owner, due FROM action_items WHERE meeting_id = ?').all(meetingId) as ActionItem[];
    const lines = items.map((a) => `• ${a.text}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''}`);
    // `text` makes this a valid Slack incoming-webhook payload; other consumers read `meeting`.
    const payload = {
      text: [`*${m.title}*`, m.summary, lines.length ? `*Action items*\n${lines.join('\n')}` : ''].filter(Boolean).join('\n\n'),
      meeting: { id: m.id, title: m.title, summary: m.summary, decisions: JSON.parse(m.decisions), action_items: items },
    };
    const results = await Promise.allSettled(
      webhookUrls.map((url) =>
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) }).then((r) => {
          if (!r.ok) throw new Error(`${url} → ${r.status}`);
        }),
      ),
    );
    for (const r of results) if (r.status === 'rejected') console.error('[webhook]', r.reason instanceof Error ? r.reason.message : r.reason);
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/meetings', json, (req, res) => {
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : null;
    const id = randomUUID();
    db.prepare('INSERT INTO meetings (id, title, title_locked, created_at) VALUES (?, ?, ?, ?)').run(id, title ?? 'Untitled meeting', title ? 1 : 0, Date.now());
    res.status(201).json({ id });
  });

  app.get('/api/meetings', (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT m.id, m.title, m.status, m.created_at, m.duration_ms, m.summary,
                  (SELECT COUNT(*) FROM action_items a WHERE a.meeting_id = m.id AND a.done = 0) AS open_items
             FROM meetings m ORDER BY m.created_at DESC`,
        )
        .all(),
    );
  });

  app.get('/api/meetings/:id', (req, res) => {
    const m = mustGetMeeting(req.params.id);
    const chunks = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(status = 'pending') AS pending, SUM(status = 'failed') AS failed
           FROM chunks WHERE meeting_id = ?`,
      )
      .get(m.id) as { total: number; pending: number | null; failed: number | null };
    res.json({
      ...m,
      title_locked: !!m.title_locked,
      decisions: JSON.parse(m.decisions),
      has_audio: !!m.audio_mime,
      segments: db.prepare('SELECT id, start_ms, end_ms, text FROM segments WHERE meeting_id = ? ORDER BY start_ms').all(m.id),
      action_items: db.prepare('SELECT * FROM action_items WHERE meeting_id = ? ORDER BY COALESCE(start_ms, 0), id').all(m.id),
      chunks: { total: chunks.total, pending: chunks.pending ?? 0, failed: chunks.failed ?? 0 },
    });
  });

  app.patch('/api/meetings/:id', json, (req, res) => {
    const m = mustGetMeeting(req.params.id);
    const title = req.body?.title;
    if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'title must be a non-empty string');
    db.prepare('UPDATE meetings SET title = ?, title_locked = 1 WHERE id = ?').run(title.trim().slice(0, 200), m.id);
    res.json({ ok: true });
  });

  app.delete('/api/meetings/:id', async (req, res) => {
    const m = mustGetMeeting(req.params.id);
    db.prepare('DELETE FROM meetings WHERE id = ?').run(m.id);
    await rm(path.join(audioDir, m.id), { recursive: true, force: true });
    res.status(204).end();
  });

  app.put('/api/meetings/:id/chunks/:seq', raw, async (req, res) => {
    const m = mustGetMeeting(req.params.id);
    const seq = nonNegInt(req.params.seq, 'seq');
    const startMs = nonNegInt(req.query.start_ms, 'start_ms');
    const existing = db.prepare('SELECT status FROM chunks WHERE meeting_id = ? AND seq = ?').get(m.id, seq) as { status: string } | undefined;
    // A retry after a lost response: we already have this chunk, so acknowledge and do nothing.
    if (existing?.status === 'done') return void res.json({ status: 'done' });
    if (m.status !== 'recording') throw new HttpError(409, `Meeting is ${m.status}; it no longer accepts audio`);
    const { body, mime } = audioBody(req);

    await mkdir(path.join(audioDir, m.id), { recursive: true });
    await writeFile(chunkPath(audioDir, m.id, seq), body);
    db.prepare(
      `INSERT INTO chunks (meeting_id, seq, start_ms, mime) VALUES (?, ?, ?, ?)
       ON CONFLICT (meeting_id, seq) DO UPDATE SET start_ms = excluded.start_ms, mime = excluded.mime, status = 'pending', error = NULL`,
    ).run(m.id, seq, startMs, mime);
    void pipeline.transcribeChunk(m.id, seq);
    res.status(202).json({ status: 'pending' });
  });

  app.put('/api/meetings/:id/audio', raw, async (req, res) => {
    const m = mustGetMeeting(req.params.id);
    const { body, mime } = audioBody(req);
    await mkdir(path.join(audioDir, m.id), { recursive: true });
    await writeFile(path.join(audioDir, m.id, 'full'), body);
    db.prepare('UPDATE meetings SET audio_mime = ? WHERE id = ?').run(mime, m.id);
    res.status(204).end();
  });

  app.get('/api/meetings/:id/audio', (req, res) => {
    const m = mustGetMeeting(req.params.id);
    if (!m.audio_mime) throw new HttpError(404, 'No audio for this meeting');
    // sendFile handles HTTP Range, so the <audio> element can seek. `root` keeps its dotfile
    // check to the relative part, so a DATA_DIR under e.g. ~/.config still works.
    res.sendFile(path.join(m.id, 'full'), { root: path.resolve(audioDir), headers: { 'Content-Type': m.audio_mime } });
  });

  app.post('/api/meetings/:id/finish', json, async (req, res) => {
    const m = mustGetMeeting(req.params.id);
    const duration = req.body?.duration_ms === undefined ? undefined : nonNegInt(req.body.duration_ms, 'duration_ms');
    void pipeline.finish(m.id, duration);
    res.status(202).json({ ok: true });
  });

  app.post('/api/meetings/:id/reprocess', (req, res) => {
    const m = mustGetMeeting(req.params.id);
    void pipeline.reprocess(m.id);
    res.status(202).json({ ok: true });
  });

  app.patch('/api/action-items/:id', json, (req, res) => {
    const id = nonNegInt(req.params.id, 'id');
    if (typeof req.body?.done !== 'boolean') throw new HttpError(400, 'done must be a boolean');
    const r = db.prepare('UPDATE action_items SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, id);
    if (!r.changes) throw new HttpError(404, 'Action item not found');
    res.json({ ok: true });
  });

  app.get('/api/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
    res.json(searchSegments(db, q));
  });

  app.post('/api/ask', json, async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 500) {
      throw new HttpError(400, 'question must be 1-500 characters');
    }
    const hits = searchSegments(db, question, { mode: 'or', limit: 12 });
    if (!hits.length) return void res.json({ answer: "I couldn't find anything about that in your meetings.", sources: [] });

    const sources: Source[] = hits.map((h, i) => ({ n: i + 1, meeting_title: h.meeting_title, start_ms: h.start_ms, text: h.text }));
    let answer: string;
    try {
      answer = await ai.answer(question.trim(), sources);
    } catch (e) {
      throw new HttpError(502, `Assistant unavailable: ${e instanceof Error ? e.message : e}`);
    }
    const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])));
    res.json({
      answer,
      sources: hits
        .map((h, i) => ({ n: i + 1, meeting_id: h.meeting_id, meeting_title: h.meeting_title, start_ms: h.start_ms, text: h.text }))
        .filter((s) => cited.has(s.n)),
    });
  });

  if (webDist && existsSync(webDist)) app.use(express.static(webDist));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string; message?: string };
    const status = err instanceof HttpError ? err.status : e.type === 'entity.too.large' ? 413 : e.status && e.status < 500 ? e.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Internal error' : e.message });
  });

  return { app, pipeline };
}
