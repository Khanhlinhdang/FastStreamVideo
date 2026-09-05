# LiveStream — Project Audit toàn diện

**Ngày audit:** 2026-09-05  
**Phạm vi:** codebase hiện tại (`server/`, `web/`, `docs/`, README, scripts) — đối chiếu tài liệu với implementation.  
**Không** bao gồm thay đổi product code trong vòng audit này.

**Nguồn xác minh chính:** `server/src/app.ts`, `routes/*`, `services/encodeQueue.ts`, `db/schema.ts`, `web/src/App.tsx`, `HlsPlayer.tsx`, `Watch.tsx`, admin pages, `features.md`, `EVALUATION.md`, `UPGRADE_TEST_RESULTS.md`, `deploy.md`, `ADMIN.md`.

---

## 1. Tổng quan stack / kiến trúc

### Vai trò sản phẩm

**LiveStream** là nền tảng **VOD local/self-host** (phim/anime demo hợp pháp): browse catalog → xem HLS ABR → tài khoản cá nhân (yêu thích / lịch sử) → admin upload & encode.  
Thương hiệu UI tiếng Việt; catalog seed là metadata giả + video mở (Blender). **Không** live realtime, DRM, paywall, scrape bản quyền.

### Stack đã xác minh

| Lớp | Công nghệ |
|---|---|
| Monorepo | npm workspaces (`server`, `web`), Node **≥20** |
| API | Fastify 5, TypeScript, Zod, `@fastify/*` (cors, cookie, jwt, multipart, static) |
| DB | better-sqlite3 — file `data/livestream.db` |
| Auth | Access JWT (Bearer) + refresh cookie httpOnly; bcrypt; role `user` / `admin` |
| Encode | ffmpeg/ffprobe (PATH hoặc npm installer); queue **in-process** tuần tự |
| Media | HLS VOD fMP4, segment ~5s, master ABR; static `/media/` |
| Web | React 19, Vite 8, React Router 7, hls.js |
| Ops | Script root `dev` / `start:local`; docs deploy Caddy/nginx — **không** Docker sẵn |

### Kiến trúc luồng chính

```text
[Web React :5173] ──proxy──► [Fastify API :4000]
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
               SQLite DB    encode queue   /media static
                    │            │            │
                    │            ▼            ▼
                    │         ffmpeg     media/hls/<epId>/
                    │         CRF+maxrate   master.m3u8 + variants
                    │            │
                    └────────────┴──► HlsPlayer (hls.js ABR + MSE)
```

**Ingest:** Admin multipart upload → `media/uploads/` → `encode_jobs` → worker cập nhật `statusEncode` → `hlsPath`.  
**Playback:** Client ưu tiên `episode.playbackUrl` / `/media/hls/<id>/master.m3u8`.  
**Discovery:** Home (hot/latest/ranking/schedule/continue), search, genre, completed.

### Giới hạn kiến trúc (by design / hiện trạng)

- Single-process API + encode chung process → encode nặng sẽ chặn throughput API khi CPU full.
- SQLite + filesystem local → phù hợp 1 máy / LAN / self-host nhỏ; không multi-region.
- Media công khai qua `/media` (CORS theo `CORS_ORIGIN`) — chưa signed URL / DRM.
- Repo không kèm container/orchestration; production dựa reverse proxy thủ công (`deploy.md`).

---

## 2. Liệt kê toàn bộ tính năng hiện có

Thang trạng thái:

- **Hoạt động** — có UI + API (hoặc pipeline) và đã được dùng/kiểm trong repo.
- **Một phần** — có skeleton / thiếu mảnh quan trọng / UX hoặc độ tin cậy hạn chế.
- **Yếu** — có dấu hiệu / telemetry / env nhưng chưa đủ để coi là feature sản phẩm.

### 2.1 Browse / discovery

