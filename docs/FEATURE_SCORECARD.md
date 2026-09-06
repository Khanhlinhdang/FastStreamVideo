# LiveStream — Feature Scorecard

**Ngày đánh giá:** 2026-09-06  
**Phạm vi:** Xác minh trong code (`server/`, `web/`, Docker Compose, admin/player/catalog) — ưu tiên implementation hơn tài liệu cũ.  
**Không** thay đổi product code trong vòng này.

**Mục tiêu user (trọng số cao):**
1. Admin dễ: thêm/sửa/xóa video, series, tập — UI hiện đại, trực quan  
2. Metadata đủ phong phú khi tạo/sửa để user tìm & hiểu nội dung  
3. Quản lý rõ **phim lẻ** và **series/tập**  
4. UX end-user thân thiện, hiện đại  
5. File lớn / độ phân giải cao phát **mượt** (ABR, CDN/R2, buffer, encode)

---

## Thang điểm (rubric)

| Điểm | Ý nghĩa |
|---|---|
| **10** | Production-polished: đủ dùng vận hành thật, UX mượt, edge cases ổn |
| **7–8** | Usable: có UI + API, dùng được hàng ngày; còn thiếu polish hoặc mảnh nhỏ |
| **4–6** | Partial / awkward: có skeleton hoặc nửa đường; UX/độ tin cậy hạn chế |
| **1–3** | Missing / broken: không có, hoặc có API nhưng không dùng được trong sản phẩm |

---

## 1. Catalog toàn bộ tính năng

### 1.1 Khám phá (Discover)

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Trang chủ (hero, hot, latest, ranking, lịch hôm nay) | Hoạt động | **8** | `Home.tsx` + `GET /api/home`; hero = series có view thật |
| Continue watching | Hoạt động | **8** | Lọc `positionSec` > 5 và &lt; 95% duration |
| Lịch chiếu theo weekday | Hoạt động | **8** | `/lich-chieu`, tabs weekday |
| Mới cập nhật / Top / Hoàn thành | Hoạt động | **8** | Routes riêng + sort view / `updatedAt` / `status` |
| Thể loại | Hoạt động | **7** | `/the-loai/:slug`; chưa facet kết hợp trên 1 trang browse |
| Tìm kiếm text | Usable | **6** | LIKE `title`/`synopsis`/`country`; UI chỉ 1 ô, không facet |
| Lọc year / country / genre (API) | Partial | **5** | `GET /api/series` hỗ trợ; Search UI chưa expose đủ |
| Badge chất lượng / audio / tập / Hot | Hoạt động | **7** | `PosterCard`, `EpisodeBadge` |
| Hover preview (muted HLS) | Usable | **7** | Netflix-style expand + `MutedPreviewPlayer`; cần pointer fine |
| Chi tiết series + list tập | Hoạt động | **8** | Rating, fav, synopsis, country, year |
| Phân biệt **phim lẻ** vs series | Missing | **2** | Schema chỉ `series` + `episodes`; không `contentType` / movie IA |

### 1.2 Xem / Player

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Trang xem `/xem/:slug/:ep` | Hoạt động | **8** | Prev/next, encode status, comments |
| HLS ABR (hls.js) + Safari fallback | Hoạt động | **8** | Levels Auto + manual; Safari native hạn chế hơn |
| Start level / cap theo mạng | Hoạt động | **8** | saveData / 2g–3g → bitrate & height cap |
| Buffer reservoir 60/120 | Hoạt động | **8** | Cấu hình hls.js conservative |
| Fatal recover | Hoạt động | **8** | `recoverMediaError` / `startLoad` |
| Resume watch history | Hoạt động | **8** | `startPosition` + flush pause/pagehide |
| Prefetch master tập sau | Usable | **7** | &lt;60s cuối; bỏ qua mạng chậm |
| Phụ đề VTT/SRT | Usable | **7** | Admin upload → `<track>` + toggle |
| Multi-audio | Usable | **7** | Encode đa track / audio phụ + selector |
| Thumbnail scrub (`thumbs.vtt`) | Usable | **7** | Encode sinh sprite; seek bar preview |
| Theater / PiP / phím tắt | Usable | **7** | Space/J/K/F/←/→ |
| Equalizer 10-band | Usable | **7** | Web Audio; preset; `localStorage` |
| Telemetry rebuffer/error | Partial | **6** | Ghi DB + QoE admin 24h; chưa analytics sâu |
| View count | Usable | **6** | Cookie/session dedupe; chưa unique viewer 24h chuẩn |
| Trailer / cold start poster video | Missing | **2** | Không trailer metadata; hover dùng tập ready mới nhất |

