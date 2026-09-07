# LiveStream API — Node 20 + static ffmpeg + better-sqlite3 prebuilds
# No apt-get (works behind Fake-IP proxies that break deb.debian.org).
# Build context: monorepo root

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# Prefer prebuilt native binaries (no python/make/g++).
ENV npm_config_build_from_source=false
RUN npm ci -w server

COPY server ./server
RUN npm run build -w server

FROM mwader/static-ffmpeg:7.1 AS ffmpeg

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
  PORT=4000 \
  HOST=0.0.0.0 \
  FFMPEG_PATH=/usr/local/bin/ffmpeg \
  FFPROBE_PATH=/usr/local/bin/ffprobe \
  DATABASE_PATH=/data/livestream.db \
  MEDIA_ROOT=/media \
  UPLOADS_DIR=/media/uploads \
  HLS_DIR=/media/hls \
  REPO_ROOT=/app \
  npm_config_build_from_source=false

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci -w server --omit=dev \
  && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY server/docker-entrypoint.sh /app/server/docker-entrypoint.sh
COPY media/posters /opt/seed-posters

RUN sed -i 's/\r$//' /app/server/docker-entrypoint.sh \
  && chmod +x /app/server/docker-entrypoint.sh \
  && mkdir -p /data /media/uploads /media/hls /media/posters \
  && ffmpeg -version \
  && ffprobe -version

EXPOSE 4000

# Node fetch healthcheck — no curl/apt required
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
