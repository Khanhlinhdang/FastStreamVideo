#!/usr/bin/env bash
# One-shot VPS bootstrap for LiveStream (Ubuntu 22.04+).
# Run from repo root on the VPS after cloning.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production ]]; then
  cp .env.production.example .env.production
  echo "Created .env.production — edit DOMAIN / JWT / SEED_ADMIN before continuing."
  echo "  nano .env.production"
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env.production
set +a

if [[ -z "${DOMAIN:-}" || "${DOMAIN}" == "livestream.example.com" ]]; then
  echo "Set DOMAIN in .env.production to your real hostname." >&2
  exit 1
fi
if [[ -z "${JWT_ACCESS_SECRET:-}" || "${JWT_ACCESS_SECRET}" == change-me* ]]; then
  echo "Generate JWT secrets: openssl rand -hex 32" >&2
  exit 1
fi

echo "==> Building and starting stack for DOMAIN=${DOMAIN}"
docker compose --env-file .env.production up -d --build

echo "==> Waiting for API health..."
deadline=$((SECONDS + 660))
until curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1 \
  || curl -fsS "http://${DOMAIN}/api/health" >/dev/null 2>&1 \
  || curl -fsS "http://127.0.0.1/api/health" >/dev/null 2>&1; do
  if (( SECONDS > deadline )); then
    echo "Timed out waiting for health. Check: docker compose --env-file .env.production logs api" >&2
    exit 1
  fi
  sleep 5
done

echo "Stack is up. Open https://${DOMAIN}/"
echo "Admin: ${SEED_ADMIN_EMAIL:-see .env.production}"
echo "Logs: docker compose --env-file .env.production logs -f api"