| Tính năng | Status | Evidence |
|---|---|---|
| Trang chủ (hero hot, latest, ranking, schedule hôm nay) | **Hoạt động** | `Home.tsx`, `GET /api/home` |
| Continue watching (login) | **Hoạt động** | Home + filter `positionSec > 5` và `< 95% duration` |
| Lịch chiếu theo weekday | **Hoạt động** | `/lich-chieu`, `GET /api/schedule` |
| Mới cập nhật | **Hoạt động** | `/moi-cap-nhat` theo `updatedAt` |
| Bảng xếp hạng theo view thật | **Hoạt động** | `/top`, `GET /api/ranking` order `viewCount` |
| Đã hoàn thành | **Hoạt động** | `/hoan-thanh`, `status=completed` |
| Thể loại | **Hoạt động** | `/the-loai/:slug`, genres API |
| Tìm kiếm | **Hoạt động** | `/tim-kiem`, `GET /api/search` |
| Chi tiết series + danh sách tập | **Hoạt động** | `/phim/:slug` |
| Badge chất lượng / audio / tập / status | **Hoạt động** | `PosterCard`, episode badges |
| Hot flag độc lập view | **Một phần** | `isHot` seed có thể =1 dù `viewCount=0` → hero “ảo” |

### 2.2 Watch / playback

| Tính năng | Status | Evidence |
|---|---|---|
| Trang xem `/xem/:slug/:ep` | **Hoạt động** | `Watch.tsx` |
| HLS ABR (hls.js) + Safari native fallback | **Hoạt động** | `HlsPlayer.tsx` |
| Selector chất lượng Auto + levels, lưu localStorage | **Hoạt động** | key `livestream.hls.quality` |
| Start level theo mạng (slow-2g/saveData → thấp; else ~720p+) | **Hoạt động** | `pickStartLevel` |
| Buffer reservoir 60/120 + ABR EWMA conservative | **Hoạt động** | hls.js config; test PASS |
| Fatal recover (`recoverMediaError` / `startLoad`) | **Hoạt động** | `Hls.Events.ERROR` |
| Resume từ watch history | **Hoạt động** | `startPosition`; flush pause/pagehide |
| Prefetch master tập sau (&lt;60s, bỏ qua mạng chậm) | **Hoạt động** | `Watch.tsx` |
| Đếm view khi bắt đầu phát (dedupe tab) | **Hoạt động** | `POST .../view` + `sessionStorage` |
| Hiển thị trạng thái encode nếu chưa ready | **Hoạt động** | Watch / SeriesDetail |
| Rebuffer/error telemetry | **Một phần** | Ghi `playback_events` + rate limit IP; **chưa** dashboard admin/analytics |
| Quality selector trên Safari native HLS | **Yếu** | Native path không expose levels như hls.js |
| Phụ đề / multi-audio / thumbnail scrub / PiP / theater | **Yếu** | Không có trong code |

### 2.3 Auth & thư viện cá nhân

| Tính năng | Status | Evidence |
|---|---|---|
| Đăng ký / đăng nhập / logout | **Hoạt động** | `/dang-ky`, `/dang-nhap`, auth routes |
| Refresh token cookie + access JWT | **Hoạt động** | `auth/index.ts`, client auto-refresh |
| Hồ sơ `GET /api/me` | **Hoạt động** | |
| Yêu thích CRUD | **Hoạt động** | `/yeu-thich` |
| Lịch sử xem | **Hoạt động** | `/lich-su`, `PUT /api/me/history` |
| Avatar / profile edit | **Yếu** | Cột `avatarUrl` có; UI chưa quản lý |
| Sync đa thiết bị sâu (conflict, offline queue) | **Yếu** | Chỉ REST history đơn giản |

### 2.4 Comments & ratings

| Tính năng | Status | Evidence |
|---|---|---|
| List / tạo / sửa / xóa comment (owner) | **Hoạt động** | `comments.ts`, `Comments.tsx` |
| Rating 1–5 / user / series + avg trên chi tiết | **Hoạt động** | bảng `ratings`, SeriesDetail |
| Moderation / report / spam filter | **Yếu** | Không có |

### 2.5 Admin Control Panel

