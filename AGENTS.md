# AGENTS.md — Project Memory (auto-maintained)
Last updated: 2026-09-24 | Sessions logged: 1

## Identity
Minutes: AI meeting notes (record → live transcript → Claude notes → search/ask). Portfolio project targeting the Circleback SWE intern role.

## Stack & Commands
Node 22, npm workspaces, TypeScript 7, Express 5, better-sqlite3 (FTS5), React 19 + Vite 8, Electron 44, @anthropic-ai/sdk, zod 4.
- install: `npm install` (if Electron binary missing: `node node_modules/electron/install.js`)
- dev: `npm run dev` (API :3001 + Vite :5173) · seed: `npm run seed` · prod: `npm run build && npm start`
- test: `npm test` · typecheck: `npm run typecheck` · desktop: `npm run desktop`

## Current State & Focus
Works: recording (web + Electron system audio), chunked upload queue w/ retry, STT pipeline, Claude extraction, FTS search, Ask w/ citations, webhooks, seed data, 6 server tests, CI.
Not verified live: real Claude/Whisper calls (no keys in dev env; covered by fakes + typecheck).
Not built: diarization, eval set, embeddings, React Native, auth/deploy (see docs/PLAN.md §9).

## Architecture
web Recorder → PUT /api/meetings/:id/chunks/:seq (standalone 20s webm) → pipeline.transcribeChunk → segments (+chunk start offset)
POST /finish → status processing → maybeFinalize when no pending chunks → ai.extract → ready → webhooks
Status machine: recording → processing → ready | failed (reprocess → processing). State lives in SQLite (data/minutes.db) + data/audio/<id>/{seq}.chunk, full.
AI injected via createApp({ ai }) → tests use fakes.

## File Map
- apps/server/src/db.ts — schema (meetings, chunks, segments + segments_fts triggers, action_items); openDb
- apps/server/src/ai.ts — Ai interface, realAi (Whisper-compatible fetch + Claude beta.messages.parse/create w/ fallbacks), dropSilence, formatTs/parseTs
- apps/server/src/pipeline.ts — createPipeline: transcribeChunk (retries), maybeFinalize, finish, reprocess, recover
- apps/server/src/app.ts — createApp: all routes, validation (HttpError), webhooks, static web
- apps/server/src/search.ts — toFtsQuery (safe), searchSegments, MARK_START/END
- apps/server/src/index.ts — entry; seed.ts — demo data
- apps/server/test/api.test.ts — end-to-end tests with fake AI
- apps/web/src/recorder.ts — Recorder singleton (mixing, chunking, upload queue)
- apps/web/src/api.ts — typed client; util.tsx — hash router, Highlight, formatters
- apps/web/src/pages/{Home,Meeting,Search,Ask}.tsx; App.tsx — shell, RecordControl, SearchBox
- apps/desktop/main.cjs — Electron shell, loopback display-media handler; preload.cjs
- docs/PLAN.md — full implementation plan

## Conventions
- Server imports use `.ts` extensions (tsx runtime, noEmit tsc).
- Throw HttpError(status, msg) in routes; Express 5 forwards async errors.
- Deliberate shortcuts are marked `// ponytail:` with the upgrade path.
- Never render transcript text as HTML.

## Dependencies & Gotchas
- node:sqlite in Node 22 lacks FTS5 → use better-sqlite3.
- express sendFile rejects paths with dot-dirs unless using `root` option (test uses `.minutes-` tmp dir to guard).
- Electron postinstall may not download the binary on Windows; run install.js.
- MediaRecorder timeslices aren't standalone → recorder restarts per chunk.
- Claude: model claude-opus-5, structured outputs via betaZodOutputFormat; fallbacks "default" needs beta header server-side-fallback-2026-07-01.

## Decisions Log
- 2026-09-24 — SQLite+FTS5 over Postgres — zero ops for a single-user demo
- 2026-09-24 — OpenAI-compatible STT endpoint — swap OpenAI/Groq/local by env
- 2026-09-24 — hash router, no router dep — works in Electron/file://

## Changelog
- 2026-09-24 | MVP: server, web, desktop, tests, CI, docs | all | initial build

## Archived Summary