### 1.3 User (tài khoản & thư viện)

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Đăng ký / đăng nhập / logout | Hoạt động | **8** | JWT + refresh httpOnly; rate-limit |
| Yêu thích | Hoạt động | **8** | `/yeu-thich` |
| Lịch sử xem | Hoạt động | **8** | LWW `PUT /api/me/history` |
| Rating 1–5 | Hoạt động | **7** | SeriesDetail; avg + user score |
| Comments CRUD | Hoạt động | **7** | Owner edit/delete; report |
| Hồ sơ / avatar UI | Weak | **3** | API `PATCH /api/me`; UI profile còn mỏng |
| Sync đa thiết bị sâu | Weak | **3** | REST history đơn giản |

### 1.4 Admin CMS

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Guard RBAC `admin` / `editor` | Hoạt động | **8** | Editor = nội dung; admin = disk/purge |
| Dashboard stats + recent jobs | Hoạt động | **8** | Counts, retry/clear failed |
| QoE 24h | Usable | **7** | `playback_events` aggregate |
| Disk usage / purge jobs | Usable | **7** | Admin-only |
| Series CRUD + poster upload/preview | Usable | **7** | Form rộng đủ field cơ bản; chưa wizard hiện đại |
| Metadata series: title, synopsis, year, country, genres, labels, Hot, schedule | Partial | **6** | Có year/country/genres; **thiếu** cast, tags, age rating, trailer, director |
| Episodes tạo + upload/replace + poll encode | Usable | **7** | Progress encode %; **không** % upload byte |
| Bulk multi-file → tạo tập | Usable | **6** | Parse số từ tên file; UX còn thô |
| Sửa metadata episode (UI) | Awkward | **4** | API `PUT` có; **AdminEpisodes không form edit** |
| Phụ đề / audio phụ quản lý | Usable | **7** | Panel “manage” trên tập |
| Soft-delete series/episodes/schedule | Hoạt động | **8** | `deletedAt` |
| Genres / schedule CRUD | Hoạt động | **8** | Trang riêng |
| Comment moderation (hide/unhide) | Usable | **7** | Flagged list |
| Chunked/resumable upload | Partial | **4** | API init/part/complete có; **web client chưa gọi** |
| Media library browser | Missing | **2** | Không browse uploads/HLS theo folder |
| Bulk edit metadata | Missing | **2** | Không multi-select / batch patch |
| IA phim lẻ vs series trong admin | Missing | **1** | Mọi thứ là “series + episodes” |

### 1.5 Media pipeline

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Encode queue + statusEncode | Hoạt động | **8** | `none/queued/encoding/ready/failed` |
| ABR ladder CRF+maxrate (480/720/1080+) | Hoạt động | **8** | Cap `MAX_ENCODE_HEIGHT`; per-title bias |
| HLS VOD fMP4 ~5s + master | Hoạt động | **8** | Recovery Windows init/master |
| Thumbnail sprite + multi-audio package | Usable | **7** | Sau encode chính |
| Optional VP9/AV1 rung | Partial | **5** | `ENABLE_AV1_LADDER`; mặc định off |
| Worker tách process | Usable | **7** | `ENCODE_IN_PROCESS=0` + `worker` / Compose profile |
| R2 publish HLS | Usable | **7** | `R2_PUBLISH_MODE=off\|hot\|all`; `hlsStorage` |
| Supabase posters | Partial | **5** | Optional env; fallback local |
| Signed media | Partial | **4** | `SIGNED_MEDIA`; mặc định off (CF cache-friendly) |
| GPU / Redis queue / multi-worker fair | Missing | **2** | Hàng đợi SQLite tuần tự |

