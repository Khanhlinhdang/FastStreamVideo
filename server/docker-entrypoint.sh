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

echo "[entrypoint] starting API..."
exec "$@"
