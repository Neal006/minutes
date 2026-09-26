#!/usr/bin/env bash
# One-time bootstrap of a single VM (Oracle Cloud Always Free Ampere A1, Ubuntu 24.04):
# k3s + Argo CD + the secrets Minutes needs. After this, `git push` to main is the whole deploy.
# Safe to re-run: every step is idempotent.
#
# On the VM, from a clone of the repo:
#   cp deploy/secrets/app.env.example deploy/secrets/app.env         # fill in
#   cp deploy/secrets/backup.env.example deploy/secrets/backup.env   # fill in
#   MINUTES_USER=me ./deploy/bootstrap.sh      # prompts for the app password (never in shell history)
set -euo pipefail
ARGOCD_VERSION=v3.5.3
cd "$(dirname "$0")"

: "${MINUTES_USER:?set MINUTES_USER (login for the app)}"
if [[ -z ${MINUTES_PASSWORD:-} ]]; then
  read -rsp "Password for ${MINUTES_USER}: " MINUTES_PASSWORD && echo
fi
[[ ${#MINUTES_PASSWORD} -ge 12 ]] || { echo "use a password of at least 12 characters" >&2; exit 1; }
for f in secrets/app.env secrets/backup.env; do
  [[ -f $f ]] || { echo "missing deploy/$f: copy deploy/$f.example and fill it in" >&2; exit 1; }
done

# Oracle's Ubuntu images reject inbound traffic in iptables even when the VCN security list allows it.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

# k3s bundles Traefik (ingress on :80/:443) and a local-path volume provisioner.
command -v k3s >/dev/null || curl -sfL https://get.k3s.io | sh -
k() { sudo k3s kubectl "$@"; }
apply_secret() { k -n minutes create secret generic "$@" --dry-run=client -o yaml | k apply -f -; }

k create namespace argocd --dry-run=client -o yaml | k apply -f -
k apply -n argocd --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"
k -n argocd rollout status deploy/argocd-server --timeout=5m

k create namespace minutes --dry-run=client -o yaml | k apply -f -
apply_secret minutes-env --from-env-file=secrets/app.env
apply_secret minutes-backup --from-env-file=secrets/backup.env
# bcrypt htpasswd entry. The password goes in over stdin and the entry via a 0600 temp file, never argv
# (sudo closes inherited fds, so a <(…) pipe would not reach kubectl).
command -v htpasswd >/dev/null || sudo apt-get install -y -qq apache2-utils
users_file=$(umask 077 && mktemp)
trap 'rm -f "$users_file"' EXIT
printf '%s' "$MINUTES_PASSWORD" | htpasswd -niB "$MINUTES_USER" > "$users_file"
unset MINUTES_PASSWORD
apply_secret minutes-basic-auth --from-file=users="$users_file"

k apply -n argocd -f argocd/root.yaml

cat <<EOF

Done. Argo CD is now syncing deploy/k8s from main.
  Watch:           sudo k3s kubectl -n argocd get applications
  Admin password:  sudo k3s kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
  UI (laptop):     ssh -L 8080:localhost:8080 <vm> sudo k3s kubectl -n argocd port-forward svc/argocd-server 8080:443
                   then open https://localhost:8080 (user: admin)
EOF
