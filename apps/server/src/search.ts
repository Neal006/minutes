import type { Db } from './db.ts';

// Control characters can't appear in transcripts, so the client can split on them safely
// and render highlights as elements instead of trusting HTML in user content.
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

const STOPWORDS = new Set(
  'a an and are as at be but by did do does for from had has have how i if in into is it its me my of on or our so that the their them then there these they this to was we were what when where which who why will with you your about'.split(' '),
);

/**
 * Turn free text into a safe FTS5 query. Tokens are letters/digits only and each is quoted,
 * so user input can never inject FTS syntax (NEAR, *, column filters, unbalanced quotes).
 * The last token gets a prefix match so search-as-you-type works.
 */
export function toFtsQuery(q: string, mode: 'and' | 'or' = 'and'): string | null {
  const tokens = [...new Set((q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOPWORDS.has(t)))].slice(0, 12);
  if (!tokens.length) return null;
  const parts = tokens.map((t) => `"${t}"`);
  if (mode === 'and') parts[parts.length - 1] += '*';
  return parts.join(mode === 'and' ? ' ' : ' OR ');
}

export interface SearchHit {
  segment_id: number;
  meeting_id: string;
  meeting_title: string;
  created_at: number;
  start_ms: number;
  text: string;
  snippet: string;
}

export function searchSegments(db: Db, q: string, opts: { mode?: 'and' | 'or'; limit?: number } = {}): SearchHit[] {
  const match = toFtsQuery(q, opts.mode);
  if (!match) return [];
  return db
    .prepare(
      `SELECT s.id AS segment_id, s.meeting_id, m.title AS meeting_title, m.created_at, s.start_ms, s.text,
              snippet(segments_fts, 0, ?, ?, '…', 16) AS snippet
         FROM segments_fts
         JOIN segments s ON s.id = segments_fts.rowid
         JOIN meetings m ON m.id = s.meeting_id
        WHERE segments_fts MATCH ?
        ORDER BY bm25(segments_fts)
        LIMIT ?`,
    )
    .all(MARK_START, MARK_END, match, opts.limit ?? 50) as SearchHit[];
}
