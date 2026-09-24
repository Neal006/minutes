# Minutes — Implementation Plan (A → Z)

A small, honest version of an AI meeting-notes product: record a meeting on desktop or web,
transcribe it while it's happening, and turn it into a summary, decisions, and action items you
can search and ask questions about.

Built to exercise every line of the Circleback SWE-intern role: database models → API → React UI,
an Electron desktop app, on-device recording/streaming, transcription, AI outcomes, search, an
assistant, automations, and app/API reliability.

---

## 1. Goals / non-goals

**Goals (v1, this repo)**
1. Record mic (+ optional system/tab audio) from the browser or the Electron app.
2. Stream audio to the server in chunks while recording; transcript appears live.
3. Survive bad networks: chunks queue locally and retry; uploads are idempotent.
4. When the meeting ends, Claude extracts **title, summary, decisions, action items (owner, due, timestamp)**.
5. Full-text search across every transcript, with highlighted snippets that deep-link to the moment.
6. "Ask your meetings": answers grounded in transcript excerpts, with clickable citations.
7. Automations: when notes are ready, POST them to a webhook (Slack-compatible).
8. Runs with one command locally; seed data so it's demo-able without API keys.

**Non-goals (v1)** — speaker diarization, calendar bots that join Zoom/Meet, multi-user auth,
Postgres/deploy, React Native app. See §9 Roadmap.

## 2. Architecture

```
 ┌──────────── Electron shell (apps/desktop) ─────────────┐
 │ grants getDisplayMedia → system audio (loopback)        │
 │  ┌──────────── React web app (apps/web) ─────────────┐  │
 │  │ Recorder: mic + system → WebAudio mix              │  │
 │  │   ├─ chunk MediaRecorder (20s standalone files) ───┼──┼─► PUT /api/meetings/:id/chunks/:seq  (idempotent, retried)
 │  │   └─ full MediaRecorder (whole meeting)  ──────────┼──┼─► PUT /api/meetings/:id/audio        (on stop)
 │  │ Meeting / Search / Ask pages (poll while live)   ◄─┼──┼── GET /api/...
 │  └────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────┘
                              │
             Express API (apps/server) ── SQLite (WAL) + FTS5
                  │ pipeline: chunk → Whisper-compatible STT → segments (+offset)
                  │ finish  → all chunks settled → Claude structured extraction → ready
                  │ ready   → webhooks (Slack-compatible)
                  └ ask     → FTS5 (BM25) retrieve → Claude answer with [n] citations
```

**Why chunked standalone files, not one stream?** `MediaRecorder` timeslices after the first
aren't decodable alone (no container header). Starting a fresh recorder every 20s gives
self-contained files any STT API accepts, with no ffmpeg on the server. A second, continuous
recorder produces the single playback file.

**Why SQLite + FTS5?** One file, zero ops, BM25 ranking and snippets built in. Right-sized for
one user; the schema ports directly to Postgres (`tsvector`) later.

## 3. Data model

| table | key columns | notes |
|---|---|---|
| `meetings` | id, title, title_locked, status (`recording→processing→ready/failed`), created_at, duration_ms, summary, decisions (JSON), error, has_audio | status has a CHECK constraint |
| `chunks` | (meeting_id, seq) PK, start_ms, mime, status (`pending/done/failed`), error | PK makes uploads idempotent |
| `segments` | id, meeting_id, seq, start_ms, end_ms, text | absolute ms from meeting start |
| `segments_fts` | FTS5 external-content table over `segments.text` | kept in sync by triggers |
| `action_items` | id, meeting_id, text, owner, due, done, start_ms | start_ms links back to transcript |

All child tables `ON DELETE CASCADE`; deleting a meeting also removes its audio directory.

## 4. API

