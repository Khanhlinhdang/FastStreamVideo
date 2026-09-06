# LiveStream — Deploy

Production guide for the monorepo: **Docker Compose** (API + web + Caddy) on a VPS, optional **Cloudflare** and **Supabase**.

Local development stays `npm run dev` + SQLite (unchanged).

## Architecture (day-1 default)

```text
Internet → Cloudflare (optional) → Caddy :443
                                      ├─ /api/*           → api:4000  (Fastify)
                                      ├─ /media/hls/*     → file_server  (volume livestream_media → /srv/hls)
                                      ├─ /media/*         → api:4000  (posters, subs, uploads)
                                      └─ /*               → web:80    (nginx static SPA)

api volumes:  /data  (SQLite)  +  /media  (uploads + hls + posters)
proxy volume: livestream_media → /srv:ro  (HLS bypass Node — AUD-019 / SCL-001)
```

- **SQLite + local media** — works without Supabase/R2.
- **Supabase Storage** — optional posters when keys are set ([`docs/SUPABASE.md`](./docs/SUPABASE.md)).
- **HLS** stays on the VPS disk by default; optional **R2 publish** for hot/all titles ([`docs/SCALING_IMPLEMENTATION_PLAN.md`](./docs/SCALING_IMPLEMENTATION_PLAN.md)).
- **Segments** (`.m4s` / `init*.mp4`) are served by **Caddy `file_server`**, not Fastify — long `Cache-Control: immutable`.

## Prerequisites

| Component | Notes |
|---|---|
| VPS | Ubuntu 22.04+ recommended, public IPv4, **20+ GB** disk if you encode ABR |
| Docker Engine + Compose plugin | Install steps below |
| Domain | DNS A/AAAA → VPS (or via Cloudflare) |
| Ports | 80 + 443 open |

## Environment

| File | Use |
|---|---|
| [`.env.example`](./.env.example) | Local `npm run dev` |
| [`.env.production.example`](./.env.production.example) | Copy → `.env.production` for Compose |

**Required production secrets:** `DOMAIN`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SEED_ADMIN_*` (first boot only).

API refuses to boot in `NODE_ENV=production` if JWT secrets are still the **exact** local defaults (`change-me-access-secret-dev-only` / `change-me-refresh-secret-dev-only`). Login/register are rate-limited (~20 / 15 min per IP). Helmet security headers are enabled (CSP left loose for SPA+HLS). Prefer `TRUST_PROXY=true` and `COOKIE_SECURE=true` behind HTTPS. Do **not** set public `CORS_ORIGIN` to `http://localhost:*`.

Generate secrets:

```bash
openssl rand -hex 32
```

## 1) Build & run Compose locally (smoke)

```bash
cp .env.production.example .env.production
# For local Docker without a real domain:
#   DOMAIN=localhost
#   CORS_ORIGIN=http://localhost
#   COOKIE_SECURE=false
#   JWT_* and SEED_ADMIN_PASSWORD still change from defaults

docker compose --env-file .env.production config   # validate YAML + interpolation
docker compose --env-file .env.production up -d --build
curl -sS http://localhost/api/health
```

Open http://localhost/ — UI from Caddy; API under `/api`.

Stop: `docker compose --env-file .env.production down`

## 2) VPS (Ubuntu) — install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
# log out/in so group applies
docker version
docker compose version
```

## 3) Clone, configure, start

```bash
git clone <your-repo-url> LiveStream
cd LiveStream

cp .env.production.example .env.production
nano .env.production
```

Set at least:

```env
DOMAIN=livestream.example.com
CORS_ORIGIN=https://livestream.example.com
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
TRUST_PROXY=true
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<strong password>
```

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f api
```

Entrypoint on `api`: migrate SQLite → **seed only if `users` is empty** → start Fastify. Image includes system **ffmpeg**.

### Useful commands

```bash
# Rebuild after git pull
docker compose --env-file .env.production up -d --build

# Shell into API
docker compose --env-file .env.production exec api sh

# Follow encode / API logs
docker compose --env-file .env.production logs -f api
```

## 4) Domain + Cloudflare

