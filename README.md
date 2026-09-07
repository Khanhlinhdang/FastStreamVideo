# LiveStream

Nền tảng xem phim/anime **local** — thương hiệu **LiveStream**.  
API Fastify + SQLite + ffmpeg HLS, frontend React (Vite + hls.js).

> Catalog demo là metadata giả + video mở (Blender). **Không** scrape nội dung bản quyền từ site khác.

## Screenshots

### Trang chủ — catalog & discovery

![Trang chủ LiveStream](docs/screenshots/01-home.jpg)

### Chi tiết phim — metadata, tập, cùng thể loại

![Chi tiết series](docs/screenshots/02-series-detail.jpg)

### Player HLS — chất lượng ABR, Theater, PiP, Equalizer

![Trang xem phim](docs/screenshots/03-watch-player.jpg)

### Tìm kiếm — lọc thể loại, loại, năm, quốc gia, trạng thái

![Tìm kiếm](docs/screenshots/04-search.jpg)

### Bảng xếp hạng

![Bảng xếp hạng](docs/screenshots/05-ranking.jpg)

### Lịch chiếu theo ngày trong tuần

![Lịch chiếu](docs/screenshots/06-schedule.jpg)

### Đăng nhập / tài khoản

![Đăng nhập](docs/screenshots/07-login.jpg)

### Admin — tổng quan encode, disk, QoE

![Admin dashboard](docs/screenshots/08-admin.jpg)

### Admin — quản lý series / catalog CMS

![Admin series](docs/screenshots/09-admin-series.jpg)

Chi tiết tính năng: [`features.md`](./features.md).

## Tài liệu

| File | Nội dung |
|---|---|
| [`features.md`](./features.md) | Toàn bộ tính năng đã xây |
| [`deploy.md`](./deploy.md) | **Production (Docker)** + VPS / Cloudflare / Supabase |
| [`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md) | DNS, SSL Full (strict), cache HLS |
| [`docs/SUPABASE.md`](./docs/SUPABASE.md) | Storage posters (optional) + Postgres roadmap |
| [`docs/ADMIN.md`](./docs/ADMIN.md) | Tài khoản seed, route admin, pipeline upload→encode |
| [`docs/PROJECT_AUDIT.md`](./docs/PROJECT_AUDIT.md) | Audit toàn diện (tính năng, P0–P2, lộ trình 30/60/90) |
| [`web/README.md`](./web/README.md) | Ghi chú frontend ngắn |

## Stack

- **Server:** Node 20+, Fastify 5, better-sqlite3, JWT + refresh cookie, multipart upload, encode queue (ffmpeg)
- **Web:** React 19, Vite 8, React Router, hls.js (ABR)
- **Media:** HLS VOD (fMP4, segment ~5s), ABR ladder 480p → 1080p (+1440/2160 nếu nguồn đủ cao)
- **DB / files:** SQLite (`data/livestream.db`), media dưới `media/` (uploads + hls)

## Architecture (HLS / ABR)

```text
Upload / demo source
        │
        ▼
   encode queue (ffmpeg)
        │  ladder H.264+AAC → HLS fMP4 ~5s
        ▼
  media/hls/<episodeId>/master.m3u8
        │
        ▼
  GET /media/...  →  HlsPlayer (hls.js)  →  ABR + MSE
```

Player ưu tiên `episode.playbackUrl` từ API (thường `/media/hls/<id>/master.m3u8`).

## Requirements

- Node.js **20+**, npm **10+**
- **ffmpeg** / **ffprobe** — thứ tự resolve: biến `.env` → `PATH` hệ thống → package npm `@ffmpeg-installer` / `@ffprobe-installer`

## Quick start (Windows PowerShell)

```powershell
cd C:\Users\ATK\Desktop\StreamSqueeze
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm install
npm run db:migrate
npm run db:seed
npm run demo:encode   # một lần — tạo HLS demo dưới media/hls/
npm run dev           # API :4000 + Web :5173
```

Hai terminal riêng:

```powershell
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173 (proxy /api + /media → :4000)
```

Chỉ bootstrap API (migrate → seed → API, **không** encode demo):

```powershell
npm run start:local
```

| Surface | URL |
|---|---|
| Web UI | http://localhost:5173 |
| API health | http://localhost:4000/api/health |
| Static media | http://localhost:4000/media/... |

## Production (Docker)

VPS + custom domain: see **[`deploy.md`](./deploy.md)** (`docker compose up`), plus [`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md) and optional [`docs/SUPABASE.md`](./docs/SUPABASE.md).

