import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ActionItem, type Meeting, type Status } from '../api.ts';
import { useRecorder } from '../App.tsx';
import { formatDate, formatDuration, formatTs, navigate, useRoute } from '../util.tsx';

const STATUS_LABEL: Record<Status, string | null> = { recording: 'Live', processing: 'Processing', failed: 'Failed', ready: null };

export function StatusBadge({ status }: { status: Status }) {
  const label = STATUS_LABEL[status];
  return label ? <span className={`badge ${status}`}>{label}</span> : null;
}

function TitleEditor({ id, title, onSaved }: { id: string; title: string; onSaved: () => void }) {
  const [draft, setDraft] = useState(title);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(title); // follow AI-generated titles unless the user is typing
  }, [title, focused]);

  const save = async () => {
    setFocused(false);
    const next = draft.trim();
    if (!next || next === title) return setDraft(title);
    try {
      await api.rename(id, next);
      onSaved();
    } catch {
      setDraft(title);
    }
  };

  return (
    <input
      className="title-input"
      value={draft}
      aria-label="Meeting title"
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(title);
          setTimeout(() => (document.activeElement as HTMLElement)?.blur());
        }
      }}
    />
  );
}

/** Scroll a transcript line into view inside the panel, without moving the whole page (desktop). */
function revealLine(el: Element | null | undefined, block: 'nearest' | 'center') {
  const box = el?.closest('.transcript');
  if (!(el instanceof HTMLElement) || !(box instanceof HTMLElement)) return;
  if (getComputedStyle(box).position === 'static') return el.scrollIntoView({ block }); // stacked mobile layout
  if (box.scrollHeight <= box.clientHeight) return; // everything already visible
  const top = el.offsetTop - box.scrollTop;
  if (block === 'center') box.scrollTop = el.offsetTop - box.clientHeight / 2;
  else if (top < 60 || top + el.offsetHeight > box.clientHeight) box.scrollTop = el.offsetTop - 60;
}

