# LiveStream — Features

Tài liệu tính năng dựa trên plan LiveStream local và những gì đã implement trong repo.  
UI tiếng Việt; thương hiệu **LiveStream** (bố cục lấy cảm hứng từ trang mẫu, nội dung demo hợp pháp).

## Browse / discovery

| Tính năng | Route web | API |
|---|---|---|
| Trang chủ | `/` | `GET /api/home` — hot, mới cập nhật, ranking, schedule hôm nay, continue-watching (nếu đã login) |
| Lịch chiếu | `/lich-chieu` | `GET /api/schedule?weekday=` |
| Mới cập nhật | `/moi-cap-nhat` | Danh sách series theo `updatedAt` (`GET /api/series` / home.latest) |
| Bảng xếp hạng | `/top` | `GET /api/ranking` |
| Đã hoàn thành | `/hoan-thanh` | `GET /api/completed` |
| Thể loại | `/the-loai/:slug` | `GET /api/genres`, lọc series theo genre |
| Tìm kiếm | `/tim-kiem` | `GET /api/search?q=` |
| Chi tiết phim | `/phim/:slug` | `GET /api/series/:slug`, episodes |

UI: hero hot, poster grid, badge tập / chất lượng / audio, tabs lịch theo weekday, ranking list.

### Preview taxonomy (4 miền — không gộp component)

| Kind | UI | Mô tả |
|---|---|---|
| `hoverCatalog` | Poster hover → `HoverPreviewCard` + `MutedPreviewPlayer` | Xem trước muted HLS/trailer |
| `seekScrub` | `HlsPlayer` seek bar | Sprite `thumbs.vtt` khi tua |
| `adminFile` | Admin Series / Episodes | Object-URL ảnh/video trước upload |
| `adminImport` | Admin Episodes bulk | Bảng metadata trước import hàng loạt |

Nguồn type: `web/src/lib/preview/kinds.ts`.

## Watch (phát video)

| Tính năng | Chi tiết |
|---|---|
| Trang xem | `/xem/:slug/:ep` |
| Player | `HlsPlayer` — **hls.js** (ABR), Safari native HLS fallback |
| Chất lượng | Selector **Tự động / 480p / 720p / 1080p…** từ HLS levels (hls.js + Safari native variant swap); lưu `localStorage` |
| Start quality | Auto ưu tiên ~720p+; mạng `2g`/`3g`/saveData → `abrMaxBitrate` + height `autoLevelCapping` (manual vẫn chọn cao hơn được) |
| Buffer ABR | `maxBufferLength=60` / `maxMaxBufferLength=120`; fatal → `recoverMediaError` / `startLoad` |
| Phụ đề | Upload VTT/SRT admin → `<track>` + toggle Tiếng Việt |
| Multi-audio | Encode đa track / gắn audio phụ → selector **Âm thanh** (hls.js) |
| Equalizer | Panel **Equalizer** 10-band (Web Audio + spectrum) — Rạp chiếu / Bass / Thoại / Custom, Q, preamp; `localStorage`; xem [`docs/AUDIO_EQUALIZER.md`](./docs/AUDIO_EQUALIZER.md) |
| Player chrome | Phím Space/J/K/F/←/→, Theater, PiP |
| Thumbnail scrub | Seek bar custom + **seek scrub preview** từ `thumbs.vtt` / sprite (`scrubPreview` trong `HlsPlayer`) |
| Nguồn phát | Ưu tiên `episode.playbackUrl` (R2 absolute khi `hlsStorage=r2`; optional signed `SIGNED_MEDIA` chỉ local — giữ `0` với CF cache); fallback `/media/hls/<id>/master.m3u8` |
| Resume | `startPosition` từ history; LWW `clientUpdatedAt`; offline-friendly flush |
| Prefetch tập sau | Khi còn <60s cuối (trừ saveData / mạng chậm): prefetch `master.m3u8` tập kế |
| Rebuffer telemetry | `POST /api/playback/events` → admin QoE dashboard |
| Lượt xem | `POST /api/episodes/:id/view` — **dedupe 24h** theo cookie `livestream_vid` |
| Trạng thái encode | Hiển thị nếu tập chưa `ready` |

## Auth & thư viện cá nhân

| Tính năng | Route / API |
|---|---|
| Đăng ký / đăng nhập | `/dang-ky`, `/dang-nhap` — `POST /api/auth/register\|login` |
| Logout / refresh | `POST /api/auth/logout`, `/api/auth/refresh` |
| Session | Access JWT ngắn hạn + cookie httpOnly `refreshToken` |
| Hồ sơ | `GET/PATCH /api/me` — đổi displayName / avatarUrl |
| Yêu thích | `/yeu-thich` — `GET/POST/DELETE /api/me/favorites` |
| Lịch sử xem | `/lich-su` — `GET/PUT /api/me/history` (last-write-wins) |
| Continue watching | Block trên Home khi đã đăng nhập — lọc `positionSec` > 5 và < 95% `durationSec` (nếu có) |
| Auth harden | Rate-limit login/register; Helmet headers; production JWT default refuse |