| Tính năng | Status | Evidence |
|---|---|---|
| Guard role admin + layout VI | **Hoạt động** | `AdminLayout`, `requireAdmin` |
| Dashboard stats + recent jobs | **Hoạt động** | `/admin`, `GET /api/admin/stats` |
| Series CRUD (synopsis, poster URL/upload, genres, country, year, status, quality/audio, Hot, schedule weekdays) | **Hoạt động** | `AdminSeries` |
| Soft-delete series/episodes/schedule | **Hoạt động** | `deletedAt` |
| Episodes tạo + upload/replace → full ABR encode + poll | **Hoạt động** | `AdminEpisodes`, upload route |
| Genres / schedule CRUD | **Hoạt động** | admin pages + API |
| Tìm/lọc series & episodes | **Hoạt động** | query `q` / status / country / seriesId |
| Progress encode realtime mịn | **Một phần** | UI bar có; worker chỉ nhảy ~5% → (85%) → 100% |
| Retry / clear job failed từ UI | **Yếu** | Stats đếm failed; không action retry |
| Bulk import / drag-drop queue lớn / poster crop preview | **Yếu** | Form tối giản |

### 2.6 Media / encode pipeline

| Tính năng | Status | Evidence |
|---|---|---|
| Queue in-process + resume `queued`/`encoding` khi boot | **Hoạt động** | `EncodeQueue.resumePending` |
| Full ladder admin: 480/720/1080 (+1440/2160 nếu nguồn cao) | **Hoạt động** | `selectLadderForTitle`; test ep40 |
| CRF + maxrate + heuristic per-title nhẹ | **Hoạt động** | `crfBiasForTitle`; smoke PASS |
| HLS fMP4 ~5s + Windows init/master recovery | **Hoạt động** | `placeFmp4InitFiles`, `ensureMasterPlaylist` |
| Cache-Control: segment immutable 1y; m3u8 60s | **Hoạt động** | `app.ts` setHeaders; test PASS |
| Demo encode fast 480p / `DEMO_FULL=1` | **Hoạt động** | `encode-demo.ts` |
| Optional VP9/AV1 rung (`ENABLE_AV1_LADDER`) | **Một phần** | Code + test VP9 PASS; mặc định off; AV1 chậm/harmful trên bundled Windows ffmpeg |
| Worker tách process / GPU / Redis queue | **Yếu** | Không có |
| Resumable upload (tus/S3) | **Yếu** | Multipart tối đa 2GB một phát |

### 2.7 Metrics & health

| Tính năng | Status | Evidence |
|---|---|---|
| `GET /api/health` | **Hoạt động** | |
| ViewCount series/episode thật | **Hoạt động** | catalog view endpoint |
| Ranking/search/hot ưu tiên views | **Hoạt động** | catalog queries |
| Unique viewer / 24h window | **Yếu** | Dedup chỉ theo tab session |
| Analytics suite (bitrate switch, QoE dashboard) | **Yếu** | Chỉ insert raw `playback_events` |

### 2.8 DevOps / docs / scripts

| Tính năng | Status | Evidence |
|---|---|---|
| Migrate / seed / reset / demo encode | **Hoạt động** | npm scripts |
| `dev` song song API+Web | **Hoạt động** | `scripts/dev.mjs` |
| Deploy guide Caddy/nginx + security checklist | **Hoạt động** | `deploy.md` |
| Docker / CI / monitoring sẵn | **Yếu** | Không có trong repo |

---

## 3. Đánh giá toàn diện

### 3.1 UX người xem

**Điểm mạnh:** Luồng browse → chi tiết → xem rõ ràng, tiếng Việt nhất quán; hero + poster grid đủ dùng; continue watching và resume đã có; quality selector + trạng thái encode giảm “tập chết im”.

**Điểm yếu:** Player vẫn controls native HTML5 (chưa theater/keyboard/PiP tùy biến); thiếu phụ đề và preview seek; hero phụ thuộc `isHot` có thể lệch popularity thật; Safari quality UX kém hơn Chrome; không PWA/offline.

**Verdict UX:** Khá tốt cho **demo / LAN / self-host nhỏ**; chưa ngang “site streaming hiện đại” về polish player.

### 3.2 Phát sóng / mạng yếu

**Đã làm đúng hướng:** ABR multi-rung, buffer lớn, ABR estimate conservative, start thấp trên 2g/saveData, recover fatal, prefetch có guard, cache segment dài.