function toMarkdown(m: Meeting) {
  const items = m.action_items.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''}`);
  return [
    `# ${m.title}`,
    m.summary ?? '',
    m.decisions.length ? `## Decisions\n${m.decisions.map((d) => `- ${d}`).join('\n')}` : '',
    items.length ? `## Action items\n${items.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function MeetingPage({ id }: { id: string }) {
  const rec = useRecorder();
  const liveHere = rec.meetingId === id && rec.phase !== 'idle';
  const { params } = useRoute();
  const deepLinkMs = params.get('t') ? Number(params.get('t')) : null;

  const [m, setM] = useState<Meeting | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [currentMs, setCurrentMs] = useState<number | null>(deepLinkMs);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    try {
      setM(await api.getMeeting(id));
      setError(null);
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : undefined, message: e instanceof Error ? e.message : String(e) });
    }
  }, [id]);

  useEffect(() => void load(), [load]);

  // Poll while the meeting is live or being processed.
  useEffect(() => {
    if (!m || !(m.status === 'recording' || m.status === 'processing' || liveHere)) return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [m, liveHere, load]);

  // Live: keep the newest lines in view.
  const segCount = m?.segments.length ?? 0;
  useEffect(() => {
    if (m?.status === 'recording') revealLine(transcriptRef.current?.lastElementChild, 'nearest');
  }, [segCount, m?.status]);

  // Deep link (?t=ms from search/ask): jump there once.
  useEffect(() => {
    if (deepLinkMs === null || !segCount) return;
    setCurrentMs(deepLinkMs);
    requestAnimationFrame(() => revealLine(transcriptRef.current?.querySelector('.active'), 'center'));
    if (audioRef.current) audioRef.current.currentTime = deepLinkMs / 1000;
  }, [deepLinkMs, segCount]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  if (error?.status === 404) return <div className="empty">This meeting doesn't exist or was deleted. <a href="#/">Back to meetings</a></div>;
  if (error && !m) return <div className="empty">Couldn't load this meeting: {error.message}</div>;
  if (!m) return <div className="empty muted">Loading…</div>;

  const seek = (ms: number) => {
    setCurrentMs(ms);
    const a = audioRef.current;
    if (a) {
      a.currentTime = ms / 1000;
      void a.play();
    }
  };

  const toggle = async (item: ActionItem) => {
    const flip = (done: number) => setM((prev) => prev && { ...prev, action_items: prev.action_items.map((a) => (a.id === item.id ? { ...a, done } : a)) });
    flip(item.done ? 0 : 1);
    try {
      await api.setDone(item.id, !item.done);
    } catch {
      flip(item.done);
    }
  };

  const reprocess = async () => {
    await api.reprocess(id);
    void load();
  };

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    await api.remove(id);
    navigate('/');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(m));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const active = currentMs === null ? null : m.segments.find((s) => currentMs >= s.start_ms && currentMs < Math.max(s.end_ms, s.start_ms + 1));

  return (
    <article className="page meeting">
      <header className="meeting-head">
        <TitleEditor id={id} title={m.title} onSaved={load} />
        <div className="meeting-meta muted">
          <span>{formatDate(m.created_at)}</span>
          {m.duration_ms > 0 && <span>{formatDuration(m.duration_ms)}</span>}
          <StatusBadge status={m.status} />
          <span className="spacer" />
          {m.status === 'ready' && (
            <button className="btn ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy notes'}
            </button>
          )}
          {!liveHere && (
            <button className={`btn ghost ${confirmDelete ? 'danger-text' : ''}`} onClick={remove}>
              {confirmDelete ? 'Click again to delete' : 'Delete'}
            </button>
          )}
        </div>
      </header>

      <StatusBanner m={m} liveHere={liveHere} onReprocess={reprocess} />

      <div className="meeting-grid">
        <section className="notes" aria-label="Notes">
          {m.status === 'ready' ? (
            <>
              <h2>Summary</h2>
              <p className="summary">{m.summary}</p>
              {m.decisions.length > 0 && (
                <>
                  <h2>Decisions</h2>
                  <ul className="decisions">
                    {m.decisions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </>
              )}
              <h2>Action items</h2>
              {m.action_items.length ? (
                <ul className="items">
                  {m.action_items.map((a) => (
                    <li key={a.id} className={a.done ? 'done' : ''}>
                      <input type="checkbox" checked={!!a.done} onChange={() => toggle(a)} aria-label={`Mark "${a.text}" ${a.done ? 'not done' : 'done'}`} />
                      <div>
                        <span className="item-text">{a.text}</span>
                        <div className="item-meta">
                          {a.owner && <span className="chip">{a.owner}</span>}
                          {a.due && <span className="chip subtle">Due {a.due}</span>}
                          {a.start_ms !== null && (
                            <button className="ts" onClick={() => seek(a.start_ms!)}>
                              {formatTs(a.start_ms)}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No action items.</p>
              )}
            </>
          ) : (
            <div className="notes-pending">
              <div className="skeleton" />
              <div className="skeleton short" />
              <div className="skeleton" />
              <p className="muted">{m.status === 'failed' ? 'Notes unavailable.' : 'Summary, decisions and action items appear when the meeting ends.'}</p>
            </div>
          )}
        </section>

        <section className="transcript" aria-label="Transcript">
          {m.has_audio && (
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={`/api/meetings/${id}/audio`}
              onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
              onLoadedMetadata={(e) => {
                if (deepLinkMs !== null) e.currentTarget.currentTime = deepLinkMs / 1000;
              }}
            />
          )}
          {m.segments.length ? (
            <ol ref={transcriptRef}>
              {m.segments.map((s) => (
                <li key={s.id} className={s === active ? 'active' : ''} ref={s === active ? (el) => revealLine(el, 'nearest') : undefined}>
                  <button className="ts" onClick={() => seek(s.start_ms)}>
                    {formatTs(s.start_ms)}
                  </button>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted transcript-empty">
              {m.status === 'recording' ? (liveHere ? 'Listening… the first lines appear about 20 seconds in.' : 'No audio arrived.') : 'No transcript.'}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}

function StatusBanner({ m, liveHere, onReprocess }: { m: Meeting; liveHere: boolean; onReprocess: () => void }) {
  if (m.status === 'recording' && liveHere) {
    return (
      <div className="banner live">
        <span className="rec-dot" /> Recording. The transcript updates about every 20 seconds.
      </div>
    );
  }
  if (m.status === 'recording') {
    return (
      <div className="banner warn">
        This recording was interrupted before it finished.
        <button className="btn" onClick={onReprocess}>
          Process now
        </button>
      </div>
    );
  }
  if (m.status === 'processing') {
    return (
      <div className="banner">
        <span className="spinner" /> {m.chunks.pending ? `Transcribing the last ${m.chunks.pending} part${m.chunks.pending === 1 ? '' : 's'}…` : 'Writing notes…'}
      </div>
    );
  }
  if (m.status === 'failed') {
    return (
      <div className="banner error">
        Couldn't generate notes: {m.error}
        <button className="btn" onClick={onReprocess}>
          Try again
        </button>
      </div>
    );
  }
  if (m.chunks.failed) {
    return (
      <div className="banner warn">
        {m.chunks.failed} part{m.chunks.failed === 1 ? '' : 's'} of the audio couldn't be transcribed.
        <button className="btn" onClick={onReprocess}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}