## Comments

- List: `GET /api/episodes/:episodeId/comments` (ẩn `hiddenAt`)
- Tạo (auth, rate-limit): `POST /api/episodes/:episodeId/comments`
- Sửa / xóa (owner): `PUT/DELETE /api/comments/:id`
- Báo cáo: `POST /api/comments/:id/report`
- Admin ẩn: `POST /api/admin/comments/:id/hide`
- UI trên trang Watch (`Comments`)

## Admin Control Panel + upload encode

| UI | Chức năng |
|---|---|
| `/admin` | Tổng quan + encode gần đây (**Retry/Xóa**), QoE; disk/purge **admin only** |
| `/admin/series` | CRUD + **admin file preview** (poster ảnh / video phim lẻ) trước upload |
| `/admin/episodes` | Upload/replace; **bulk import preview** (metadata); file preview đơn; phụ đề VTT/SRT + audio phụ UI |
| `/admin/comments` | Duyệt bình luận gắn cờ (ẩn / bỏ ẩn / xóa) |
| `/admin/schedule` | CRUD lịch chiếu |
| `/admin/genres` | CRUD thể loại |

RBAC: `editor` = nội dung; `admin` = + disk/purge. Seed: `editor@livestream.local` / `editor123`.

API thêm: chunked upload; phụ đề; audio tracks; jobs retry/clear/purge; Docker e2e CI (`.github/workflows/docker-e2e.yml`).

Metrics: ranking/hot theo **viewCount** thật (hot không còn “ảo” vì `isHot` alone); rating 1–5; telemetry + **admin QoE**.

Chi tiết ops: [`docs/ADMIN.md`](./docs/ADMIN.md).  
Audit upgrade results: [`docs/AUDIT_UPGRADE_TEST_RESULTS.md`](./docs/AUDIT_UPGRADE_TEST_RESULTS.md).

## Media pipeline

1. Upload admin (hoặc `demo:encode`) → file nguồn  
2. Job queue in-process hoặc **worker** (`ENCODE_IN_PROCESS=0`)  
3. ffmpeg: ladder ABR **CRF + maxrate** (480/720/1080; cap bằng `MAX_ENCODE_HEIGHT`); optional `ENABLE_AV1_LADDER=1`  
4. HLS VOD, **fMP4**, **`-hls_time 5`**, `master.m3u8`  
5. Optional **R2 publish** (`R2_PUBLISH_MODE=hot|all`) → `hlsStorage=r2`, `playbackUrl` absolute  
6. Serve: Caddy `/media/hls/*` file_server (prod) / Fastify static (dev) — `.m4s` immutable; `.m3u8` ngắn  
7. Client ABR + manual quality qua hls.js  

**statusEncode:** `none` | `queued` | `encoding` | `ready` | `failed`  
**hlsStorage:** `local` | `r2`  
**encode_jobs.status:** `queued` | `encoding` | `ready` | `failed` (+ `progress`, `error`)

Scaling: [`docs/SCALING_IMPLEMENTATION_PLAN.md`](./docs/SCALING_IMPLEMENTATION_PLAN.md) · results [`docs/SCALING_TEST_RESULTS.md`](./docs/SCALING_TEST_RESULTS.md).

## Tech stack

| Lớp | Công nghệ |
|---|---|
| Monorepo | npm workspaces (`server`, `web`) |
| API | Fastify 5, TypeScript, Zod, `@fastify/*` (cors, cookie, jwt, multipart, static, **helmet**, **rate-limit**) |
| DB | better-sqlite3 |
| Encode | ffmpeg / ffprobe; optional **worker** process / compose profile |
| Web | React 19, Vite 8, React Router 7, hls.js; **PWA shell** (manifest + SW, không cache HLS) |
| Deploy | Docker Compose + Caddy (`deploy/`); CI GitHub Actions build |

## Non-goals (không làm / ngoài phạm vi)

- **Không** scrape / copy phim từ site bản quyền khác  
- **Không** DRM, paywall VIP, Open Connect / VMAF Netflix-class  
- **Không** live RTMP  
- Multi-audio tracks còn **SKIP** trong audit upgrade (AUD-028)

## Liên kết

- Quick start: [`README.md`](./README.md)  
- Deploy: [`deploy.md`](./deploy.md)  
- Scaling: [`docs/SCALING_IMPLEMENTATION_PLAN.md`](./docs/SCALING_IMPLEMENTATION_PLAN.md) · [`docs/SCALING_TEST_RESULTS.md`](./docs/SCALING_TEST_RESULTS.md)  
- Cloudflare: [`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md)  
- Admin: [`docs/ADMIN.md`](./docs/ADMIN.md)  
- Audit plan: [`docs/AUDIT_UPGRADE_PLAN.md`](./docs/AUDIT_UPGRADE_PLAN.md)  
- Audit test results: [`docs/AUDIT_UPGRADE_TEST_RESULTS.md`](./docs/AUDIT_UPGRADE_TEST_RESULTS.md)  
- Project audit: [`docs/PROJECT_AUDIT.md`](./docs/PROJECT_AUDIT.md)