1. Point DNS A/AAAA to the VPS (orange-cloud if using Cloudflare).
2. Follow **[`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md)** — SSL **Full (strict)**, cache `/media/hls` segments, bypass `/api`.
3. Caddy obtains Let's Encrypt certs for `DOMAIN` (or use Cloudflare Origin Certificate).
4. Keep **`SIGNED_MEDIA=0`** when using Cloudflare cache (signed query strings break HIT).

Without Cloudflare: set DNS A record at your registrar straight to the VPS; Caddy still terminates TLS.

### Optional: encode worker + R2

| Goal | Env / command |
|---|---|
| Off-peak encode on same VPS | `ENCODE_IN_PROCESS=0` + `docker compose --profile worker up -d` — [`docs/ENCODE_OFFPEAK.md`](./docs/ENCODE_OFFPEAK.md) |
| Cap ladder height | `MAX_ENCODE_HEIGHT=720` (no 1080 rung) |
| Publish HLS to R2 | Set `R2_*` + `R2_PUBLISH_MODE=hot` or `all` — see below |
| Metrics gate | [`docs/SCALING_METRICS.md`](./docs/SCALING_METRICS.md) |

#### Enable Cloudflare R2 in production

1. Create an R2 bucket + API token (Object Read & Write).
2. Optional: custom domain `media.$DOMAIN` on the bucket (public read).
3. `.env.production`:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=livestream-hls
R2_PUBLIC_BASE_URL=https://media.livestream.example.com
R2_PUBLISH_MODE=hot
# Phase 2 default for all new encodes:
# R2_PUBLISH_MODE=all
```

4. Restart `api` (and `worker` if used). Boot log `integrations.r2: true`.
5. Mark series **hot** (admin) for `hot` mode, or use `all`. After encode, `playbackUrl` becomes absolute R2 URL; local `/media/hls` remains fallback until cleanup.

## 5) Supabase (optional)

Day-1 works with **zero** Supabase keys.

To store admin posters in Supabase Storage: **[`docs/SUPABASE.md`](./docs/SUPABASE.md)**.

Postgres (`DATABASE_URL`) is **Phase B** — documented only; SQLite remains the live DB.

## 6) Verify checklist

- [ ] `curl -fsS https://DOMAIN/api/health` → `"ok": true`
- [ ] Home page loads at `https://DOMAIN/`
- [ ] Admin login with `SEED_ADMIN_*` (only if DB was empty on first start)
- [ ] Upload episode → encode finishes → `statusEncode: ready`
- [ ] Watch page plays HLS (`/media/hls/<id>/master.m3u8` or R2 `playbackUrl`)
- [ ] Refresh login still works (HTTPS + `COOKIE_SECURE=true`)
- [ ] Segment via Caddy: long `Cache-Control` immutable; playlist: `max-age≈60`
- [ ] Segment GETs do **not** appear in `docker compose logs api` (HLS bypass)
- [ ] Cloudflare (if used): SSL Full (strict); `/api` bypass; segment 2nd request `CF-Cache-Status: HIT`

## Persistence & backup

| Data | Compose volume / path |
|---|---|
| SQLite | volume `livestream_data` → `/data/livestream.db` |
| Media | volume `livestream_media` → `/media` (uploads, hls, posters) |
| Caddy certs | volume `caddy_data` |

Backup volumes periodically (e.g. `docker run --rm -v livestream_data:/data -v $(pwd):/backup alpine tar czf /backup/data.tgz /data`).

## Security checklist

- [ ] Strong unique `JWT_*` and admin password
- [ ] `CORS_ORIGIN` = exact HTTPS origin
- [ ] Do not publish host port `4000` (only Caddy 80/443)
- [ ] Never commit `.env.production`
- [ ] Disk quota / monitoring for `media/hls`
- [ ] Optional: Cloudflare WAF ([`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md))

## Non-Docker fallback

If you prefer bare metal: build with `npm run build`, run `npm run start` (API), serve `web/dist` behind Caddy/nginx. Older proxy snippets remain valid conceptually; prefer Compose for new hosts.

Example Caddy on host (API already on localhost:4000):

```caddyfile
livestream.example.com {
  encode gzip
  handle /api/* { reverse_proxy 127.0.0.1:4000 }
  handle_path /media/hls/* {
    root * /opt/livestream/media/hls
    header Cache-Control "public, max-age=60"
    @segments path *.m4s *.mp4
    header @segments Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
  handle /media/* { reverse_proxy 127.0.0.1:4000 }
  handle {
    root * /opt/livestream/web/dist
    try_files {path} /index.html
    file_server
  }
}
```

## Local vs production

| | Local (`npm run dev`) | Docker production |
|---|---|---|
| Web | Vite `:5173` proxy | nginx static via Caddy |
| API | `tsx watch` | `node dist/src/index.js` + ffmpeg package |
| DB | `./data/livestream.db` | volume `/data` |
| CORS | `http://localhost:5173` | `https://DOMAIN` |
| Cookie | `COOKIE_SECURE=false` | `true` |
| Posters | local `/media/posters` | local volume **or** Supabase Storage |

## Files in this repo

| Path | Role |
|---|---|
| `docker-compose.yml` | `api` + `web` + `proxy` (Caddy); optional `--profile worker` |
| `server/Dockerfile` | Node API + ffmpeg |
| `web/Dockerfile` | Vite build + nginx |
| `deploy/Caddyfile` | TLS + routing + HLS `file_server` |
| `.env.production.example` | Secrets template (`R2_*`, `ENCODE_IN_PROCESS`, …) |
| `docs/CLOUDFLARE.md` | DNS / SSL / cache |
| `docs/SUPABASE.md` | Storage + Postgres roadmap |
| `docs/ENCODE_OFFPEAK.md` | Peak vs encode schedule |
| `docs/SCALING_METRICS.md` | Phase 0 metrics gate |
| `docs/WORKER_VM.md` | Optional encode VM |
| `docs/SCALING_IMPLEMENTATION_PLAN.md` | SCL checklist |

## Liên kết

- Quick start: [`README.md`](./README.md)
- Admin: [`docs/ADMIN.md`](./docs/ADMIN.md)
- Features: [`features.md`](./features.md)