**Còn thiếu:** Cap bitrate động theo `navigator.connection` sâu hơn; không CDN; encode demo mặc định có thể chỉ 480p (gây hiểu nhầm chất lượng sản phẩm); telemetry rebuffer chưa phản hồi lại vào ABR policy; không multi-CDN failover.

**Verdict mạng:** **Đủ dùng LAN/Wi‑Fi ổn**; trên 3G/throttled còn phụ thuộc ladder nguồn và chưa có edge cache.

### 3.3 Admin / vận hành nội dung

CRUD catalog + upload encode full ladder là **trục sản phẩm mạnh nhất** hiện tại. Dashboard có counts và recent jobs.  

Thiếu: retry failed, progress ffmpeg theo thời gian, bulk ingest, dọn job cũ, preview poster, quota disk, thông báo encode xong (webhook/email). Encode tuần tự trên cùng process API là rủi ro vận hành khi catalog lớn.

### 3.4 Bảo mật

| Hạng mục | Đánh giá |
|---|---|
| Password hashing (bcrypt), refresh hash SHA-256, httpOnly cookie | Tốt cho local |
| Role gate admin | Có |
| Zod validation nhiều route | Có |
| Rate limit | Chỉ `playback/events` (in-memory); **thiếu** login/register/upload |
| Helmet / CSRF / security headers | Không thấy |
| Media `/media` public nếu biết URL | Không auth per-segment |
| Secrets mặc định `.env.example` / seed `admin123` | Nguy hiểm nếu deploy quên đổi |
| Access token trong `localStorage` | XSS → token steal risk điển hình SPA |

**Verdict bảo mật:** Chấp nhận được **dev/local**; **chưa sẵn** internet công khai không harden.

### 3.5 Scale

- Concurrent viewers: bottleneck ở disk/CPU origin + SQLite read (ổn vài–vài chục viewer nếu proxy cache HLS).
- Concurrent encodes: **1** (queue tuần tự).
- Catalog lớn: SQLite OK đến hàng nghìn series nếu index giữ; HLS disk tăng tuyến tính theo rung × duration.
- Horizontal scale: **không** (stateful encode + local files + SQLite).

### 3.6 Chất lượng code / kiến trúc

- Tách route / auth / encode / mappers rõ; TypeScript end-to-end; Zod ở biên.
- Windows ffmpeg quirks được xử lý có chủ đích (init/master recovery) — mature cho môi trường mục tiêu.
- Encode progress và telemetry còn “stub-grade”.
- Tài liệu phong phú (`EVALUATION`, upgrade plans, Netflix feasibility) — một số file feasibility **lỗi thời** so với CRF/buffer/cache đã ship (không chặn runtime).
- Ít automated test suite (smoke scripts + tài liệu PASS thủ công); không CI.

### 3.7 Khoảng cách sản phẩm

So với kỳ vọng “site xem phim mượt mỗi ngày”:

| Đã gần | Còn xa |
|---|---|
| Catalog + admin ingest + ABR VOD cơ bản | Player hiện đại (sub/thumb/PiP) |
| Auth + library cá nhân | Social/moderation/paywall |
| Metrics views/ratings thật | QoE analytics vận hành |
| Deploy guide self-host | HA, CDN, multi-worker encode |

**Khoảng cách tổng:** ~**MVP+ local streaming** vững; còn ~1–2 quý nhỏ-team để thành “daily driver” polish; không nhắm Netflix-class (đúng non-goals).

---

## 4. Đề xuất cải thiện cái đã có

