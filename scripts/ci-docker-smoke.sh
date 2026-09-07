#!/usr/bin/env bash
# Full Docker smoke: health, home, login, catalog, HLS (when ready).
# Default BASE_URL=http://127.0.0.1:8080 (compose.ci / compose.local).
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@livestream.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ci-admin-pass-change-me}"
WAIT_HLS_SEC="${WAIT_HLS_SEC:-0}"

echo "==> Smoke against ${BASE_URL}"

echo "-- health"
curl -fsS "${BASE_URL}/api/health" | tee /tmp/livestream-health.json
echo
grep -Eqi '"ok"\s*:\s*true' /tmp/livestream-health.json || {
  echo "health payload unexpected" >&2
  cat /tmp/livestream-health.json >&2
  exit 1
}

echo "-- GET /"
code_home=$(curl -sS -o /tmp/livestream-home.html -w '%{http_code}' "${BASE_URL}/")
echo "GET / -> ${code_home}"
test "${code_home}" = "200"

echo "-- GET /api/home"
code_api=$(curl -sS -o /tmp/livestream-home-api.json -w '%{http_code}' "${BASE_URL}/api/home")
echo "GET /api/home -> ${code_api}"
test "${code_api}" = "200"

echo "-- poster"
code_media=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}/media/posters/neon-harbor.svg" || true)
echo "GET /media/posters/neon-harbor.svg -> ${code_media}"
if [[ "${code_media}" =~ ^5 ]]; then
  echo "media returned 5xx" >&2
  exit 1
fi

echo "-- login"
login_body=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")
echo "${login_body}" | tee /tmp/livestream-login.json >/dev/null
TOKEN=$(echo "${login_body}" | sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
test -n "${TOKEN}" || { echo "no accessToken" >&2; exit 1; }

echo "-- admin series"
code_admin=$(curl -sS -o /tmp/livestream-admin-series.json -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/api/admin/series")
echo "GET /api/admin/series -> ${code_admin}"
test "${code_admin}" = "200"

if [[ "${WAIT_HLS_SEC}" != "0" ]]; then
  echo "-- wait up to ${WAIT_HLS_SEC}s for ready HLS"
  deadline=$((SECONDS + WAIT_HLS_SEC))
  ready=0
  while (( SECONDS < deadline )); do
    eps=$(curl -fsS "${BASE_URL}/api/series/neon-harbor-chronicles/episodes" || true)
    if echo "${eps}" | grep -Eq '"statusEncode"[[:space:]]*:[[:space:]]*"ready"'; then
      ready=1
      break
    fi
    sleep 5
  done
  test "${ready}" = "1" || { echo "HLS not ready in time" >&2; exit 1; }
  master=$(curl -sS -o /tmp/livestream-master.m3u8 -w '%{http_code}' \
    "${BASE_URL}/media/hls/1/master.m3u8")
  echo "GET /media/hls/1/master.m3u8 -> ${master}"
  test "${master}" = "200"
  grep -q 'EXTM3U' /tmp/livestream-master.m3u8
fi

echo "OK docker smoke passed"