```bash
cp .env.production.example .env.production
# edit DOMAIN, JWT_*, SEED_ADMIN_*, CORS_ORIGIN
docker compose --env-file .env.production up -d --build
```

Day-1: SQLite + media volumes behind Caddy. Supabase keys optional (poster Storage only until Phase B Postgres).

## Demo HLS

`npm run demo:encode` tải sample open-movie (fallback `test-video.mp4` nếu CDN chặn), encode HLS, đánh dấu tập seed **ready**.

- Mặc định **fast mode** (480p, ~45s đầu) — chỉ để bootstrap nhanh; **không** dùng để đánh giá chất lượng sản phẩm.
- Full ladder (khuyến nghị khi demo xem chất lượng): `$env:DEMO_FULL=1; npm run demo:encode` → master có **480/720/1080**.
- Kiểm tra ladder mỏng: `node scripts/ensure-demo-ladder.mjs`
- Encode dùng **CRF + maxrate** (không còn CBR cứng); ladder cap theo chiều cao nguồn + heuristic bitrate nhẹ (`selectLadderForTitle`).

Sau khi encode thành công (ID tập seed ổn định):

| Series | Tập | Playback |
|---|---|---|
| Neon Harbor Chronicles | Ep 1 | `/media/hls/1/master.m3u8` |
| Skyforge Academy | Ep 1 | `/media/hls/5/master.m3u8` |

Kiểm tra: `GET /api/series/neon-harbor-chronicles` → `episodes[0].statusEncode === "ready"`.

## Tài khoản & admin

Seed credentials và quy trình upload/encode nằm trong **[`docs/ADMIN.md`](./docs/ADMIN.md)** (mật khẩu mặc định chỉ dùng local/dev — đổi trước khi deploy thật).

## Scripts (repo root)

| Command | Mô tả |
|---|---|
| `npm run dev` | API + Web cùng lúc |
| `npm run dev:server` | API hot reload (`tsx watch`) |
| `npm run dev:web` | Vite web `:5173` |
| `npm run db:migrate` | Áp schema SQLite |
| `npm run db:seed` | Seed genres / series / users |
| `npm run db:reset` | Xóa DB + seed lại |
| `npm run demo:encode` | Tải + encode open movies |
| `npm run start:local` | migrate → seed → API |
| `npm run build` | Build server + web |
| `npm run start` | Chạy API đã build (`server/dist`) |

## Env

Xem [`.env.example`](./.env.example). Các key chính: `PORT`, `DATABASE_PATH`, `MEDIA_ROOT`, `JWT_*`, `CORS_ORIGIN`, `FFMPEG_PATH`, `FFPROBE_PATH`, `SEED_ADMIN_*`.

## Layout

```text
StreamSqueeze/
  server/     # Fastify + TypeScript + SQLite + encode queue
  web/        # React UI (Vite + hls.js)
  media/      # uploads + hls (gitignored)
  data/       # SQLite (gitignored)
  scripts/    # dev / start-local helpers
  docs/       # ADMIN và ops
```

## API (tóm tắt)

**Public:** `GET /api/home`, `/api/series`, `/api/series/:slug`, `/api/series/:slug/episodes`, `/api/genres`, `/api/search`, `/api/schedule`, `/api/ranking`, `/api/completed`, `/api/episodes/:id/comments`

**Auth:** `POST /api/auth/register|login|logout|refresh`, `GET /api/me`, favorites + history dưới `/api/me/*`

**Admin** (Bearer access JWT, role `admin`): CRUD `/api/admin/series|episodes|genres|schedule`, `POST /api/admin/episodes/:id/upload`, `GET /api/admin/jobs/:id`

Auth: access JWT ngắn hạn + cookie httpOnly `refreshToken`.
