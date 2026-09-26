# AGENTS.md — Project Memory (auto-maintained)
Last updated: 2026-09-26 | Sessions logged: 5

## Identity
Minutes: AI meeting notes (record → live transcript → AI notes → search/ask). Portfolio project targeting the Circleback SWE intern role.

## Stack & Commands
Node 22, npm workspaces, TypeScript 7, Express 5, better-sqlite3 (FTS5), React 19 + Vite 8, Electron 44, @openrouter/sdk, @anthropic-ai/sdk, @huggingface/transformers (local Whisper), zod 4, Playwright + Obscura.
- install: `npm install` (Electron binary missing? `node node_modules/electron/install.js`; e2e needs `npx playwright install chromium`)
- dev: `npm run dev` (API :3001 + Vite :5173) · offline: `AI_PROVIDER=mock npm run dev` · seed: `npm run seed`
- test: `npm test` (18) · live e2e (real keys, no mocks): `LIVE_ENV_FILE=.env npm run e2e:live` · e2e: `npm run e2e` (17: Obscura + Chromium) · case studies: `npm run case-studies` (needs OPENROUTER_API_KEY; `-- --audio-only` offline)
- free models now: `npm run models:free` · typecheck: `npm run typecheck` · build: `npm run build` · docker: `docker build -t minutes .`

## Current State & Focus
Works: recording (web + Electron system audio, chunks → 16 kHz WAV), upload queue w/ retry, provider layer (notes: OpenRouter free default / Anthropic / mock; STT: local Whisper default / Whisper API / OpenRouter / mock), silence gate, pipeline + cleanExtraction, search, Ask, webhooks, unit + e2e + Docker CI, $0 deploy design (docs/DEPLOYMENT.md, deploy/).
Case studies run 2 (real free models): 43/43 content checks, owners 3/12 (all misses first-person → need diarization). Run 1 kept in docs/case-studies/run-1-before-fixes.*.
Not built: diarization, embeddings, React Native, app-level auth (Cloudflare Access covers deploy).

## Architecture
web Recorder → toWav16k → PUT /api/meetings/:id/chunks/:seq → pipeline.transcribeChunk (silence gate → STT) → segments (+chunk offset); chunk file deleted when done
POST /finish → processing → maybeFinalize (no pending chunks) → cleanExtraction(ai.extract) → ready → webhooks
Status: recording → processing → ready | failed (reprocess). State: SQLite (DATA_DIR/minutes.db) + DATA_DIR/audio/<id>/{seq.chunk,full}.
createAi(env, hooks) picks providers; tests inject fakes via createApp({ ai }).

