#!/usr/bin/env bash
# Build a short dual-audio fixture for AUD-028 testing.
# Requires ffmpeg on PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/media/uploads/dual-audio-fixture.mp4}"
mkdir -p "$(dirname "$OUT")"

# 8s color bars + sine (L) + triangle (R as 2nd audio stream)
ffmpeg -y \
  -f lavfi -i "color=c=blue:s=1280x720:d=8" \
  -f lavfi -i "sine=frequency=440:duration=8" \
  -f lavfi -i "sine=frequency=880:duration=8" \
  -map 0:v -map 1:a -map 2:a \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k \
  -metadata:s:a:0 language=vie -metadata:s:a:0 title="Tieng Viet" \
  -metadata:s:a:1 language=eng -metadata:s:a:1 title="English" \
  -shortest "$OUT"

echo "Wrote $OUT"
ffprobe -v error -select_streams a -show_entries stream=index:stream_tags=language,title -of json "$OUT"
