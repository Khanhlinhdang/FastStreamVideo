# LiveStream API — Node 20 + system ffmpeg + better-sqlite3
# Build context: monorepo root

FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci -w server

COPY server ./server

RUN npm run build -w server

# ——— runtime ———
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
  PORT=4000 \
  HOST=0.0.0.0 \
  FFMPEG_PATH=ffmpeg \
  FFPROBE_PATH=ffprobe \
  DATABASE_PATH=/data/livestream.db \
  MEDIA_ROOT=/media \
  UPLOADS_DIR=/media/uploads \
  HLS_DIR=/media/hls \
  REPO_ROOT=/app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci -w server --omit=dev \
  && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY server/docker-entrypoint.sh /app/server/docker-entrypoint.sh
COPY media/posters /opt/seed-posters

RUN chmod +x /app/server/docker-entrypoint.sh \
  && mkdir -p /data /media/uploads /media/hls /media/posters

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

WORKDIR /app/server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
