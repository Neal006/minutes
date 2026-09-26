# Deploying Minutes with Argo CD on one platform ($0)

Everything runs on **Oracle Cloud Always Free**: one Ampere A1 VM runs k3s, Argo CD and the app; Oracle
Object Storage holds the database backups. The only services outside Oracle are the AI APIs, which are
free tiers: OpenRouter `:free` models for notes (paid ids are refused at startup) and Groq's free Whisper
for transcription. Set `STT_PROVIDER=local` to transcribe on the VM and drop Groq as well.

```
git push main ──► GitHub Actions: typecheck, unit, e2e, manifest schema check
                         │ all green
                         ▼
                  build arm64/amd64 image ──► ghcr.io/neal006/minutes:<sha>
                         │
                         ▼
                  commit "newTag: <sha>" to deploy/k8s/kustomization.yaml
                         │
┌──────── Oracle A1 VM (k3s) ────────────────────────▼─────────────────────────┐
│ Argo CD ── polls main (~3 min) ── syncs deploy/k8s ──► Deployment minutes      │
│                                                        ├ app  (:3001)          │
│ Traefik :443 ── Let's Encrypt cert (cert-manager)      ├ litestream sidecar ───┼──► Object Storage
│   └ basic auth ──────────────────────────────────────► └ PVC /data (SQLite)    │    (DB replica)
└──────────────────────────────────────────────────────────────────────────────┘
```

## What's where

| Path | Purpose |
|---|---|
| `deploy/argocd/root.yaml` | App of apps; the only manifest applied by hand |
| `deploy/argocd/apps/cert-manager.yaml` | cert-manager Helm chart (sync wave -1, installs CRDs first) |
| `deploy/argocd/apps/minutes.yaml` | Syncs `deploy/k8s` from `main`, auto-prune and self-heal |
| `deploy/k8s/` | Namespace, PVC, Deployment (+ Litestream restore/sidecar), Service, Ingress, Traefik middlewares, ClusterIssuer |
| `deploy/secrets/*.env.example` | Templates for the two secrets; the filled-in `*.env` files are git-ignored |
| `deploy/bootstrap.sh` | One-time VM setup: firewall, k3s, Argo CD, secrets, root app |

Design choices: **1 replica + `Recreate`** because SQLite has one writer; Litestream **restores on start**
when the volume is empty (new VM, lost disk) and **replicates continuously** as a native sidecar; basic
auth at the ingress because the app has no login of its own; secrets are created with `kubectl` and never
committed (upgrade path: Sealed Secrets or External Secrets).

## Setup (about 30 minutes, once)

1. **Oracle account**: sign up for Always Free, then create an **Ampere A1** instance (Ubuntu 24.04,
   2 OCPU / 12 GB, 100 GB boot volume). In the VCN security list, allow TCP 80 and 443 from anywhere.
2. **Backup bucket**: create a private bucket `minutes-backup` and a *Customer secret key* (Profile menu).
3. **Hostname**: use your domain (A record → VM IP) or no DNS at all with sslip.io:
   `minutes.<ip-with-dashes>.sslip.io`. Put it in both places in `deploy/k8s/ingress.yaml`, commit, push.
4. **On the VM**:
   ```sh
   git clone https://github.com/Neal006/minutes.git && cd minutes
   cp deploy/secrets/app.env.example deploy/secrets/app.env         # OpenRouter + Groq keys
   cp deploy/secrets/backup.env.example deploy/secrets/backup.env   # bucket + secret key
   MINUTES_USER=me ./deploy/bootstrap.sh    # prompts for the app password (bcrypt, 12+ chars)
   ```
5. Watch `sudo k3s kubectl -n argocd get applications` until both are `Synced / Healthy`, then open
   `https://<your host>` and sign in.

From then on, **merging to `main` is the deploy**. Roll back with `git revert` of the `chore(deploy)` commit
(or pick an older `<sha>` in the Argo CD UI). Change a secret with the `apply_secret` line from
`bootstrap.sh`, then `sudo k3s kubectl -n minutes rollout restart deploy/minutes`.

## Is Argo CD worth it here?

It costs nothing extra on this VM (k3s + Argo CD + cert-manager use about 1.5 GB of the 12 GB) and gives
push-to-deploy, drift correction and one-click rollback. The **simplest** option is still
`deploy/docker-compose.yml` on the same VM (see [DEPLOYMENT.md](DEPLOYMENT.md)): fewer moving parts, no
GitOps. Choose Argo CD when you want the pipeline; choose compose when you want the least to operate.

## Risks

- Oracle may reclaim Always Free instances that sit idle (CPU under 20% for 7 days). Upgrading the account
  to Pay-As-You-Go keeps the free allowance and stops reclamation; set a $1 budget alert.
- Single VM: a host failure means downtime until a new VM is bootstrapped. Litestream restores the DB on
  first start, so data loss is limited to the last few seconds.
- Playback audio lives on the VM's volume only; enable the free boot-volume backup policy if you need it.