## File Map
- apps/server/src/ai.ts — Ai/Stt/Llm types, Extraction schema, prompts, cleanExtraction (placeholders→null, dedupe, cap 25, title ext), parseJsonLoose, splitTimed, formatTs/parseTs, dropSilence
- apps/server/src/providers/index.ts — createAi(env, {onCall,onSilenceSkipped}); provider defaults; silence gate
- apps/server/src/providers/openrouter.ts — SDK client, isFreeModel + modelList (paid ids throw at boot unless OPENROUTER_ALLOW_PAID=1), notes (json_schema + repair), answer, STT via input_audio, DEFAULT_*_MODELS, CallEvent
- apps/server/src/providers/local.ts — localStt: transformers.js whisper-base.en q8; validates 16-bit/16 kHz WAV before model load; serialized; MODEL_CACHE_DIR
- apps/server/src/providers/{anthropic,whisper,mock}.ts — Claude, OpenAI-compatible STT, deterministic mock ([[flaky]] fails once)
- apps/server/src/wav.ts — wavInfo, rmsDbfs, isSilentWav (-50 dBFS), encodeWav, sliceWav
- apps/server/src/pipeline.ts — transcribeChunk (retries), maybeFinalize, finish, reprocess, recover
- apps/server/src/app.ts — routes, validation (HttpError), webhooks, static web
- apps/server/src/search.ts — toFtsQuery (safe), searchSegments, MARK_START/END
- apps/server/src/{index,seed,free-models}.ts — entry, demo data, free-model lister
- apps/server/case-studies/{cases,run}.ts, tts.ps1 — 5 scripted meetings, SAPI TTS, runner → docs/case-studies.md
- apps/server/test/{api,providers}.test.ts — API/pipeline + providers/wav
- apps/web/src/recorder.ts — Recorder (mix, chunk, WAV convert, upload queue); wav.ts — toWav16k
- apps/web/src/util.tsx — hash router, navigate (location.href), interceptInternalLinks, Highlight
- apps/web/src/pages/{Home,Meeting,Search,Ask}.tsx; App.tsx
- apps/desktop/main.cjs, preload.cjs — Electron shell, loopback audio
- e2e/{behavior,interactions,recording}.spec.ts, fixtures.ts; playwright.config.ts; scripts/get-obscura.mjs
- Dockerfile, deploy/{docker-compose.yml,litestream.yml,.env.example}; docs/{PLAN,DEPLOYMENT}.md (compose path)
- deploy/argocd/{root.yaml,apps/*} — app-of-apps (cert-manager wave -1, minutes wave 0); deploy/k8s/ — kustomize: 1 replica Recreate, Litestream restore init + native sidecar, Traefik basic-auth/https-redirect, ClusterIssuer; deploy/bootstrap.sh — k3s + Argo CD + secrets on one VM; deploy/secrets/*.env.example; docs/DEPLOY-ARGOCD.md

## Conventions
- Server imports use `.ts` extensions (tsx runtime in dev and prod, noEmit tsc).
- Throw HttpError(status, msg) in routes; Express 5 forwards async errors.
- Deliberate shortcuts are marked `// ponytail:` with the upgrade path.
- Never render transcript text as HTML. e2e tests create their own meetings; seeded ones are read-only.

## Dependencies & Gotchas
- node:sqlite in Node 22 lacks FTS5 → better-sqlite3.
- express sendFile rejects dot-dir paths unless `root` is used (test tmp dir starts with a dot).
- OpenRouter: SDK params camelCase (`chatRequest.responseFormat.jsonSchema`, `inputAudio`); default retryCodes are 5XX only, so we add 429; no WebM audio → WAV; free = 20 rpm, 50/day (1000 after $10). Audio requests 402 unless balance ≥ $0.50 even on :free → local Whisper is default STT; 402 is non-retryable.
- Free models write placeholder owners, loop duplicates, name titles "x.json" → cleanExtraction always runs. Case-study scorer normalizes U+2011 dashes.
- zod v4 `z.toJSONSchema` emits `$schema` (strip it) and additionalProperties:false (strict-ready).
- Obscura 0.2.3: needs `--allow-private-network` for localhost; link clicks don't navigate; `location.hash=` no-op; keydown preventDefault ignored for text; React checkbox onChange doesn't fire; no getUserMedia. See e2e/README.md.
- Playwright getByRole name matching is substring: use `exact: true` ("Delete" vs "Click again to delete").
- Oracle Always Free A1 is 2 OCPU/12 GB since 2026-06.
- Groq free plan (checked 2026-09-26): whisper-large-v3-turbo 20 RPM, 2K RPD, 7.2K audio-s/h, 28.8K audio-s/day.
- `openrouter/free` can route to unsuitable free models (content-safety classifier answered an Ask in the 2026-09-26 run).
- get-obscura.mjs uses System32 tar.exe on Windows: Git Bash's GNU tar reads `C:` as a remote host.
- kustomize `namespace:` stamps cluster-scoped CRs (ClusterIssuer) too; deploy/k8s relies on Argo's destination namespace.
- OpenRouter's generation log (GET /api/v1/generation?id=gen-…) stores dated slugs (`…-20260811:free`) for the alias the chat API returns; compare with the date stripped. Stats appear a few seconds after the call.
- Groq transcription ids: `x_groq.id` in verbose_json, `x-request-id` header as fallback.
- CI `deploy` job pins newTag to the SHA with [skip ci], only after check/e2e/manifests/docker pass.

## Decisions Log
- 2026-09-24 — SQLite+FTS5 over Postgres — zero ops for a single-user demo
- 2026-09-24 — hash router, no router dep — works in Electron/file://
- 2026-09-24 — OpenRouter free models as default provider; Anthropic/Whisper/mock pluggable — $0 to run
- 2026-09-24 — browser converts chunks to 16 kHz WAV — accepted by every STT incl. OpenRouter audio models
- 2026-09-24 — delete chunk files after transcription — ~8x less disk/backup
- 2026-09-24 — local Whisper default STT — OpenRouter audio needs paid balance; local is $0 and private
- 2026-09-26 — k3s + Argo CD on one Oracle A1 VM (Object Storage backups, Traefik + Let's Encrypt, basic auth); compose kept as the simplest path — one platform, GitOps, $0
- 2026-09-26 — reject non-:free OpenRouter ids at boot (opt-in OPENROUTER_ALLOW_PAID=1) — a bad env var must never bill
- 2026-09-24 — deploy: Oracle A1 + Cloudflare Tunnel/Access + Litestream→R2; Groq Whisper for prod STT — $0, no open ports

## Changelog
- 2026-09-26 | live e2e (real UI + Groq + OpenRouter, provenance verified via OpenRouter generation log); CallEvent gets provider + id, Whisper/Groq calls now reported; server logs every AI call (AI_CALL_LOG JSONL) | providers/{openrouter,whisper,local,index}.ts, index.ts, e2e/live/*, playwright.live.config.ts | prove responses' origin with provider ids, not trust
- 2026-09-26 | Argo CD GitOps deploy; e2e 17/17; real free-model run 44/55 (10 owner misses need diarization); Obscura tar fix | deploy/{argocd,k8s,secrets,bootstrap.sh}, ci.yml, get-obscura.mjs, docs/DEPLOY-ARGOCD.md | manifests schema-checked in CI; secrets only via kubectl
- 2026-09-26 | enforce free OpenRouter models; verified defaults still free via models:free | providers/openrouter.ts, test/providers.test.ts, .env.example | fail fast at boot, not per request
- 2026-09-24 | local Whisper default STT, cleanExtraction, scorer split (task vs owner), case-study run 2, README HLD/LLD/stack/case studies | ai.ts, pipeline.ts, providers/local.ts, case-studies/run.ts, test/providers.test.ts, README.md, docs/* | post-process model output; schema validation alone isn't enough
- 2026-09-24 | OpenRouter providers, WAV pipeline, Obscura e2e, case-study harness, $0 deploy design | apps/server/src/providers/*, wav.ts, e2e/*, apps/server/case-studies/*, Dockerfile, deploy/*, docs/DEPLOYMENT.md | provider abstraction + mock for e2e
- 2026-09-24 | MVP: server, web, desktop, tests, CI, docs | all | initial build

## Archived Summary
