import { useEffect, useState } from 'react';
import { api, type SearchHit } from '../api.ts';
import { formatDate, formatTs, Highlight, useRoute } from '../util.tsx';

export function Search() {
  const q = useRoute().params.get('q') ?? '';
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHits(null);
    setError(null);
    api
      .search(q)
      .then((h) => alive && setHits(h))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [q]);

  // Group hits by meeting, keeping the best-ranked meeting first.
  const groups = new Map<string, SearchHit[]>();
  for (const h of hits ?? []) groups.set(h.meeting_id, [...(groups.get(h.meeting_id) ?? []), h]);

  return (
    <section className="page">
      <h1 className="page-title">
        Results for <q>{q}</q>
      </h1>
      {error && <p className="empty">Search failed: {error}</p>}
      {!error && !hits && <p className="muted">Searching…</p>}
      {hits && !hits.length && (
        <div className="empty">
          <p>No transcript mentions “{q}”.</p>
          <p className="muted">
            Try fewer words, or <a href={`#/ask?q=${encodeURIComponent(q)}`}>ask a question</a> instead.
          </p>
        </div>
      )}
      <div className="results">
        {[...groups.values()].map((group) => (
          <div key={group[0].meeting_id} className="result-group">
            <a className="result-meeting" href={`#/m/${group[0].meeting_id}`}>
              {group[0].meeting_title} <span className="muted">· {formatDate(group[0].created_at)}</span>
            </a>
            <ul>
              {group.map((h) => (
                <li key={h.segment_id}>
                  <a href={`#/m/${h.meeting_id}?t=${h.start_ms}`}>
                    <span className="ts">{formatTs(h.start_ms)}</span>
                    <span>
                      <Highlight text={h.snippet} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
