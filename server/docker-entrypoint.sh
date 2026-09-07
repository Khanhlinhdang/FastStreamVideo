#!/bin/sh
set -eu

mkdir -p /media/posters /media/uploads /media/hls /data

# Named volume at /media starts empty — restore seed SVG posters once
if [ -d /opt/seed-posters ]; then
  for f in /opt/seed-posters/*; do
    [ -e "$f" ] || continue
    base=$(basename "$f")
    if [ ! -e "/media/posters/$base" ]; then
      cp -a "$f" "/media/posters/$base"
    fi
  done
fi

echo "[entrypoint] migrating SQLite schema..."
node dist/src/db/migrate.js

echo "[entrypoint] seeding if database is empty..."
node dist/src/db/seed-if-empty.js

# First-boot demo HLS so trial users can watch immediately after encode finishes.
# Set AUTO_DEMO_ENCODE=0 to skip (faster boot; upload your own videos).
if [ "${AUTO_DEMO_ENCODE:-1}" = "1" ]; then
  echo "[entrypoint] ensuring demo HLS (AUTO_DEMO_ENCODE=1)..."
  if node dist/scripts/bootstrap-demo-hls.js; then
    echo "[entrypoint] demo HLS bootstrap finished"
  else
    echo "[entrypoint] WARNING: demo HLS bootstrap failed — catalog still usable; upload via Admin"
  fi
fi

echo "[entrypoint] starting API..."
exec "$@"