### 1.6 Scale / Ops

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| Docker Compose (api + web + Caddy + worker) | Usable | **8** | Healthcheck; volume data/media |
| Caddy serve `/media/hls` bypass Node | Hoạt động | **8** | Giảm tải API khi xem |
| Cloudflare cache docs | Usable | **7** | Docs + Cache-Control segment |
| Scaling strategy / capacity docs | Usable | **7** | `SCALING_*`, `VPS_CAPACITY` |
| SQLite single-node | Partial | **5** | Đủ self-host nhỏ; không multi-API write |
| CI Docker e2e | Usable | **6** | `.github/workflows/docker-e2e.yml` |
| Monitoring / alerting production | Weak | **3** | Health + QoE thô; chưa Sentry/Prometheus wired mặc định |
| Postgres / multi-region | Missing | **2** | Stub `DATABASE_URL` chưa dùng |

### 1.7 UX extras

| Tính năng | Hiện trạng ngắn | Điểm /10 | Ghi chú |
|---|---|---|---|
| UI tiếng Việt nhất quán | Hoạt động | **8** | Nav, admin, empty states |
| Empty / loading skeletons | Usable | **7** | `EmptyState`, poster skeleton |
| PWA / offline catalog | Weak | **3** | `sw.js` tối thiểu nếu có; không offline VOD |
| Cá nhân hóa “Because you watched” | Missing | **2** | Không ML / related rows |
| Accessibility player sâu | Partial | **5** | Keyboard cơ bản; a11y chưa audit đầy đủ |

---

## 2. Điểm tổng hợp theo trụ cột

Trọng số gắn mục tiêu user (admin + metadata + IA nội dung + UX + playback).

| Trụ cột | Điểm /10 | Trọng số | Điểm có trọng số | Nhận xét |
|---|---|---|---|---|
| **Admin CMS & metadata** | **5.8** | 30% | 1.74 | CRUD đủ; UI form-style; thiếu metadata giàu & IA phim lẻ; upload chưa progress/chunked UI |
| **Discoverability (search/filter)** | **6.2** | 15% | 0.93 | Browse mạnh; search đơn giản; facet year/country/genre chưa đủ trên UI tìm kiếm |
| **Player & smooth high-res** | **7.6** | 25% | 1.90 | ABR + buffer + ladder + R2/worker/Docker mạnh nhất trong stack; CDN vẫn “cấu hình thêm” |
| **End-user UX** | **7.4** | 20% | 1.48 | Home/hover/watch hiện đại cho VOD self-host; thiếu trailer & movie IA |
| **Scale / reliability** | **6.5** | 10% | 0.65 | Compose + CF/R2 docs tốt; SQLite + encode peak vẫn bottleneck |

### Tổng hợp có trọng số

**Overall: 6.7 / 10**

| Band | Diễn giải |
|---|---|
| 6.7 | **Usable demo / self-host tốt** — xem & encode ổn; admin và catalog metadata **chưa đạt** mức CMS streaming hiện đại mà user mục tiêu yêu cầu |

---

## 3. Đề xuất nâng cấp (cải thiện cái đã có)

Ưu tiên P0 → P2. Focus: admin UX, metadata, playback mượt.

### P0 — làm ngay (impact cao / effort vừa)

