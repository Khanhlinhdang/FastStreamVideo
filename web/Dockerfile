# LiveStream web — multi-stage Vite build + nginx static
# Build context: monorepo root

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci -w web

COPY web ./web

# Same-origin via Caddy: browser calls /api and /media on the public domain
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build -w web

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