| # | Gì | Cách làm | Lợi ích | Ưu tiên | Effort |
|---|---|---|---|---|---|
| 1 | Progress encode mịn | Parse `time=` từ ffmpeg stderr (hoặc `-progress pipe:1`) → cập nhật `encode_jobs.progress` | Admin biết ETA, giảm “treo 5%” | **P0** | S |
| 2 | Retry / clear job failed | API `POST /admin/jobs/:id/retry` + nút UI; optional delete old failed | Phục hồi upload lỗi không recreate episode | **P0** | S |
| 3 | Re-encode / chuẩn hóa demo HLS full ladder | Chạy `DEMO_FULL=1` hoặc `reencode-episode` cho ep seed; doc rõ trong README | Tránh demo 480p-only gây cảm giác sản phẩm yếu | **P0** | S |
| 4 | Hot ranking nhất quán | Hero = top `viewCount` **hoặc** `isHot AND views>0`; seed `isHot` theo rule | Discovery phản ánh popularity thật | **P0** | S |
| 5 | Harden auth/deploy defaults | Rate limit login; checklist bắt buộc đổi JWT/seed; optional rotate refresh | Giảm rủi ro deploy nhầm | **P0** | M |
| 6 | Unique view window | Dedup `(viewerKey, episodeId)` 24h (cookie/device id) | Ranking ít bị spam refresh | **P1** | S–M |
| 7 | ABR yếu mạng sâu hơn | Cap `abrMaxBitrate` theo `effectiveType`; giảm prefetch aggressive | Ít stall trên 3G | **P1** | S |
| 8 | Admin poster preview + UX form | Preview blob URL sau chọn file; validate kích thước | Ingest nhanh, ít lỗi poster | **P1** | S |
| 9 | Dashboard playback_events | Bảng admin: rebuffer count / avg ms theo episode | Vận hành QoE không cần log thô | **P1** | M |
| 10 | Tách encode worker | Process/worker riêng hoặc job runner ngoài Fastify | API không chết khi encode 1080 | **P2** | L |
| 11 | Serve HLS qua proxy disk + CDN optional | Đã có recipe — áp dụng production thật | Giảm load Node | **P2** | M |
| 12 | Multi-codec ladder ổn định | Giữ VP9 optional; tránh libaom mặc định; test Safari fallback | Tiết kiệm bandwidth khi bật | **P2** | M |

*Effort: S ≤1–2 ngày · M ~3–5 ngày · L ≥1–2 tuần (1 dev).*

---

## 5. Tính năng cần bổ sung

| # | Gì | Cách | Lợi ích | Ưu tiên | Effort |
|---|---|---|---|---|---|
| 1 | Phụ đề VTT/SRT | Upload admin gắn episode; hls.js `subtitleDisplay` / `<track>` | Khả dụng nội dung SUB thật | **P0** | M |
| 2 | Thumbnail scrub / sprite | ffmpeg sprite + VTT thumbnails trên player | Seek UX hiện đại | **P1** | M |
| 3 | Resumable upload | tus hoặc chunked PUT + ghép file | Upload file lớn ổn định WAN | **P1** | L |
| 4 | Keyboard shortcuts + theater + PiP | Wrapper player tùy biến quanh `<video>` | Xem lâu đỡ mệt | **P1** | M |
| 5 | Comment moderation | Flag/hide admin; rate limit post | Catalog công khai an toàn hơn | **P1** | M |
| 6 | Encode webhook / notify | Hook URL hoặc toast polling mạnh khi ready | Admin multi-tab | **P2** | S |
| 7 | PWA nhẹ (install + cache shell) | Vite PWA plugin; không cache HLS nặng | Mobile home-screen | **P2** | M |
| 8 | Docker Compose + health | Image Node+ffmpeg, volumes data/media | Onboard/deploy nhanh | **P2** | M |
| 9 | RBAC chi tiết (editor vs admin) | Role mới + gate route | Team nội dung | **P2** | M |
| 10 | Signed media URLs (optional) | Token ngắn hạn cho `/media/hls/...` | Hạn chế hotlink | **P2** | M–L |

*Ngoài phạm vi có chủ đích (không đề xuất làm sớm): DRM, paywall, live RTMP, scrape catalog, Open Connect/ML ABR Netflix.*

---

## 6. Lộ trình 30 / 60 / 90 ngày

### Ngày 0–30 — “Dùng mỗi ngày ổn định” (P0)

- Encode progress + retry failed job + dọn demo full ladder.
- Hero/hot & view dedup cơ bản; harden login rate-limit + secrets checklist.
- Bắt đầu **phụ đề VTT** end-to-end (upload → phát).
- Giữ regression: health, admin upload → 3 levels, player Auto/480/720/1080.

