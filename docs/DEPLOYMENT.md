# Deploying Minutes for $0: system design

**Goal:** run Minutes for a small team (≤ 50 people) with real login, HTTPS, backups and CI/CD, with no
monthly bill. Every component below has a free tier that covers this workload. The one thing that
*may* cost money is a domain name (≈ $10/yr); two $0 alternatives are given in §7.

## 1. Architecture

```
 Users (browser · Electron desktop app)
        │ HTTPS
        ▼
 ┌─────────────────────── Cloudflare (free) ───────────────────────┐
 │ Access: email one-time PIN / Google / GitHub login (≤ 50 users)  │
 │ Tunnel: outbound-only connection, no open ports on the VM        │
 └───────────────────────────────┬─────────────────────────────────┘
                                 │ tunnel
 ┌──────────── Oracle Cloud Always Free VM (Ampere A1, 2 OCPU / 12 GB, 200 GB) ─────────────┐
 │  docker compose (deploy/docker-compose.yml)                                               │
 │   cloudflared ──► app :3001 (Express API + built React app, one process)                   │
 │                    │  /data volume: SQLite (WAL) + playback audio                          │
 │   litestream ──────┤  continuous DB replication ──────────────► Cloudflare R2 (10 GB free) │
 │   audio-backup ────┘  nightly rclone sync of audio ───────────► Cloudflare R2              │
 └───────────────┬───────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (outbound)
      ┌──────────┴───────────┐
      ▼                      ▼
 Groq (free)            OpenRouter (free models)
 Whisper large-v3-turbo notes (JSON schema) + Ask
 transcription          nemotron-3-super → qwen3.8-27b → openrouter/free

 CI/CD: GitHub Actions (free for public repos) → tests + e2e (Obscura) → multi-arch image → GHCR (free for public)
 Desktop: Electron app via GitHub Releases, pointed at the public hostname (MINUTES_URL)
```

**Why one VM instead of serverless?** The app keeps state in SQLite and runs a background pipeline
(chunk transcription, then notes). A single long-lived process on a free VM is simpler than
splitting that across functions and a hosted DB, and the free Arm VM is far more machine than
this needs. Free PaaS tiers that sleep or wipe the disk on redeploy would lose the SQLite file.

## 2. Components and free-tier limits

| Component | Service (free tier) | Limit that matters | Headroom for this app |
|---|---|---|---|
| Compute + disk | Oracle Cloud Always Free, Ampere A1 | 2 OCPU, 12 GB RAM, 200 GB block storage (cut from 4/24 in June 2026) | The Node process idles at ~100 MB; SQLite + FTS5 easily serves thousands of meetings |
| HTTPS + ingress | Cloudflare Tunnel | Free, unlimited bandwidth (since July 2026) | No public IP or open port needed |
| Login | Cloudflare Access (Zero Trust free) | 50 users | Team-sized |
| Backups | Cloudflare R2 | 10 GB-month storage, free egress | Playback audio is ~14 MB per meeting-hour → ~690 hours before pruning |
| Transcription | Groq `whisper-large-v3-turbo` | 20 req/min, 2,000 req/day, 28,800 audio-s/day | **8 hours of meetings per day**, real segment timestamps |
| Notes + Ask | OpenRouter `:free` models | 20 req/min; 50 req/day (1,000/day after a one-time $10 credit purchase) | ~1 call per meeting + 1 per question → ~40 meetings/day with Q&A |
| Image registry | GitHub Container Registry | Free for public images | — |
| CI/CD | GitHub Actions | Free for public repos | Unit, e2e (Obscura + Chromium) and Docker smoke tests on every PR |

> **Transcription options, all $0:**
> - **Groq Whisper** (recommended at team scale): fastest and most accurate, with 8 h of audio/day free.
> - **Local Whisper on the VM** (`STT_PROVIDER=local`, the default with no STT key): whisper-base.en
>   through transformers.js. No account, audio never leaves the VM. It measured ~2.3 s per 20 s chunk on
>   a laptop CPU (the case studies use it), so the 2-OCPU VM keeps up with a couple of live meetings.
> - **OpenRouter audio models** (`STT_PROVIDER=openrouter`): OpenRouter rejects audio requests with
>   **402 unless the account holds ≥ $0.50**, even on `:free` models, and 50 requests/day would be only
>   ~16 minutes of audio. Not a $0 option.

Run `npm run models:free` to see which OpenRouter models are free *today*; the lineup changes
weekly, and the defaults are a fallback chain, so one retired model doesn't break notes.

## 3. Request and data flow

1. The recorder uploads a 16 kHz WAV chunk every 20 s → Cloudflare edge (Access checks the session cookie) → tunnel → `PUT /api/meetings/:id/chunks/:seq`.
2. The app writes the chunk to `/data/audio/<id>/<seq>.chunk` and records it in SQLite, then transcribes it (Groq) and inserts timestamped segments. **The chunk file is deleted once transcribed**, so only failed chunks stay for retries.
3. On stop: the full WebM recording is uploaded for playback, then `/finish` → notes via OpenRouter (JSON-schema output, validated with zod, one repair round) → `ready` → optional Slack webhook.
4. Litestream streams every SQLite WAL change to R2 within seconds; audio is synced nightly.

## 4. Security model

