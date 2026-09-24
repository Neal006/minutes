# Minutes

**AI meeting notes you can search and ask questions about.** Record a meeting in the browser or the
desktop app, watch the transcript appear while you talk, and get a summary, decisions, and action
items (with owners, due dates, and a link to the exact moment) when you hit stop.

![Meeting notes next to a transcript synced to the audio](docs/screenshots/meeting.png)

| Meetings | Search |
|---|---|
| ![Meeting list](docs/screenshots/home.png) | ![Search with highlighted matches](docs/screenshots/search.png) |

## What it does

- **Record anywhere**: mic in the browser; mic **plus system audio** (the other side of a Zoom call) in the Electron app.
- **Live transcription**: audio streams to the server in 20-second chunks and shows up as you talk.
- **Handles bad networks**: chunks wait in a local queue and retry with backoff. Uploads are idempotent, and the server picks up where it left off after a restart.
- **AI notes**: Claude extracts title, summary, decisions and action items using schema-validated structured output.
- **Search**: SQLite FTS5 full-text search across every transcript. Highlighted snippets link to the exact second.
- **Ask your meetings**: answers grounded in transcript excerpts, with `[n]` citations you can click.
- **Automations**: when notes are ready they're posted to any webhook, and Slack incoming webhooks work as-is.

## Quick start

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY and OPENAI_API_KEY (or a Groq/local Whisper endpoint)
npm run seed                # optional: 3 demo meetings, works without API keys
npm run dev                 # API on :3001, web app on http://localhost:5173
```

Desktop app (captures system audio on Windows):

```bash
npm run build && npm start  # server also serves the built web app on :3001
npm run desktop             # in a second terminal
```

| command | what |
|---|---|
| `npm test` | server tests: real HTTP + SQLite, fake AI (no network) |
| `npm run typecheck` | server + web |
| `npm run build` | production web build → `apps/web/dist` |

## How it works

```
Electron shell ─ grants system-audio loopback
  └ React app ─ Recorder: mic + system → WebAudio mix
       ├ chunk recorder (restarted every 20s → standalone files) ─► PUT /chunks/:seq  (queued, retried, idempotent)
       └ full recorder (one playback file)                       ─► PUT /audio       (on stop)
Express API ─ SQLite (WAL) + FTS5
  chunk → Whisper-compatible STT → timestamped segments
  finish → all chunks settled → Claude structured extraction → ready → webhooks
  ask → FTS5/BM25 retrieval → Claude answer with citations
```

A few decisions worth calling out (the full reasoning is in [`docs/PLAN.md`](docs/PLAN.md)):

- **Why restart the recorder every chunk?** `MediaRecorder` timeslices after the first one have no container header, so they can't be decoded alone. A fresh recorder per chunk produces files any STT API accepts, with no ffmpeg on the server. The next recorder starts *before* the previous one stops, so no audio is lost between chunks.
- **Why SQLite + FTS5?** One file, zero ops, BM25 ranking and snippets built in. It's the right size for this, and the schema maps directly onto Postgres `tsvector` later.
- **Failure is a first-class state.** A chunk that fails STT three times doesn't block the notes. A Claude error marks the meeting `failed` with a *Try again* button. Whisper's "Thank you." hallucination on silence is filtered out, and a silent meeting never calls the LLM.
- **Safe by construction.** Search queries are tokenized and quoted, so there's no FTS syntax injection. Snippet highlights use control-character markers rendered as React nodes, never `innerHTML`. Electron runs sandboxed with context isolation, and media permissions are granted only to the app's origin.

## Project layout

```
apps/server   Express + better-sqlite3 API, processing pipeline, Claude/Whisper adapters, tests
apps/web      React 19 + Vite app (recorder, meeting, search, ask)
apps/desktop  Electron shell for system-audio capture
docs/PLAN.md  the implementation plan: goals, data model, API, failure handling, roadmap
```

## Configuration

See [`.env.example`](.env.example). Transcription works with any OpenAI-compatible `/audio/transcriptions`
endpoint: OpenAI `whisper-1` (default), Groq `whisper-large-v3-turbo`, or a local faster-whisper server.

## Roadmap

Speaker diarization → an extraction eval set (precision/recall on hand-labeled action items) →
hybrid search with embeddings → a React Native companion app using the same chunk API → Postgres + auth + deploy.
Details in [`docs/PLAN.md`](docs/PLAN.md#9-roadmap-in-priority-order).
