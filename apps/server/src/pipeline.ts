import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatTs, parseTs, type Ai } from './ai.ts';
import type { Db, Meeting } from './db.ts';

export interface PipelineDeps {
  db: Db;
  ai: Ai;
  audioDir: string;
  /** Wait between STT attempts; length = number of retries. */
  retryDelaysMs?: number[];
  onReady?: (meetingId: string) => void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function chunkPath(audioDir: string, meetingId: string, seq: number) {
  return path.join(audioDir, meetingId, `${seq}.chunk`);
}

/**
 * recording ─finish─► processing ─(all chunks settled)─► extract ─► ready
 *                                                          └─ error ─► failed ─reprocess─► processing
 */
export function createPipeline({ db, ai, audioDir, retryDelaysMs = [1000, 4000], onReady }: PipelineDeps) {
  // ponytail: in-process guard, fine for one server process; use a DB lease if this ever scales out.
  const finalizing = new Set<string>();

  const getMeeting = (id: string) => db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined;

  async function transcribeChunk(meetingId: string, seq: number): Promise<void> {
    const chunk = db.prepare('SELECT * FROM chunks WHERE meeting_id = ? AND seq = ?').get(meetingId, seq) as
      | { start_ms: number; mime: string; status: string }
      | undefined;
    if (!chunk || chunk.status === 'done') return;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      try {
        const audio = await readFile(chunkPath(audioDir, meetingId, seq));
        const segs = await ai.transcribe(audio, chunk.mime);
        if (!getMeeting(meetingId)) return; // deleted while we were transcribing
        db.transaction(() => {
          db.prepare('DELETE FROM segments WHERE meeting_id = ? AND seq = ?').run(meetingId, seq);
          const insert = db.prepare('INSERT INTO segments (meeting_id, seq, start_ms, end_ms, text) VALUES (?, ?, ?, ?, ?)');
          for (const s of segs) {
            insert.run(meetingId, seq, chunk.start_ms + Math.round(s.start * 1000), chunk.start_ms + Math.round(s.end * 1000), s.text);
          }
          db.prepare("UPDATE chunks SET status = 'done', error = NULL WHERE meeting_id = ? AND seq = ?").run(meetingId, seq);
        })();
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < retryDelaysMs.length) await sleep(retryDelaysMs[attempt]);
      }
    }
    if (lastError) {
      console.error(`[stt] ${meetingId}#${seq} failed:`, errMsg(lastError));
      db.prepare("UPDATE chunks SET status = 'failed', error = ? WHERE meeting_id = ? AND seq = ?").run(errMsg(lastError), meetingId, seq);
    }
    await maybeFinalize(meetingId);
  }

  async function maybeFinalize(meetingId: string): Promise<void> {
    const m = getMeeting(meetingId);
    if (!m || m.status !== 'processing' || finalizing.has(meetingId)) return;
    const { pending } = db.prepare("SELECT COUNT(*) AS pending FROM chunks WHERE meeting_id = ? AND status = 'pending'").get(meetingId) as { pending: number };
    if (pending) return;

    finalizing.add(meetingId);
    try {
      const segs = db.prepare('SELECT start_ms, text FROM segments WHERE meeting_id = ? ORDER BY start_ms').all(meetingId) as { start_ms: number; text: string }[];
      if (!segs.length) {
        db.prepare("UPDATE meetings SET status = 'ready', summary = 'No speech detected.', decisions = '[]', error = NULL WHERE id = ?").run(meetingId);
        onReady?.(meetingId);
        return;
      }
      const transcript = segs.map((s) => `[${formatTs(s.start_ms)}] ${s.text}`).join('\n');
      const x = await ai.extract(transcript);
      db.transaction(() => {
        // ponytail: re-extraction replaces items (and their done flags); merge by text if users complain.
        db.prepare('DELETE FROM action_items WHERE meeting_id = ?').run(meetingId);
        const insert = db.prepare('INSERT INTO action_items (meeting_id, text, owner, due, start_ms) VALUES (?, ?, ?, ?, ?)');
        for (const a of x.action_items) insert.run(meetingId, a.text, a.owner, a.due, parseTs(a.timestamp));
        db.prepare(
          `UPDATE meetings SET status = 'ready', error = NULL, summary = ?, decisions = ?,
                  title = CASE WHEN title_locked THEN title ELSE ? END
            WHERE id = ?`,
        ).run(x.summary, JSON.stringify(x.decisions), x.title.trim() || m.title, meetingId);
      })();
      onReady?.(meetingId);
    } catch (e) {
      console.error(`[extract] ${meetingId} failed:`, errMsg(e));
      db.prepare("UPDATE meetings SET status = 'failed', error = ? WHERE id = ?").run(errMsg(e), meetingId);
    } finally {
      finalizing.delete(meetingId);
    }
  }

  /** Recording stopped. Idempotent: calling it on an already-finished meeting is a no-op. */
  async function finish(meetingId: string, durationMs?: number): Promise<void> {
    db.prepare(
      `UPDATE meetings SET status = 'processing',
              duration_ms = COALESCE(?, (SELECT COALESCE(MAX(end_ms), 0) FROM segments WHERE meeting_id = ?))
        WHERE id = ? AND status = 'recording'`,
    ).run(durationMs ?? null, meetingId, meetingId);
    await maybeFinalize(meetingId);
  }

  /** Retry failed chunks and re-run extraction. Also "Process now" for an abandoned recording. */
  async function reprocess(meetingId: string): Promise<void> {
    db.prepare(
      `UPDATE meetings SET status = 'processing', error = NULL,
              duration_ms = MAX(duration_ms, (SELECT COALESCE(MAX(end_ms), 0) FROM segments WHERE meeting_id = ?))
        WHERE id = ?`,
    ).run(meetingId, meetingId);
    db.prepare("UPDATE chunks SET status = 'pending', error = NULL WHERE meeting_id = ? AND status = 'failed'").run(meetingId);
    const pending = db.prepare("SELECT seq FROM chunks WHERE meeting_id = ? AND status = 'pending'").all(meetingId) as { seq: number }[];
    if (!pending.length) return maybeFinalize(meetingId);
    await Promise.all(pending.map((c) => transcribeChunk(meetingId, c.seq)));
  }

  /** After a restart: resume chunks that were mid-flight and meetings waiting to finalize. */
  function recover(): void {
    const chunks = db.prepare("SELECT meeting_id, seq FROM chunks WHERE status = 'pending'").all() as { meeting_id: string; seq: number }[];
    for (const c of chunks) void transcribeChunk(c.meeting_id, c.seq);
    const meetings = db.prepare("SELECT id FROM meetings WHERE status = 'processing'").all() as { id: string }[];
    for (const m of meetings) void maybeFinalize(m.id);
  }

  return { transcribeChunk, maybeFinalize, finish, reprocess, recover };
}

export type Pipeline = ReturnType<typeof createPipeline>;