| method | path | purpose |
|---|---|---|
| POST | /api/meetings | start a meeting → `{id}` |
| GET | /api/meetings | list |
| GET | /api/meetings/:id | meeting + segments + action items + chunk stats |
| PATCH | /api/meetings/:id | rename (locks title so AI won't overwrite) |
| DELETE | /api/meetings/:id | delete meeting + audio |
| PUT | /api/meetings/:id/chunks/:seq?start_ms= | raw audio body; idempotent; 202 |
| PUT | /api/meetings/:id/audio | full recording for playback |
| GET | /api/meetings/:id/audio | playback (HTTP range supported) |
| POST | /api/meetings/:id/finish | recording stopped → process when chunks settle |
| POST | /api/meetings/:id/reprocess | retry failed chunks + extraction |
| PATCH | /api/action-items/:id | toggle done |
| GET | /api/search?q= | FTS5 search with snippets |
| POST | /api/ask | `{question}` → `{answer, sources[]}` |

Validation at the boundary: ids must exist (404), `seq`/`start_ms` must be non-negative ints (400),
bodies capped at 25 MB (the Whisper API limit), chunk uploads to a finished meeting rejected (409).

## 5. Processing pipeline & failure handling

| failure | behavior |
|---|---|
| client offline / upload 5xx | chunk stays in the in-memory queue, exponential backoff (1s→30s), retried on `online` event; UI shows "N chunks waiting" |
| duplicate upload (retry after a lost response) | `(meeting_id, seq)` PK → already-done chunk is a no-op |
| STT call fails | 3 attempts with backoff, then chunk `failed`; meeting still finishes with the rest and shows a warning; *Reprocess* retries |
| Whisper hallucinates on silence ("Thank you.") | drop segments with `no_speech_prob > 0.6 && avg_logprob < -1` (Whisper's own heuristic) |
| empty transcript | skip the LLM entirely → "No speech detected." |
| Claude error / refusal / invalid output | meeting `failed` with the error text; *Reprocess* button |
| server restarts mid-meeting | on boot, `pending` chunks are re-queued and `processing` meetings re-checked |
| tab closed while recording | `beforeunload` warning; meeting stays `recording`, *Process now* finalizes what arrived |
| webhook down | logged, never blocks notes (5s timeout) |
| XSS via transcript text in search snippets | snippets use control-char markers, rendered as React nodes — never `innerHTML` |
| FTS syntax injection (`"`, `NEAR`, `*`) | queries are tokenized to letters/digits and each token quoted |

## 6. AI

- **Transcription:** any OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI `whisper-1`,
  Groq `whisper-large-v3-turbo`, or a local faster-whisper server) with `verbose_json` for
  segment timestamps. One code path, swappable by env.
- **Extraction:** Claude (`claude-opus-5`, effort `medium`) via the Anthropic SDK's structured
  outputs (`messages.parse` + Zod), so the response is schema-validated. Timestamps come back
  as `mm:ss` and are mapped to ms.
- **Ask:** retrieve top 12 segments with FTS5 (OR query, BM25), pass them numbered, require
  `[n]` citations, return only the sources actually cited.

## 7. Frontend

- Hash router (works under `file://` and in Electron), no router dependency.
- Pages: **Home** (meetings + record + search), **Meeting** (live/processing/ready states,
  audio player synced to transcript, click-to-seek, editable title, action item checkboxes,
  deep links `?t=ms`), **Search**, **Ask**.
- Every screen has loading, empty, and error states. `/` focuses search.

## 8. Desktop (Electron)

Thin shell around the web app: `setDisplayMediaRequestHandler` grants the primary screen with
`audio: 'loopback'`, so the same recorder code captures **system audio** (other people on a
Zoom call) without a picker. `contextIsolation`, `sandbox`, no node integration, external links
open in the browser. Loopback is Windows-only in Electron; elsewhere the UI falls back to
mic-only with a notice.

## 9. Roadmap (in priority order)

1. **Diarization** — pyannote or an STT provider with speakers; show "Speaker 1/2".
2. **Eval set** — 20 real transcripts with hand-labeled action items; measure extraction
   precision/recall per prompt/model change.
3. **Hybrid search** — embeddings + FTS5 fused with RRF when keyword recall falls short.
4. **React Native companion** — record in-person meetings, resumable background upload, push
   when notes are ready (reuses the same chunk API).
5. **Integrations** — Linear/Slack rich messages; calendar-aware auto-titles.
6. **Deploy** — Postgres + object storage, auth, Fly.io.

## 10. Milestones

| # | milestone | done when |
|---|---|---|
| M1 | schema + API + FTS5 | tests: CRUD, idempotent chunks, search, cascade delete |
| M2 | pipeline + fakes | tests: retry, failure → reprocess, empty transcript, restart recovery |
| M3 | Claude + Whisper adapters | typecheck; manual run with real keys |
| M4 | web recorder + pages | record → live transcript → notes in the browser |
| M5 | Electron shell | system audio captured on Windows |
| M6 | seed, README, CI | `npm run seed && npm run dev` shows a populated app; CI green |

## 11. Testing strategy

- `node:test` + real SQLite + real HTTP server; AI is injected (`createApp({ ai })`), so tests
  exercise the true pipeline with deterministic fakes and no network.
- CI (GitHub Actions): typecheck all workspaces, run server tests, build the web app.
- Manual checklist in the README (record 1 min; drop network mid-recording; restart server).
