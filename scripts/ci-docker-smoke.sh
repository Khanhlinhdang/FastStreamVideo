#!/usr/bin/env bash
# Docker Compose smoke for CI / local Linux (or Docker Desktop).
# Expects stack already up on BASE_URL (default http://127.0.0.1:8080).
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Smoke against ${BASE_URL}"

curl -fsS "${BASE_URL}/api/health" | tee /tmp/livestream-health.json
echo
grep -qi 'ok\|true\|status' /tmp/livestream-health.json || {
  echo "health payload unexpected" >&2
  cat /tmp/livestream-health.json >&2
  exit 1
}

code_home=$(curl -sS -o /tmp/livestream-home.html -w '%{http_code}' "${BASE_URL}/")
echo "GET / -> ${code_home}"
test "${code_home}" = "200"

# Media or API catalog smoke
code_api=$(curl -sS -o /tmp/livestream-home-api.json -w '%{http_code}' "${BASE_URL}/api/home")
echo "GET /api/home -> ${code_api}"
test "${code_api}" = "200"

# Optional: media path (may 404 if no HLS yet — only fail hard on 5xx)
code_media=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}/media/posters/neon-harbor.svg" || true)
echo "GET /media/posters/neon-harbor.svg -> ${code_media}"
if [[ "${code_media}" =~ ^5 ]]; then
  echo "media returned 5xx" >&2
  exit 1
fi

echo "OK docker smoke passed"
echo "Compose files: ${ROOT}/docker-compose.yml + docker-compose.ci.yml"