| # | Gì | Cách | Lợi ích | Effort |
|---|---|---|---|---|
| P0-1 | **Upload UX: progress % + dùng chunked API** | Wire client `init → PUT parts → complete`; thanh progress byte; retry part lỗi | File lớn không “treo im”; ít fail timeout proxy | M |
| P0-2 | **Form sửa episode trong Admin** | UI gọi `adminUpdateEpisode` (title, number, labels, duration) + deep-link từ series | Đóng gap “API có / UI không”; admin đỡ xóa-tạo lại | S |
| P0-3 | **Luồng admin một màn “Series → Tập → Upload”** | Wizard / panel gắn: tạo series → danh sách tập inline → upload; bớt nhảy `/admin/series` ↔ `/episodes` | Mục tiêu “easy admin” #1 | M |
| P0-4 | **Search facets trên UI** | Expose filter `genre` / `year` / `country` / `status` đã có ở API series | User tìm & hiểu nội dung (#2) | S–M |
| P0-5 | **Playback peak: encode off-peak + R2/CF mặc định prod** | Compose `ENCODE_IN_PROCESS=0` + profile worker; `R2_PUBLISH_MODE=hot` hoặc CF cache rules | Giảm stutter khi nhiều viewer / admin encode (#5) | M (ops) |

### P1 — quý tới

| # | Gì | Cách | Lợi ích | Effort |
|---|---|---|---|---|
| P1-1 | Mở rộng form series: tags, cast (text/JSON), ageRating, duration tổng | Cột SQLite + form + hiển thị PosterCard/Detail | Metadata richer (#2) | M |
| P1-2 | Poster crop/preview + drag-drop zone hiện đại | Dropzone, preview lớn, validate | Admin cảm giác “CMS hiện đại” | M |
| P1-3 | Bulk edit (multi-select genres/status/country) | Checkbox rows + PATCH batch | Quản lý catalog lớn | M |
| P1-4 | Episode edit + re-order số tập an toàn | UI + unique constraint UX | Series dài đỡ đau | M |
| P1-5 | Tune ABR EWMA / ladder bitrate theo QoE 24h | Dùng `playback_events` → điều chỉnh `maxrate` / startLevel | Playback mượt hơn data-driven | M |
| P1-6 | View dedupe 24h cookie ổn định (đã có hướng) + dashboard QoE charts | Cookie + chart đơn giản | Metrics tin hơn | S–M |

### P2 — sau khi P0/P1 ổn

| # | Gì | Cách | Lợi ích | Effort |
|---|---|---|---|---|
| P2-1 | Profile user UI (avatar, displayName) | Trang `/toi` | Hoàn thiện trụ User | S |
| P2-2 | Related / “cùng thể loại” row | Query genre overlap | Discoverability | M |
| P2-3 | HEVC/AV1 dual-codec master có kiểm soát | Chỉ khi client hỗ trợ + fallback H.264 | Tiết kiệm bandwidth 4K | L |
| P2-4 | Postgres optional khi vượt SQLite | Phase B `DATABASE_URL` | Scale API | L |

---

## 4. Đề xuất bổ sung (tính năng mới)

Gắn mục tiêu user; đặc biệt IA phim lẻ / metadata / search / upload / watch polish.

| Ưu tiên | Tính năng mới | Gợi ý thiết kế | Lợi ích | Effort |
|---|---|---|---|---|
| **P0** | **Content type: `movie` vs `series`** | Cột `series.kind` hoặc bảng `titles`; movie = 1 “tập 1” ẩn; nav Admin “Phim lẻ” / “Series”; URL `/phim` vẫn dùng chung | Mục tiêu #3 — quản lý rõ film lẻ vs series | M–L |
| **P0** | **Schema metadata giàu** | `cast`, `director`, `tags[]`, `ageRating`, `runtimeSec`, `trailerUrl` / `trailerEpisodeId` | Tìm & hiểu nội dung (#2); hover/detail giàu hơn | M |
| **P1** | **Media library browser** | List `uploads/` + HLS dirs, gắn lại episode, xóa orphan | Admin ops thật (#1) | M |
| **P1** | **Faceted search page** | Sidebar: thể loại, năm, quốc gia, loại (lẻ/bộ), chất lượng | Discoverability | M |
| **P1** | **Upload queue UI** | Hàng đợi file, pause/cancel, ước thời gian encode | Upload lớn (#5 + #1) | M |
| **P1** | **Trailer riêng cho hover/hero** | Encode short clip hoặc gắn URL; không dùng full episode | UX Netflix-like (#4) | M |
| **P2** | **Season / multi-season** | `seasonNumber` trên episodes | Series dài | L |
| **P2** | **Watch party / share timestamp** | Deep link `?t=` | Social nhẹ | S–M |
| **P2** | **Collections / playlist admin** | Curated rows trên Home | Browse giàu | M |
| **P2** | **Auto-ingest folder watch** | Worker scan thư mục → tạo tập | Ops power-user | L |

---

## 5. Lộ trình 30 / 60 / 90 ngày

Gắn mục tiêu user đã nêu.

### Ngày 0–30 — “Admin dùng được + xem mượt hơn”

**Mục tiêu:** #1 easy admin (partial), #5 playback.

- P0-1 Upload progress + chunked client  
- P0-2 Episode edit UI  
- P0-3 Wizard Series→Episodes gọn  
- P0-5 Worker off-peak + R2/CF checklist prod  
- Smoke: upload 2–5 GB, encode 1080p, xem song song không stutter origin  

**KPI:** Admin tạo series + 5 tập &lt; 15 phút; rebuffer rate QoE giảm khi bật CDN/R2.

### Ngày 31–60 — “Catalog tìm được & IA nội dung”

**Mục tiêu:** #2 metadata, #3 film lẻ vs series, #4 UX.

- `kind=movie|series` + admin nav tách  
- Metadata: cast, tags, ageRating, runtime, trailer  
- Search facets UI  
- Hover/detail dùng trailer khi có  
- Bulk edit cơ bản  

**KPI:** User tìm theo năm/quốc gia/thể loại không cần đoán tên; phim lẻ không hiện “Tập 1” gây rối.

### Ngày 61–90 — “CMS & scale vững”

**Mục tiêu:** polish #1 + độ tin cậy #5.

- Media library browser  
- Upload queue + estimate encode  
- QoE charts + ladder tune  
- Related rows; profile UI  
- Đánh giá Postgres / multi-worker nếu traffic thật vượt SQLite  

**KPI:** Overall scorecard trụ Admin ≥ 7.5; Player giữ ≥ 8 với CDN; Overall ≥ 7.5.

---

## 6. Kết luận

LiveStream hiện là nền tảng VOD self-host **mạnh ở playback và browse** (HLS ABR, buffer, phụ đề/audio/EQ/thumb, hover preview, Docker/worker/R2) — khoảng **6.7/10** tổng thể khi cân theo mục tiêu của bạn. Điểm yếu quyết định nằm ở **Admin CMS & metadata** và **thiếu mô hình phim lẻ vs series**: CRUD series/tập đã dùng được nhưng còn form thô, thiếu progress upload trên UI, thiếu schema cast/tags/age/trailer, và mọi nội dung bị ép vào “series + episodes”. Ưu tiên 30 ngày nên là upload/chunked UX + sửa tập + wizard admin + bật R2/CF/worker; 60 ngày khóa IA movie/series và metadata giàu + search facets — đó là đường ngắn nhất để đạt “admin dễ, user tìm được, xem mượt”.

---

## Phụ lục — Nguồn xác minh code

| Khu vực | File chính |
|---|---|
| Schema | `server/src/db/schema.ts` |
| Admin API | `server/src/routes/admin.ts` |
| Catalog / search | `server/src/routes/catalog.ts` |
| Encode / R2 | `server/src/services/encodeQueue.ts`, `r2HlsPublish.ts` |
| Player | `web/src/components/HlsPlayer.tsx` |
| Admin UI | `web/src/pages/admin/*` |
| Hover | `web/src/components/PosterCard.tsx`, `HoverPreviewCard.tsx` |
| Ops | `docker-compose.yml`, `docs/SCALING_STRATEGY.md`, `docs/CLOUDFLARE.md` |

**Liên quan:** [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) (kiến trúc & inventory cũ hơn một phần — scorecard này cập nhật điểm theo code 2026-09-06).

### Đối thủ & kế hoạch cạnh tranh

- Phân tích WeFlix_v2 + Playing-FilmP2P vs LiveStream: [`COMPETITOR_FEATURE_ANALYSIS.md`](./COMPETITOR_FEATURE_ANALYSIS.md)  
- Kế hoạch nâng cấp cảm hứng đối thủ (COMP-001…019): [`COMPETITOR_UPGRADE_PLAN.md`](./COMPETITOR_UPGRADE_PLAN.md)

### Kế hoạch triển khai

Toàn bộ nâng cấp P0–P2 + tính năng mới trong scorecard này được chi tiết hóa (FEAT-001…026, phase, acceptance, test) tại [`FEATURE_UPGRADE_PLAN.md`](./FEATURE_UPGRADE_PLAN.md). Không implement trong vòng chấm điểm — chỉ lập plan.
