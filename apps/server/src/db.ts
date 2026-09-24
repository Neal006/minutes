import Database from 'better-sqlite3';

export type Db = Database.Database;
export type MeetingStatus = 'recording' | 'processing' | 'ready' | 'failed';

export interface Meeting {
  id: string;
  title: string;
  title_locked: number;
  status: MeetingStatus;
  created_at: number;
  duration_ms: number;
  summary: string | null;
  decisions: string; // JSON string[]
  error: string | null;
  audio_mime: string | null;
}

export interface Segment {
  id: number;
  meeting_id: string;
  seq: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface ActionItem {
  id: number;
  meeting_id: string;
  text: string;
  owner: string | null;
  due: string | null;
  done: number;
  start_ms: number | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  title_locked INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'recording'
               CHECK (status IN ('recording', 'processing', 'ready', 'failed')),
  created_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  summary      TEXT,
  decisions    TEXT NOT NULL DEFAULT '[]',
  error        TEXT,
  audio_mime   TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  start_ms   INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  error      TEXT,
  PRIMARY KEY (meeting_id, seq)
);

CREATE TABLE IF NOT EXISTS segments (
  id         INTEGER PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  start_ms   INTEGER NOT NULL,
  end_ms     INTEGER NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS segments_by_meeting ON segments(meeting_id, start_ms);

CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts
  USING fts5(text, content='segments', content_rowid='id', tokenize='porter unicode61');

CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
  INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TABLE IF NOT EXISTS action_items (
  id         INTEGER PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  owner      TEXT,
  due        TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  start_ms   INTEGER
);
CREATE INDEX IF NOT EXISTS action_items_by_meeting ON action_items(meeting_id);
`;

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
