import { useEffect, useState } from 'react';
import { api, type MeetingListItem } from '../api.ts';
import { StatusBadge } from './Meeting.tsx';
import { formatDate, formatDuration } from '../util.tsx';

export function Home() {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const list = await api.listMeetings();
        if (!alive) return;
        setMeetings(list);
        setError(null);
        // Keep polling only while something is still in flight.
        if (list.some((m) => m.status === 'recording' || m.status === 'processing')) timer = setTimeout(load, 3000);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  if (error) return <div className="empty">Couldn't load meetings: {error}. Is the server running?</div>;
  if (!meetings) return <div className="empty muted">Loading…</div>;
  if (!meetings.length) {
    return (
      <div className="empty">
        <h2>No meetings yet</h2>
        <p className="muted">
          Press <b>Record</b> to capture your next meeting. Want demo data? Run <code>npm run seed</code>.
        </p>
      </div>
    );
  }

  return (
    <section className="page">
      <h1 className="page-title">Meetings</h1>
      <ul className="meeting-list">
        {meetings.map((m) => (
          <li key={m.id}>
            <a href={`#/m/${m.id}`}>
              <div className="row-head">
                <span className="row-title">{m.title}</span>
                <StatusBadge status={m.status} />
              </div>
              {m.summary && <p className="row-summary">{m.summary}</p>}
              <div className="row-meta muted">
                <span>{formatDate(m.created_at)}</span>
                {m.duration_ms > 0 && <span>{formatDuration(m.duration_ms)}</span>}
                {m.open_items > 0 && <span className="chip">{m.open_items} open action item{m.open_items === 1 ? '' : 's'}</span>}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