- **No open ports.** Compose publishes nothing; `cloudflared` dials out. The VM's security list only needs SSH (or nothing, if you use the Oracle console / Cloudflare SSH).
- **Authentication at the edge.** The app itself has no login, so Access is mandatory: create an Access application for the hostname with an allow-list (emails or your Google Workspace domain). Unauthenticated requests never reach the VM.
- **Secrets** live only in `deploy/.env` on the VM (`chmod 600`). The public image contains no secrets; CI uses only the built-in `GITHUB_TOKEN`.
- **App-level hardening already in place:** input validation, 25 MB upload cap, FTS query sanitizing, no HTML rendering of transcripts, sandboxed Electron with media permission limited to the app origin.
- **Privacy:** with Groq, audio leaves the VM; transcripts always go to OpenRouter for notes. Free endpoints may log prompts under their providers' terms. If that's unacceptable, use `STT_PROVIDER=local` (audio stays on the VM) and a model with a zero-retention policy for notes.

## 5. Reliability, backup and recovery

| Concern | Design | Target |
|---|---|---|
| Process crash | `restart: unless-stopped` + Docker healthcheck; the pipeline re-queues pending chunks and unfinished meetings on boot | Minutes lost: 0 (chunks are on disk before the 202 response) |
| AI provider down / 429 | OpenRouter SDK retries 429/5xx with backoff; model fallback chain; STT retried 3× per chunk; failed meetings get a **Try again** button | Degrades to "retry later", never loses data |
| Disk or VM loss | Litestream → R2 (point-in-time restore, 7-day retention) + nightly audio sync | RPO ≈ seconds for notes/transcripts, ≤ 24 h for playback audio; RTO ≈ 15 min (new VM + restore) |
| Bad deploy | Images are tagged by commit SHA; roll back with `docker compose pull` of the previous tag | ~1 min |

Restore on a fresh VM: `docker compose run --rm litestream restore -if-replica-exists /data/minutes.db`,
then `docker compose up -d`.

## 6. CI/CD

```
PR  → check (typecheck, 16 unit/API tests, web build)
    → e2e (11 user flows in Obscura, 6 recording/interaction tests in Chromium)
    → docker (build + smoke test with the mock AI provider)
main → same, then buildx pushes ghcr.io/neal006/minutes:{latest,<sha>} for amd64 + arm64
VM  → `docker compose pull && docker compose up -d` (manually, by cron, or with Watchtower)
```

## 7. Step-by-step

1. **VM:** create an Oracle Cloud account, then an Always Free *VM.Standard.A1.Flex* (2 OCPU / 12 GB, Ubuntu 24.04). Install Docker: `curl -fsSL https://get.docker.com | sh`.
   *Tip:* Oracle can reclaim idle Always Free instances on free-trial accounts. Upgrading to Pay-As-You-Go keeps the same free allowance and avoids reclamation.
2. **Domain + tunnel:** add a domain to Cloudflare (free plan). Zero Trust → Networks → Tunnels → create a tunnel, add public hostname `minutes.example.com → http://app:3001`, copy the token.
3. **Login:** Zero Trust → Access → Applications → self-hosted → `minutes.example.com`, policy: allow your emails or domain.
4. **Backups:** R2 → create bucket `minutes-backup` and an API token (Object Read & Write) → endpoint, key ID, secret.
5. **Keys:** OpenRouter key (https://openrouter.ai/keys) and Groq key (https://console.groq.com/keys). Both are free, and neither needs a card.
6. **Deploy:** copy `deploy/` to the VM, `cp .env.example .env`, fill it in, `docker compose up -d`.
7. **Desktop:** run the Electron app with `MINUTES_URL=https://minutes.example.com`; the Access login shows inside the window once.

**$0 without buying a domain:**
- *Private team access:* skip Cloudflare and use **Tailscale** (free personal plan). Install it on the VM and on each laptop, publish the app port only on the tailnet, and open `http://<vm>.ts.net:3001`. There's no public URL at all.
- *Free domain:* a free `eu.org` domain can be delegated to Cloudflare (approval takes a while), then follow steps 2–3.

## 8. Scaling path (when free stops being enough)

| Pressure | Next step | Cost |
|---|---|---|
| > 8 h of audio/day | Groq paid tier (~$0.04/audio-hour) or self-hosted faster-whisper on the VM | cents |
| OpenRouter free caps / quality | One-time $10 credit (1,000 req/day) or a paid model such as Claude via `AI_PROVIDER=anthropic` | $10 once |
| > 50 users | Cloudflare Access per-seat, or app-level auth (OIDC) | per seat |
| Multiple app instances | Move SQLite → Postgres (schema maps 1:1; FTS5 → `tsvector`), audio → R2 directly | managed DB |

## 9. Risks

- **Free tiers change without notice.** Oracle halved A1 in 2026, and OpenRouter's free lineup rotates weekly. Mitigations: provider abstraction (`AI_PROVIDER` / `STT_PROVIDER`), model fallback chains, `npm run models:free`, and a VM-agnostic Compose stack that runs on any Docker host (even a home machine behind the same tunnel).
- **Single VM = single point of failure.** That's acceptable for a team tool with seconds-level RPO via Litestream; the scaling path above covers HA if it ever matters.
