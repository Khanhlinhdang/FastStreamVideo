# LiveStream — Deploy

Hướng dẫn **production Docker Compose** trên VPS để người dùng thật mở `https://DOMAIN` và xem thử HLS.  
Local dev vẫn dùng `npm run dev` (xem [`README.md`](./README.md)).

## Kiến trúc

```text
Internet → Cloudflare (optional) → Caddy :443
                                      ├─ /api/*           → api:4000
                                      ├─ /media/hls/*     → file_server (/srv/hls)
                                      ├─ /media/*         → api:4000
                                      └─ /*               → web:80 (nginx SPA)

api:  volumes /data (SQLite) + /media (uploads, hls, posters)
boot: migrate → seed-if-empty → AUTO_DEMO_ENCODE (optional) → Fastify
```

First boot với `AUTO_DEMO_ENCODE=1` (mặc định): tải sample mở + encode **2 tập** demo (vài phút). Catalog seed chỉ gồm series có video demo — không còn “phim ma” không phát được.

## Prerequisites

| | |
|---|---|
| VPS | Ubuntu 22.04+, IPv4, ≥2 vCPU / 4 GB RAM khuyến nghị, **≥20 GB** disk |
| Docker | Engine + Compose plugin |
| Domain | A/AAAA → VPS (hoặc Cloudflare) |
| Ports | 80 + 443 |

## 1) Cài Docker (Ubuntu)

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
# đăng xuất / đăng nhập lại
docker compose version
```

## 2) Cấu hình `.env.production`

```bash
git clone <your-repo-url> LiveStream
cd LiveStream
cp .env.production.example .env.production
nano .env.production
```

Bắt buộc:

```env
DOMAIN=livestream.example.com
CORS_ORIGIN=https://livestream.example.com
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true
TRUST_PROXY=true
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<mật khẩu mạnh>
AUTO_DEMO_ENCODE=1
```

API **từ chối** boot production nếu JWT vẫn là secret local `change-me-access-secret-dev-only`.

## 3) Start trên VPS

```bash
chmod +x scripts/vps-bootstrap.sh
./scripts/vps-bootstrap.sh
# hoặc:
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f api
```

Lần đầu có thể mất **3–10 phút** (download + encode demo). Healthcheck `start_period` = 600s.

### Kiểm tra

```bash
curl -fsS https://DOMAIN/api/health
# {"ok":true,...}

# Smoke đầy đủ (trên máy trỏ được tới DOMAIN):
BASE_URL=https://DOMAIN ADMIN_EMAIL=... ADMIN_PASSWORD=... WAIT_HLS_SEC=120 \
  bash scripts/ci-docker-smoke.sh
```

Checklist dùng thử:

- [ ] Home `https://DOMAIN/` load
- [ ] Login admin (`SEED_ADMIN_*`)
- [ ] `/xem/neon-harbor-chronicles/1` phát được (sau demo encode)
- [ ] Admin → Wizard tạo series + upload
- [ ] Refresh cookie vẫn login (HTTPS + `COOKIE_SECURE=true`)

## 4) Smoke Docker trên máy local (không cần domain)

```bash
cp .env.production.example .env.production
```

Sửa tối thiểu:

```env
DOMAIN=localhost
CORS_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
SEED_ADMIN_EMAIL=admin@livestream.local
SEED_ADMIN_PASSWORD=local-docker-admin-change-me
AUTO_DEMO_ENCODE=1
```

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d --build

# Linux / Git Bash:
ADMIN_PASSWORD='local-docker-admin-change-me' WAIT_HLS_SEC=600 \
  BASE_URL=http://127.0.0.1:8080 bash scripts/ci-docker-smoke.sh

# Windows PowerShell:
.\scripts\docker-smoke.ps1 -AdminPassword 'local-docker-admin-change-me' -WaitHlsSec 600
```

Mở http://localhost:8080

Dừng:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production down
# xóa volumes (reset DB/media):
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production down -v
```

### CI overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.ci.yml --env-file .env.ci up -d --build
BASE_URL=http://127.0.0.1:8080 bash scripts/ci-docker-smoke.sh
```

CI mặc định `AUTO_DEMO_ENCODE=0` (smoke nhanh). Workflow: [`.github/workflows/docker-e2e.yml`](./.github/workflows/docker-e2e.yml).

## 5) Cloudflare (optional)

1. DNS A/AAAA → VPS (proxied).
2. SSL **Full (strict)** — [`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md).
3. Cache segments `/media/hls/*`; bypass `/api`.
4. Giữ `SIGNED_MEDIA=0` khi dùng cache CDN.

## 6) Encode worker / R2 (optional)

| Mục tiêu | Cách |
|---|---|
| Tách encode khỏi API | `ENCODE_IN_PROCESS=0` + `docker compose --profile worker --env-file .env.production up -d` |
| Cap ladder | `MAX_ENCODE_HEIGHT=720` |
| HLS lên R2 | `R2_*` + `R2_PUBLISH_MODE=hot\|all` — [`docs/SCALING_IMPLEMENTATION_PLAN.md`](./docs/SCALING_IMPLEMENTATION_PLAN.md) |

Chi tiết off-peak: [`docs/ENCODE_OFFPEAK.md`](./docs/ENCODE_OFFPEAK.md).

## Persistence & backup

| Data | Volume |
|---|---|
| SQLite | `livestream_data` → `/data/livestream.db` |
| Media | `livestream_media` → `/media` |
| Caddy certs | `caddy_data` |

```bash
docker run --rm -v livestream_data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/livestream-data.tgz -C / data
```

## Security

- [ ] JWT + admin password mạnh, không commit `.env.production`
- [ ] `CORS_ORIGIN` = đúng origin HTTPS
- [ ] Không publish port `4000` ra ngoài
- [ ] Theo dõi dung lượng `media/hls`

## Files

| Path | Role |
|---|---|
| `docker-compose.yml` | Production: api + web + Caddy (+ worker profile) |
| `docker-compose.local.yml` | HTTP :8080 smoke local |
| `docker-compose.ci.yml` | CI overlay |
| `server/Dockerfile` | API + ffmpeg + entrypoint |
| `web/Dockerfile` | Vite → nginx |
| `deploy/Caddyfile` | TLS production |
| `deploy/Caddyfile.ci` | HTTP-only |
| `scripts/vps-bootstrap.sh` | One-shot VPS |
| `scripts/ci-docker-smoke.sh` / `docker-smoke.ps1` | Verify stack |
| `.env.production.example` | Template secrets |

## Local vs production

| | `npm run dev` | Docker |
|---|---|---|
| Web | Vite :5173 | nginx → Caddy |
| API | tsx watch | `node dist` + system ffmpeg |
| Demo HLS | `npm run demo:encode` | `AUTO_DEMO_ENCODE=1` |
| Cookie | `COOKIE_SECURE=false` | `true` (HTTPS) |

## Liên kết

- README: [`README.md`](./README.md)
- Admin: [`docs/ADMIN.md`](./docs/ADMIN.md)
- Features: [`features.md`](./features.md)
- Kết quả verify gần nhất: [`docs/DEPLOY_TEST_RESULTS.md`](./docs/DEPLOY_TEST_RESULTS.md)