**Kết quả mong đợi:** Admin tin queue; viewer LAN có ABR thật và sub tối thiểu.

### Ngày 31–60 — “UX streaming” (P1)

- Thumbnail scrub; theater/keyboard/PiP; ABR cap mạng yếu.
- Resumable upload cho file lớn; poster preview admin.
- Unique views 24h + dashboard rebuffer nhẹ; moderation comment tối giản.

**Kết quả mong đợi:** Cảm giác xem gần site thương mại nhỏ; ingest WAN đỡ đau.

### Ngày 61–90 — “Vận hành & scale nhẹ” (P2)

- Tách encode worker; Docker Compose; proxy serve HLS + optional CDN.
- PWA shell; signed URL optional; RBAC editor.
- Chỉ bật VP9 ladder khi có máy encode đủ mạnh và đã đo disk/time.

**Kết quả mong đợi:** Self-host production-like cho nhóm nhỏ; vẫn **không** đổi non-goals Netflix-scale.

---

## 7. Kết luận ngắn

LiveStream hiện là **MVP+ VOD self-host vững**: Fastify + SQLite + ffmpeg HLS ABR + React/hls.js + admin upload full ladder đã chạy và được kiểm local. Điểm mạnh nằm ở **ingest → encode → ABR playback** và catalog/auth cơ bản. Điểm yếu nằm ở **polish player (sub/thumb), vận hành encode (progress/retry/worker), bảo mật internet-facing, và analytics**. Với lộ trình 30/60/90 tập trung P0 vận hành + phụ đề rồi mới CDN/worker, dự án có thể trở thành nền tảng xem nội dung riêng đáng dùng hàng ngày — **không** cần (và không nên) đuổi parity Netflix.

---

## Kế hoạch nâng cấp từ audit

Kế hoạch thực thi chi tiết (mỗi hạng mục missing/partial/weak + P0–P2 + tính năng bổ sung, có acceptance criteria, test gate, phụ thuộc, phase 30/60/90) nằm ở **[`AUDIT_UPGRADE_PLAN.md`](./AUDIT_UPGRADE_PLAN.md)** — tài liệu đó không thay nội dung audit này; dùng để triển khai theo thứ tự dependency-aware và tương thích Docker/Supabase env đang làm song song.

---

## Phụ lục — Liên kết

> **Scorecard mới (2026-09-06):** đánh giá có điểm số + P0/P1 + lộ trình 30/60/90 theo mục tiêu admin/metadata/playback — xem [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md). Một số mục trong audit bên dưới (Docker, phụ đề/PiP/theater, worker) có thể **đã cũ hơn code hiện tại**; ưu tiên scorecard khi chấm điểm.

| Tài liệu | Vai trò |
|---|---|
| [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md) | Feature catalog + điểm /10 + đề xuất nâng cấp (VI) |
| [`AUDIT_UPGRADE_PLAN.md`](./AUDIT_UPGRADE_PLAN.md) | Kế hoạch nâng cấp chi tiết từ audit (AUD-xxx) |
| [`../features.md`](../features.md) | Inventory tính năng |
| [`EVALUATION.md`](./EVALUATION.md) | Đánh giá vòng cải thiện gần nhất |
| [`ADMIN.md`](./ADMIN.md) | Credentials & pipeline admin |
| [`UPGRADE_TEST_RESULTS.md`](./UPGRADE_TEST_RESULTS.md) | Gate test ABR/cache/CRF/VP9 |
| [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md) | Plan kỹ thuật ABR/CDN/encode |
| [`UPGRADE_PLAN_WORTH_IT.md`](./UPGRADE_PLAN_WORTH_IT.md) | ROI từng hạng mục |
| [`NETFLIX_FEASIBILITY.md`](./NETFLIX_FEASIBILITY.md) | Đối chiếu Netflix (một số baseline có thể cũ hơn code hiện tại) |
| [`../deploy.md`](../deploy.md) | Deploy / proxy |
| [`../README.md`](../README.md) | Quick start |
