# LiveStream — Kế hoạch nâng cấp Feature (từ Scorecard)

**Nguồn gốc:** [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md) (2026-09-06)  
**Đối chiếu nhẹ:** [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md), [`AUDIT_UPGRADE_PLAN.md`](./AUDIT_UPGRADE_PLAN.md) (28/28 PASS), [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md) + [`SCALING_TEST_RESULTS.md`](./SCALING_TEST_RESULTS.md)  
**Nguyên tắc:** Chỉ lập kế hoạch — **không** implement trong vòng này. Không làm lại hạng mục AUDIT/SCALING đã **PASS** trừ khi scorecard vẫn chấm yếu / “ops incomplete” (CF live, R2 mặc định prod, client chunked chưa wire).

**Mục tiêu chương trình (trọng số user):**
1. Admin CMS dễ, hiện đại (CRUD series/tập/phim lẻ, upload lớn)
2. Metadata đủ giàu để tìm & hiểu nội dung
3. IA rõ **phim lẻ** vs **series/tập**
4. UX end-user discover + polish
5. Playback độ phân giải cao mượt (wire R2/CF/worker đã có trong code)

---

## Narrative bắt buộc (gate)

> **Không bắt đầu hạng mục kế tiếp cho đến khi hạng mục hiện tại đạt Test bắt buộc = PASS.**  
> Mỗi FEAT có acceptance criteria + lệnh/UI smoke riêng. Chỉ khi gate PASS mới chuyển FEAT tiếp theo trong cùng phase (hoặc song song **chỉ** khi bảng phụ thuộc ghi `—` và không đụng cùng file conflict).  
> Sang phase mới chỉ khi **gate phase** (cuối mỗi phase) xanh.

Regression tối thiểu mọi gate: `GET /api/health` → ok; `npm run build` (server + web) OK; player vẫn phát HLS ready.

---

## Definition of Done (toàn chương trình)

Chương trình feature-upgrade **xong** khi:

1. Mọi ID trong master checklist = **Done** (hoặc **Won’t do** có lý do, chỉ P2 tùy chọn).
2. Mỗi ID đã qua **Test bắt buộc** của chính ID đó.
3. **Admin intuitiveness:** editor tạo phim lẻ hoặc series + ≥5 tập (upload chunked có %) trong **&lt; 15 phút**; sửa metadata tập không cần xóa-tạo lại; wizard một luồng Series→Tập→Upload.
4. **Metadata:** form/admin + detail/search hỗ trợ cast, director, tags, ageRating, runtime, trailer; user lọc năm/quốc gia/thể loại/loại (lẻ|bộ) trên UI.
5. **Movie vs series:** admin nav tách; phim lẻ không hiện “Tập 1” gây rối trên browse/detail/watch.
6. **Smooth playback:** prod checklist `ENCODE_IN_PROCESS=0` + worker; `R2_PUBLISH_MODE=hot|all` và/hoặc CF Cache Rules theo [`CLOUDFLARE.md`](./CLOUDFLARE.md); smoke upload 2–5 GB → encode 1080p → xem song song không stutter origin khi CDN/R2 bật.
7. Scorecard mục tiêu: trụ Admin ≥ **7.5**; Player giữ ≥ **8** với CDN; Overall ≥ **7.5**.

---

## Không đưa vào plan (đã PASS / tránh trùng)

| Nguồn | Đã xong — không re-plan trừ ops residual |
|---|---|
| AUD-* | Progress encode mịn, retry jobs, phụ đề, thumbs scrub, theater/PiP, multi-audio, QoE 24h cơ bản, chunked **API**, worker process, Caddy HLS, RBAC editor, signed media flag, bulk multi-file create, poster preview cơ bản, view cookie 24h |
| SCL-* | Ladder maxrate, R2 publish pipeline mock, playbackUrl R2, cleanup local, remote encoder, docs ENCODE_OFFPEAK / WORKER_VM / SCALING_METRICS |
| Scorecard mạnh (≥7–8) | Home/continue/schedule/ranking, HLS ABR+buffer+recover, favorites/history/comments |

**Ops residual (vẫn trong plan):** SCL-002/003 CF live **SKIP**; `R2_PUBLISH_MODE` mặc định `off`; web **chưa gọi** chunked upload API → FEAT-001 + FEAT-004.

---

## Master checklist

| ID | Name | Priority | Effort | Depends | Phase |
|---|---|---|---|---|---|
| FEAT-001 | Upload chunked client + progress % | P0 | M | — | 1 |
| FEAT-002 | Form sửa episode (Admin) | P0 | S | — | 1 |
| FEAT-003 | Wizard Series → Tập → Upload | P0 | M | FEAT-001, FEAT-002 | 1 |
| FEAT-004 | Prod ops: worker + R2/CF checklist | P0 | M | — | 1 |
| FEAT-005 | Search facets UI (API sẵn) | P0 | S–M | — | 1 |
| FEAT-006 | Schema `kind` movie \| series | P0 | M | — | 2 |
| FEAT-007 | Schema metadata giàu | P0 | M | — | 2 |
| FEAT-008 | Admin IA phim lẻ / series + forms metadata | P0 | M | FEAT-006, FEAT-007 | 2 |
| FEAT-009 | Public IA movie vs series | P0 | M | FEAT-006, FEAT-008 | 2 |
| FEAT-010 | Faceted browse page đầy đủ | P1 | M | FEAT-005, FEAT-006 | 2 |
| FEAT-011 | Trailer metadata + hover/hero | P1 | M | FEAT-007 | 2 |
| FEAT-012 | Poster dropzone + crop | P1 | M | — | 2 |
| FEAT-013 | Bulk edit metadata | P1 | M | FEAT-007, FEAT-008 | 2 |
| FEAT-014 | Episode reorder an toàn | P1 | M | FEAT-002 | 2 |
| FEAT-015 | Media library browser | P1 | M | FEAT-001 | 3 |
| FEAT-016 | Upload queue UI (pause/cancel/ETA) | P1 | M | FEAT-001, FEAT-003 | 3 |
| FEAT-017 | QoE charts + tune ABR/ladder | P1 | M | FEAT-004 | 3 |
| FEAT-018 | View metrics dashboard polish | P1 | S–M | — | 3 |
| FEAT-019 | Related / cùng thể loại | P2 | M | FEAT-007 | 3 |
| FEAT-020 | Profile user UI `/toi` | P2 | S | — | 3 |
| FEAT-021 | Season / multi-season | P2 | L | FEAT-006, FEAT-014 | 3 |
| FEAT-022 | Share timestamp `?t=` | P2 | S–M | — | 3 |
| FEAT-023 | Collections / playlist admin | P2 | M | FEAT-008 | 3 |
| FEAT-024 | Auto-ingest folder watch | P2 | L | FEAT-015, FEAT-016 | 3 |
| FEAT-025 | HEVC/AV1 dual-codec có kiểm soát | P2 | L | FEAT-004, FEAT-017 | 3 |
| FEAT-026 | Postgres optional (`DATABASE_URL`) | P2 | L | FEAT-004 | 3 |

**Tổng:** **26** hạng mục · **3 phase** (Phase 1 = ngày 0–30 · Phase 2 = 31–60 · Phase 3 = 61–90).

**Thứ tự thực thi đề xuất (5 ID đầu):** `FEAT-001` → `FEAT-002` → `FEAT-003` → `FEAT-004` → `FEAT-005`  
(`001`/`002`/`004`/`005` có thể song song nếu không đụng cùng PR conflict; `003` bắt buộc sau `001`+`002`.)

---

## Phase 1 — Ngày 0–30: “Admin dùng được + xem mượt hơn”

**Mục tiêu scorecard:** #1 easy admin (partial), #5 playback.  
**KPI:** Admin tạo series + 5 tập &lt; 15 phút; rebuffer giảm khi bật CDN/R2.

**Gate Phase 1:** FEAT-001…005 PASS; smoke upload 2–5 GB (chunked) + encode 1080p + xem song song; checklist CF/R2/worker đã điền (hoặc SKIP có lý do môi trường + file checklist signed).

---

### FEAT-001 (Upload chunked client + progress %)

- **Nguồn scorecard:** P0-1 · Upload UX Partial **4/10** (API có / web chưa gọi) · Admin CMS
- **Mục tiêu / định nghĩa xong:** Admin upload file lớn qua `init → PUT parts → complete`; thanh progress theo byte; retry part lỗi; không phụ thuộc multipart một phát (timeout proxy).
- **Hiện trạng codebase:** API sẵn trong `server/src/routes/admin.ts` (`/api/admin/episodes/:id/upload/init|…/parts|…/complete`, AUD-012 PASS). Client `web/src/pages/admin/AdminEpisodes.tsx` + `web/src/api/index.ts` vẫn multipart truyền thống; không hiển thị % byte upload.
- **Việc cần làm:**
  1. Thêm client helpers trong `web/src/api/index.ts`: `adminUploadInit`, `adminUploadPart`, `adminUploadComplete` (gọi đúng routes admin).
  2. Implement `uploadEpisodeFileChunked(file, onProgress)` — chia part (ví dụ 8–16 MB), `PUT` octet-stream, cộng dồn bytes.
  3. Wire `AdminEpisodes.tsx` (create + replace + bulk) dùng chunked khi `file.size` vượt ngưỡng (ví dụ &gt; 32 MB); giữ multipart cho file nhỏ nếu muốn.
  4. UI: thanh progress upload % + trạng thái “Đang tải lên… / Đang encode…”.
  5. Retry tối đa N lần / part; báo lỗi rõ nếu complete fail.
  6. Cập nhật ngắn `docs/ADMIN.md` mục upload lớn.
- **Phụ thuộc:** —
- **Acceptance criteria:** File ≥ 200 MB upload xong → job encode tạo; refresh giữa chừng không mất part đã ghi (cùng `uploadId`); UI hiện % tăng dần; fail part → retry thành công.
- **Test bắt buộc sau update:**
  - Commands: `npm run build`; login editor; `curl` hoặc DevTools Network thấy `upload/init` + nhiều `parts` + `complete`.
  - UI: `/admin/episodes` chọn series → tạo tập → chọn file lớn → quan sát progress → poll encode → `ready`.
  - Expected: không treo im; episode `statusEncode` → ready; `GET /media/hls/<id>/master.m3u8` 200 (hoặc R2 URL nếu bật).
- **Effort · Priority:** M · **P0**

---

### FEAT-002 (Form sửa episode trong Admin)

- **Nguồn scorecard:** P0-2 · Sửa metadata episode Awkward **4/10** · “API PUT có / AdminEpisodes không form edit”
- **Mục tiêu / định nghĩa xong:** Sửa title, number, quality/audio labels, duration từ UI; deep-link từ series; không phải xóa-tạo lại.
- **Hiện trạng codebase:** `api.adminUpdateEpisode` trong `web/src/api/index.ts`; `PUT` admin episodes trong `server/src/routes/admin.ts`. `AdminEpisodes.tsx` chỉ create / upload / manage sub-audio / soft-delete — không form edit hàng.
- **Việc cần làm:**
  1. Thêm panel/modal “Sửa tập” trên `web/src/pages/admin/AdminEpisodes.tsx` (fields khớp `AdminEpisodeInput`).
  2. Gọi `api.adminUpdateEpisode(id, body)`; xử lý conflict `UNIQUE(seriesId, number)` bằng message VI.
  3. Deep-link: từ `AdminSeries.tsx` link `/admin/episodes?seriesId=&edit=` hoặc mở edit inline.
  4. Sau save: refresh list + giữ filter `seriesId`.
- **Phụ thuộc:** —
- **Acceptance criteria:** Đổi title/number/labels → GET public episode phản ánh; số trùng → lỗi thân thiện, không 500 im lặng.
- **Test bắt buộc sau update:**
  - Commands: `npm run build -w web`.
  - UI: `/admin/episodes?seriesId=…` → Sửa → đổi title → Lưu → reload trang public `/phim/:slug` thấy title mới.
  - Expected: PUT 200; UI list cập nhật không cần F5 cứng nếu đã refresh state.
- **Effort · Priority:** S · **P0**

---

### FEAT-003 (Wizard / panel Series → Tập → Upload)

- **Nguồn scorecard:** P0-3 · Admin “easy” #1 · Series CRUD **7/10** nhưng nhảy trang
- **Mục tiêu / định nghĩa xong:** Một luồng gắn: tạo/chọn series → danh sách tập inline → upload (chunked từ FEAT-001); giảm nhảy `/admin/series` ↔ `/admin/episodes`.
- **Hiện trạng codebase:** Routes tách `web/src/App.tsx` (`admin/series`, `admin/episodes`); `AdminSeries.tsx` / `AdminEpisodes.tsx` độc lập; có `?seriesId=` filter sẵn.
- **Việc cần làm:**
  1. Tạo `web/src/pages/admin/AdminSeriesWorkspace.tsx` (hoặc nâng `AdminSeries`) — tabs/steps: Thông tin → Tập → Upload.
  2. Sau create series → tự chuyển step Tập với `seriesId` mới.
  3. Embed list + create episode + progress upload/encode (reuse FEAT-001/002).
  4. Nav `AdminLayout.tsx`: mục “Nội dung” trỏ workspace; giữ routes cũ redirect hoặc secondary.
  5. Empty states hướng dẫn VI (“Tạo series trước khi upload”).
- **Phụ thuộc:** FEAT-001, FEAT-002
- **Acceptance criteria:** Editor mới hoàn thành series + 3 tập upload mà không tự gõ URL episodes; encode poll hiện trên cùng màn.
- **Test bắt buộc sau update:**
  - Commands: `npm run build`.
  - UI: `/admin` → workspace → tạo series demo → thêm 3 tập nhỏ → đợi ready.
  - Expected: thời gian cảm nhận &lt; 15 phút cho 5 tập khi file sẵn; không mất context seriesId.
- **Effort · Priority:** M · **P0**

---

### FEAT-004 (Prod ops: worker off-peak + R2/CF mặc định)

- **Nguồn scorecard:** P0-5 · Player **7.6** nhưng CDN “cấu hình thêm”; SCL-002/003 SKIP; `R2_PUBLISH_MODE` default off
- **Mục tiêu / định nghĩa xong:** Checklist prod điền được: `ENCODE_IN_PROCESS=0` + compose profile `worker`; `R2_PUBLISH_MODE=hot` hoặc CF Cache Rules; smoke chứng minh origin egress giảm / không stutter khi encode song song xem.
- **Hiện trạng codebase:** Code PASS — `server/src/worker.ts`, `docker-compose.yml` profile `worker`, `server/src/services/r2HlsPublish.ts`, docs `CLOUDFLARE.md`, `ENCODE_OFFPEAK.md`, `WORKER_VM.md`. Chưa phải mặc định vận hành thật trên domain.
- **Việc cần làm:**
  1. Cập nhật `.env.production.example`: khuyến nghị `ENCODE_IN_PROCESS=0`, `R2_PUBLISH_MODE=hot` (hoặc `all` khi đủ), `SIGNED_MEDIA=0` khi dùng CF cache.
  2. Checklist vận hành một trang trong `docs/ADMIN.md` hoặc `docs/CLOUDFLARE.md` § “FEAT-004 gate”: DNS, Cache Rules, warm cache, worker up.
  3. Script smoke tùy chọn `server/scripts/feat004-ops-smoke.ts` (health `encoder:"remote"`, integrations.r2) — không bắt buộc live CF nếu không có VPS (ghi SKIP + lý do như SCL).
  4. Compose comment/README: `docker compose --profile worker up`.
  5. Không viết lại pipeline R2 đã PASS (SCL-007…012).
- **Phụ thuộc:** —
- **Acceptance criteria:** Trên môi trường có CF/R2: HIT segment tốt + xem 1080 không đè NIC origin khi encode chạy worker; trên lab không CF: checklist + remote encoder smoke PASS đủ gate “code/docs ready”.
- **Test bắt buộc sau update:**
  - Commands: `ENCODE_IN_PROCESS=0` → `GET /api/health` có `encoder:"remote"`; `npx tsx server/scripts/scl004-remote-encoder.ts` (reuse) hoặc feat004 script.
  - UI/ops: bật worker; upload encode trong lúc xem title ready khác.
  - Expected: API vẫn responsive; encode không `inline` trên process API.
- **Effort · Priority:** M (ops) · **P0**

---

### FEAT-005 (Search facets UI — expose filter API)

- **Nguồn scorecard:** P0-4 · Search **6/10** · Lọc year/country/genre API **5/10** · UI chỉ 1 ô
- **Mục tiêu / định nghĩa xong:** Trang `/tim-kiem` (và/hoặc browse) expose `genre` / `year` / `country` / `status` đã có ở `GET /api/series`.
- **Hiện trạng codebase:** `server/src/routes/catalog.ts` `/api/series` hỗ trợ query; `web/src/api/index.ts` `seriesList` đã có params; `web/src/pages/Search.tsx` chỉ gọi `api.search(q)` text LIKE.
- **Việc cần làm:**
  1. Đổi Search (hoặc thêm chế độ “Lọc”) dùng `api.seriesList({ q, genre, year, country, status, sort })` — mở rộng API search **hoặc** hợp nhất UI gọi `/api/series` khi có facet.
  2. Controls: select thể loại (`api.genres`), year, country, status; sync `useSearchParams`.
  3. Giữ debounce ô text; empty state VI.
  4. Nếu `/api/search` cần facet: thêm query song song trên `catalog.ts` (optional small).
- **Phụ thuộc:** — (mở rộng `kind` ở Phase 2 / FEAT-010)
- **Acceptance criteria:** User chọn thể loại + năm → kết quả khớp DB; URL shareable (`?genre=&year=`).
- **Test bắt buộc sau update:**
  - Commands: `curl "/api/series?genre=...&year=2020"` đối chiếu UI.
  - UI: `/tim-kiem` set filters không cần đúng tên đầy đủ.
  - Expected: grid PosterCard đúng subset; clear filter về full/search text.
- **Effort · Priority:** S–M · **P0**

---

## Phase 2 — Ngày 31–60: “Catalog tìm được & IA nội dung”

**Mục tiêu scorecard:** #2 metadata, #3 film lẻ vs series, #4 UX.  
**KPI:** Lọc năm/quốc gia/thể loại/loại không đoán tên; phim lẻ không hiện “Tập 1” rối.

**Gate Phase 2:** FEAT-006…014 PASS (P2 optional trong phase có thể trượt sang Phase 3 nếu cắt scope — mặc định 006–011 bắt buộc; 012–014 P1 bắt buộc trước gate).

---

### FEAT-006 (Schema `kind`: movie vs series)

- **Nguồn scorecard:** Phân biệt phim lẻ vs series **2/10** · New P0 content type · Admin IA **1/10**
- **Mục tiêu / định nghĩa xong:** Cột `series.kind` (`movie` \| `series`, default `series`); movie = đúng 1 episode logic (ẩn số tập trên UI); migrate + seed cập nhật.
- **Hiện trạng codebase:** `server/src/db/schema.ts` — bảng `series` không có `kind`/`contentType`; mọi thứ là series + episodes.
- **Việc cần làm:**
  1. Migration ALTER `series.kind TEXT NOT NULL DEFAULT 'series' CHECK(kind IN ('movie','series'))` trong `schema.ts` + `migrate.ts`.
  2. Mapper DTO `server/src/lib/mappers.ts`; Zod admin create/update trong `admin.ts`.
  3. Catalog list/search nhận `kind=`; index nếu cần.
  4. Seed: vài title `kind=movie`.
  5. Constraint mềm: movie chỉ 1 episode active (enforce API create episode).
- **Phụ thuộc:** —
- **Acceptance criteria:** DB có kind; API trả `kind`; tạo episode 2 trên movie → 400 rõ ràng.
- **Test bắt buộc sau update:**
  - Commands: `npm run db:migrate`; `GET /api/series?kind=movie`; create episode #2 on movie → reject.
  - UI: (admin form có thể ở FEAT-008) API-level PASS đủ cho FEAT-006.
  - Expected: existing rows = `series`; không phá soft-delete.
- **Effort · Priority:** M · **P0**

---

### FEAT-007 (Schema metadata giàu)

- **Nguồn scorecard:** Metadata series Partial **6/10** · P1-1 · New P0 schema · thiếu cast, tags, age, trailer, director
- **Mục tiêu / định nghĩa xong:** Cột/JSON: `cast`, `director`, `tags` (JSON array hoặc bảng), `ageRating`, `runtimeSec`, `trailerUrl` / `trailerEpisodeId`.
- **Hiện trạng codebase:** `series` có title, synopsis, year, country, genres, labels, Hot, schedule — không cast/tags/age/trailer/runtime.
- **Việc cần làm:**
  1. Migration cột trên `series` (ưu tiên JSON text cho cast/tags để giữ SQLite đơn giản).
  2. Validate Zod (ageRating enum/string; runtimeSec ≥ 0; trailer URL http(s) hoặc episode id thuộc series).
  3. Expose trên public DTO + admin CRUD body.
  4. Search LIKE mở rộng tags/cast (optional cùng PR hoặc FEAT-010).
- **Phụ thuộc:** — (song song FEAT-006 OK)
- **Acceptance criteria:** PUT admin ghi cast/tags/age/runtime/trailer; GET detail trả đủ field.
- **Test bắt buộc sau update:**
  - Commands: migrate; admin PUT + `GET /api/series/:slug` assert fields.
  - UI: có thể API-only đến FEAT-008.
  - Expected: null/empty backward compatible với client cũ.
- **Effort · Priority:** M · **P0**

---

### FEAT-008 (Admin IA phim lẻ / series + forms metadata)

- **Nguồn scorecard:** P1-1 form mở rộng · New P0 admin nav Phim lẻ/Series · Metadata admin
- **Mục tiêu / định nghĩa xong:** Nav admin “Phim lẻ” / “Series”; form wizard/workspace chọn kind; fields cast, director, tags, ageRating, runtime, trailer; movie UX ẩn “số tập” thừa.
- **Hiện trạng codebase:** `AdminLayout.tsx` nav series/episodes/genres…; `AdminSeries.tsx` form cơ bản year/country/genres/Hot.
- **Việc cần làm:**
  1. Filter list theo `kind` + route `/admin/movies` hoặc query `?kind=movie`.
  2. Mở rộng form `AdminSeries.tsx` / workspace FEAT-003 với fields FEAT-007.
  3. Movie: sau create tự tạo episode #1 ẩn hoặc CTA “Upload phim” một file.
  4. Types `web/src/api/types.ts` cập nhật.
- **Phụ thuộc:** FEAT-006, FEAT-007
- **Acceptance criteria:** Editor tạo phim lẻ + 1 file video không thấy UI “Tập 2”; series vẫn multi-ep.
- **Test bắt buộc sau update:**
  - Commands: `npm run build`.
  - UI: tạo movie + series; kiểm tra nav filter.
  - Expected: metadata lưu và hiện lại khi edit.
- **Effort · Priority:** M · **P0**

---

### FEAT-009 (Public IA movie vs series)

- **Nguồn scorecard:** Mục tiêu #3 · Badge/detail/watch copy · điểm Missing **2/10**
- **Mục tiêu / định nghĩa xong:** Browse/detail/watch: phim lẻ không nhấn “Tập 1”; CTA “Xem phim”; URL có thể giữ `/phim/:slug` + `/xem/:slug/1` nội bộ.
- **Hiện trạng codebase:** `SeriesDetail.tsx`, `Watch.tsx`, `PosterCard.tsx`, `EpisodeBadge` giả định multi-ep.
- **Việc cần làm:**
  1. Điều kiện `series.kind === 'movie'` → copy/UI khác trên detail, poster badge, watch title.
  2. Home rows: optional tách “Phim lẻ” (query kind) — tối thiểu không misleading.
  3. JSON-LD / title document nếu có.
- **Phụ thuộc:** FEAT-006, FEAT-008
- **Acceptance criteria:** User không thấy “Tập 1” trên poster/detail movie; series giữ list tập.
- **Test bắt buộc sau update:**
  - UI: mở movie seed → detail/watch; mở series → list ep.
  - Expected: copy đúng kind; deep link watch vẫn hoạt động.
- **Effort · Priority:** M · **P0**

---

### FEAT-010 (Faceted browse page đầy đủ)

- **Nguồn scorecard:** Thể loại **7/10** chưa facet kết hợp · New P1 faceted search · sau `kind`
- **Mục tiêu / định nghĩa xong:** Trang browse sidebar: thể loại, năm, quốc gia, loại (lẻ/bộ), status, (quality nếu có); kết hợp multi-filter.
- **Hiện trạng codebase:** `/the-loai/:slug` một facet; Search FEAT-005 đã expose cơ bản.
- **Việc cần làm:**
  1. Nâng `Search.tsx` hoặc trang `/duyet` mới trong `web/src/App.tsx`.
  2. Sidebar + chip active filters; `kind` từ FEAT-006.
  3. Sort: updated / views / year / title (API đã có sort một phần).
  4. Mobile: filters collapse.
- **Phụ thuộc:** FEAT-005, FEAT-006
- **Acceptance criteria:** Kết hợp genre+year+kind+country trả đúng; URL shareable.
- **Test bắt buộc sau update:**
  - UI: chọn 3 facet → đối chiếu `curl` cùng query.
  - Expected: không kết quả sai kind; skeleton/empty ổn.
- **Effort · Priority:** M · **P1**

---

### FEAT-011 (Trailer riêng cho hover/hero)

- **Nguồn scorecard:** Trailer Missing **2/10** · New P1 · hover dùng tập ready mới nhất
- **Mục tiêu / định nghĩa xong:** Hover/hero ưu tiên `trailerUrl` hoặc `trailerEpisodeId` (clip ngắn); không auto-play full episode dài khi có trailer.
- **Hiện trạng codebase:** `HoverPreviewCard.tsx` / `MutedPreviewPlayer` lấy episode ready; không trailer metadata (FEAT-007 thêm field).
- **Việc cần làm:**
  1. Resolver trailer playback URL trong mapper/API.
  2. `PosterCard` / `HoverPreviewCard` / Home hero dùng trailer nếu có.
  3. Admin gắn trailer (URL ngoài hoặc episode đánh dấu trailer — FEAT-008).
  4. Fallback: behavior cũ (tập ready).
- **Phụ thuộc:** FEAT-007
- **Acceptance criteria:** Series có trailer → hover phát trailer; không trailer → fallback cũ.
- **Test bắt buộc sau update:**
  - UI: gán trailer test → hover poster (pointer fine).
  - Expected: request HLS/trailer đúng nguồn; mute mặc định.
- **Effort · Priority:** M · **P1**

---

### FEAT-012 (Poster dropzone + crop hiện đại)

- **Nguồn scorecard:** P1-2 · AUD-009 đã preview cơ bản — nâng crop/dropzone (scorecard vẫn muốn CMS hiện đại)
- **Mục tiêu / định nghĩa xong:** Drag-drop zone, preview lớn, crop tỷ lệ poster, validate MIME/size (giữ AUD-009).
- **Hiện trạng codebase:** `AdminSeries.tsx` có `createObjectURL` preview + validate (AUD-009 PASS); chưa dropzone/crop.
- **Việc cần làm:**
  1. Component `PosterDropzone.tsx` (drag-over, click, preview).
  2. Crop UI nhẹ (canvas hoặc lib nhỏ đã có trong stack — tránh phụ thuộc nặng nếu không cần).
  3. Upload blob đã crop qua API poster hiện có.
  4. Không phá Supabase poster opt-in (`docs/SUPABASE.md`).
- **Phụ thuộc:** —
- **Acceptance criteria:** Kéo ảnh vào form → crop → lưu → posterUrl cập nhật trên PosterCard.
- **Test bắt buộc sau update:**
  - UI: admin series edit poster drop + crop + save.
  - Expected: file &gt;5MB / sai MIME bị chặn; preview trước khi save.
- **Effort · Priority:** M · **P1**

---

### FEAT-013 (Bulk edit metadata)

- **Nguồn scorecard:** Bulk edit Missing **2/10** · P1-3
- **Mục tiêu / định nghĩa xong:** Multi-select rows → PATCH batch genres/status/country/kind/tags (subset an toàn).
- **Hiện trạng codebase:** Không multi-select; chỉ CRUD từng series.
- **Việc cần làm:**
  1. API `PATCH /api/admin/series/batch` (hoặc POST) trong `admin.ts` — Zod array ids + patch partial.
  2. UI checkbox trên `AdminSeries` / workspace; toolbar “Áp dụng”.
  3. Transaction SQLite; partial failure report.
- **Phụ thuộc:** FEAT-007, FEAT-008
- **Acceptance criteria:** Chọn 5 series đổi country/status một lần; audit không đụng title trừ khi chọn field.
- **Test bắt buộc sau update:**
  - Commands: batch PATCH → GET list verify.
  - UI: multi-select → apply → reload.
  - Expected: editor role được; không escalate disk routes.
- **Effort · Priority:** M · **P1**

---

### FEAT-014 (Episode reorder an toàn)

- **Nguồn scorecard:** P1-4 · UNIQUE(seriesId, number) · series dài
- **Mục tiêu / định nghĩa xong:** Đổi số tập / kéo thả reorder không va unique; UI báo conflict trước khi commit.
- **Hiện trạng codebase:** `UNIQUE(seriesId, number)` trong schema; FEAT-002 edit number thô.
- **Việc cần làm:**
  1. API reorder: tạm số âm / transaction swap trong `admin.ts`.
  2. UI drag-reorder hoặc “↑↓” trên `AdminEpisodes` / workspace.
  3. Movie kind: ẩn reorder.
- **Phụ thuộc:** FEAT-002
- **Acceptance criteria:** Đổi 1↔2↔3 không lỗi unique; watch URLs theo number mới đúng.
- **Test bắt buộc sau update:**
  - UI: reorder 3 tập → xem `/xem/:slug/2` đúng nội dung sau đổi.
  - Expected: không orphan HLS; `number` unique luôn.
- **Effort · Priority:** M · **P1**

---

## Phase 3 — Ngày 61–90: “CMS & scale vững”

**Mục tiêu scorecard:** polish #1 + độ tin cậy #5.  
**KPI:** Admin trụ ≥ 7.5; Player ≥ 8 với CDN; Overall ≥ 7.5.

**Gate Phase 3 / chương trình:** FEAT-015…018 bắt buộc; FEAT-019…026 theo nhu cầu traffic (Won’t do được phép nếu ghi lý do). DoD toàn chương trình ở đầu tài liệu.

---

### FEAT-015 (Media library browser)

- **Nguồn scorecard:** Media library Missing **2/10** · New P1
- **Mục tiêu / định nghĩa xong:** Browse `uploads/` + HLS dirs; gắn lại episode; xóa orphan (admin-only).
- **Hiện trạng codebase:** Upload ghi `media/uploads`; HLS `media/hls/<epId>`; không UI browse; disk-usage API admin có (AUD-027).
- **Việc cần làm:**
  1. API list dirs an toàn (path jail dưới `MEDIA_ROOT`) trong `admin.ts`.
  2. Page `web/src/pages/admin/AdminMediaLibrary.tsx` + route App/Layout.
  3. Actions: attach source → episode; delete orphan upload; link mở HLS path.
  4. RBAC: `requireAdmin` cho delete; editor có thể list/attach nếu product cho phép.
- **Phụ thuộc:** FEAT-001
- **Acceptance criteria:** Thấy file upload chưa gắn; xóa orphan không đụng HLS ready đang phục vụ.
- **Test bắt buộc sau update:**
  - UI: upload file → library thấy → attach ep → encode.
  - Expected: path traversal `../` → 400; editor/admin đúng quyền.
- **Effort · Priority:** M · **P1**

---

### FEAT-016 (Upload queue UI)

- **Nguồn scorecard:** New P1 upload queue · Bulk UX **6/10** thô · gắn #5+#1
- **Mục tiêu / định nghĩa xong:** Hàng đợi file (nhiều): pause/cancel upload, ước thời gian encode từ job progress.
- **Hiện trạng codebase:** Bulk multi-file AUD-017; encode poll từng job; không queue UX pause/cancel/ETA.
- **Việc cần làm:**
  1. Client queue state (Zustand/context đơn giản) trên workspace.
  2. Pause/cancel = abort `fetch` part + optional API cancel init dir.
  3. ETA encode từ `progress` + elapsed (ước lượng).
  4. Persist queue tối thiểu trong `sessionStorage` (optional).
- **Phụ thuộc:** FEAT-001, FEAT-003
- **Acceptance criteria:** 5 file xếp hàng; cancel giữa chừng không enqueue encode; ETA hiện khi encoding.
- **Test bắt buộc sau update:**
  - UI: queue 3 file → cancel #2 → #1 và #3 complete.
  - Expected: không job ma cho file cancel.
- **Effort · Priority:** M · **P1**

---

### FEAT-017 (QoE charts + tune ABR/ladder)

- **Nguồn scorecard:** Telemetry Partial **6/10** · P1-5 · QoE usable **7/10** chưa charts sâu
- **Mục tiêu / định nghĩa xong:** Chart đơn giản 24h rebuffer/error trên AdminDashboard; đề xuất/áp dụng chỉnh `maxrate` / startLevel dựa dữ liệu (feature flag).
- **Hiện trạng codebase:** `playback_events` + admin aggregate (AUD-010); `HlsPlayer.tsx` ABR; ladder `encodeQueue.ts` (SCL-006). Chưa chart UI / feedback loop tự động.
- **Việc cần làm:**
  1. API series thời gian (bucket giờ) từ `playback_events`.
  2. Chart SVG/CSS nhẹ trên `AdminDashboard.tsx` (tránh lib nặng nếu không có sẵn).
  3. Doc + optional env `ABR_TUNE_FROM_QOE=1` điều chỉnh cap — **thận trọng**, mặc định off; hoặc chỉ báo cáo gợi ý admin.
  4. Không phá SCL-006 maxrate đã siết.
- **Phụ thuộc:** FEAT-004 (môi trường xem thật / CDN)
- **Acceptance criteria:** Dashboard hiện rebuffer 24h; admin hiểu title nào đau; tune flag documented.
- **Test bắt buộc sau update:**
  - Commands: POST vài playback events → GET stats/chart data.
  - UI: `/admin` thấy chart ≠ trống sau events.
  - Expected: bad token vẫn 401 trên admin stats.
- **Effort · Priority:** M · **P1**

---

### FEAT-018 (View metrics dashboard polish)

- **Nguồn scorecard:** View count **6/10** · P1-6 · AUD-007 cookie đã PASS — còn charts/tin cậy vận hành
- **Mục tiêu / định nghĩa xong:** Dashboard hiển thị views / dedupe rate; cookie 24h ổn định verified; không double-count cùng browser trong cửa sổ.
- **Hiện trạng codebase:** view dedupe cookie (AUD-007); ranking theo `viewCount`; chưa chart/admin breakdown.
- **Việc cần làm:**
  1. Stats admin: top series by views 24h nếu có bảng dedup; hoặc document giới hạn hiện tại.
  2. Smoke script assert dedupe (reuse aud007 pattern).
  3. UI nhỏ trên dashboard.
- **Phụ thuộc:** —
- **Acceptance criteria:** Hai view cùng cookie trong 24h → count +1; dashboard phản ánh.
- **Test bắt buộc sau update:**
  - Commands: POST view 2× same cookie → `deduped: true`.
  - UI: dashboard số liệu khớp DB.
  - Expected: tab/session khác vẫn có thể +1 (đúng thiết kế cookie).
- **Effort · Priority:** S–M · **P1**

---

### FEAT-019 (Related / “cùng thể loại”)

- **Nguồn scorecard:** Cá nhân hóa Missing **2/10** · P2-2 · New related
- **Mục tiêu / định nghĩa xong:** Row “Cùng thể loại” trên detail/home dựa genre overlap (không ML).
- **Hiện trạng codebase:** Không related query.
- **Việc cần làm:**
  1. `GET /api/series/:slug/related` trong `catalog.ts`.
  2. UI section trên `SeriesDetail.tsx` (+ optional Home).
  3. Exclude bản thân; ưu tiên cùng kind.
- **Phụ thuộc:** FEAT-007 (tags optional boost)
- **Acceptance criteria:** Detail hiện ≥1 related khi catalog đủ genre chung.
- **Test bắt buộc sau update:**
  - UI: mở series nhiều genre → row related.
  - Expected: không trả series đã soft-delete.
- **Effort · Priority:** M · **P2**

---

### FEAT-020 (Profile user UI `/toi`)

- **Nguồn scorecard:** Hồ sơ Weak **3/10** · P2-1 · AUD-016 API PATCH PASS
- **Mục tiêu / định nghĩa xong:** Trang `/toi` — displayName, avatar upload/URL, xem email/role read-only.
- **Hiện trạng codebase:** `PATCH /api/me` có; `avatarUrl` cột users; UI profile mỏng / thiếu route.
- **Việc cần làm:**
  1. Page `web/src/pages/Profile.tsx` + route `toi` trong `App.tsx`.
  2. Form gọi PATCH; preview avatar.
  3. Link từ nav user menu.
- **Phụ thuộc:** —
- **Acceptance criteria:** Đổi tên + avatar → persist sau reload; JWT user vẫn đúng.
- **Test bắt buộc sau update:**
  - UI: login → `/toi` → save → F5.
  - Expected: validation tên trống fail; user thường không thành admin.
- **Effort · Priority:** S · **P2**

---

### FEAT-021 (Season / multi-season)

- **Nguồn scorecard:** New P2 Season · series dài
- **Mục tiêu / định nghĩa xong:** `seasonNumber` trên episodes; UI group theo season trên detail/admin.
- **Hiện trạng codebase:** Chỉ `episodes.number` unique per series.
- **Việc cần làm:**
  1. Migration `seasonNumber INTEGER NOT NULL DEFAULT 1`; unique `(seriesId, seasonNumber, number)`.
  2. Admin + public list group; watch route có thể `ep` toàn cục hoặc `s/e`.
  3. Movie: force season 1 / ẩn.
- **Phụ thuộc:** FEAT-006, FEAT-014
- **Acceptance criteria:** Series 2 season hiển thị tách nhóm; reorder trong season an toàn.
- **Test bắt buộc sau update:**
  - UI: tạo S2E1 → detail tabs season.
  - Expected: migrate dữ liệu cũ = season 1.
- **Effort · Priority:** L · **P2**

---

### FEAT-022 (Share timestamp `?t=`)

- **Nguồn scorecard:** New P2 watch party / share timestamp
- **Mục tiêu / định nghĩa xong:** Deep link `/xem/:slug/:ep?t=123` seek khi ready; nút copy link tại vị trí hiện tại.
- **Hiện trạng codebase:** Resume từ history; không `?t=` share.
- **Việc cần làm:**
  1. `Watch.tsx` + `HlsPlayer` đọc `t` → `startPosition` (ưu tiên `t` &gt; history khi share).
  2. Nút “Sao chép liên kết lúc này”.
- **Phụ thuộc:** —
- **Acceptance criteria:** Mở link `?t=60` bắt đầu ~60s; copy link khớp `currentTime`.
- **Test bắt buộc sau update:**
  - UI: seek 90s → copy → mở tab ẩn danh (hoặc logout) → ~90s.
  - Expected: `t` không âm / không vượt duration.
- **Effort · Priority:** S–M · **P2**

---

### FEAT-023 (Collections / playlist admin)

- **Nguồn scorecard:** New P2 Collections · Home curated
- **Mục tiêu / định nghĩa xong:** Admin tạo collection (tên, slug, thứ tự series); Home render thêm rows curated.
- **Hiện trạng codebase:** Home hardcode hot/latest/ranking/schedule (`GET /api/home`).
- **Việc cần làm:**
  1. Bảng `collections` + `collection_items`; admin CRUD.
  2. Extend `/api/home` hoặc `/api/collections`.
  3. `Home.tsx` map rows.
- **Phụ thuộc:** FEAT-008
- **Acceptance criteria:** Tạo collection → hiện trên Home theo order; soft-hide được.
- **Test bắt buộc sau update:**
  - UI: admin tạo → `/` thấy row.
  - Expected: series deleted không còn trong collection public.
- **Effort · Priority:** M · **P2**

---

### FEAT-024 (Auto-ingest folder watch)

- **Nguồn scorecard:** New P2 auto-ingest · ops power-user
- **Mục tiêu / định nghĩa xong:** Worker scan thư mục watch → parse tên → tạo tập + enqueue (opt-in env).
- **Hiện trạng codebase:** Không folder watcher; bulk upload thủ công.
- **Việc cần làm:**
  1. Config `INGEST_WATCH_DIR` + interval trong worker.
  2. Parse `SeriesName/S01E02.mp4` hoặc epN; log + dry-run mode.
  3. An toàn: chỉ bật khi env set; jail path.
- **Phụ thuộc:** FEAT-015, FEAT-016
- **Acceptance criteria:** Drop file vào folder → episode+job xuất hiện (dry-run off).
- **Test bắt buộc sau update:**
  - Commands: dry-run log; rồi 1 file thật → job queued.
  - Expected: file ngoài jail bị bỏ qua; không duplicate cùng tên đã ingest.
- **Effort · Priority:** L · **P2**

---

### FEAT-025 (HEVC/AV1 dual-codec có kiểm soát)

- **Nguồn scorecard:** Optional VP9/AV1 Partial **5/10** · P2-3 · AUD-020 VP9-first không default AV1
- **Mục tiêu / định nghĩa xong:** Master dual-codec khi client hỗ trợ + fallback H.264; chỉ bật có kiểm soát (4K/bandwidth).
- **Hiện trạng codebase:** `ENABLE_AV1_LADDER`; mặc định off; player H.264 ABR chính.
- **Việc cần làm:**
  1. Encode package alternate codecs có flag per-title hoặc global.
  2. `HlsPlayer` chọn codec theo `MediaSource.isTypeSupported`.
  3. Docs rủi ro Windows bundled ffmpeg / thời gian encode.
- **Phụ thuộc:** FEAT-004, FEAT-017
- **Acceptance criteria:** Client hỗ trợ → rung HEVC/AV1; không hỗ trợ → H.264; không regression Safari cơ bản.
- **Test bắt buộc sau update:**
  - Commands: encode fixture flag on → master có codec variants; flag off → chỉ H.264.
  - UI: Chrome vs Safari smoke play.
  - Expected: mặc định production vẫn H.264-only trừ khi opt-in.
- **Effort · Priority:** L · **P2**

---

### FEAT-026 (Postgres optional)

- **Nguồn scorecard:** Postgres Missing **2/10** · P2-4 · SCL-015 SKIP · `SUPABASE.md` Phase B
- **Mục tiêu / định nghĩa xong:** Khi vượt SQLite write: `DATABASE_URL` Postgres theo roadmap Supabase Phase B — **không** scale-out API trước migrate.
- **Hiện trạng codebase:** better-sqlite3; stub `DATABASE_URL` chưa dùng.
- **Việc cần làm:**
  1. Theo [`SUPABASE.md`](./SUPABASE.md) Phase B (schema, repo layer, migrate, dual-read, cutover).
  2. Giữ SQLite path mặc định self-host nhỏ.
  3. Chỉ làm khi metrics FEAT-004/017 chứng minh API/DB bottleneck.
- **Phụ thuộc:** FEAT-004 (và thực tế traffic)
- **Acceptance criteria:** Boot Postgres env → CRUD catalog smoke; SQLite path không regress.
- **Test bắt buộc sau update:**
  - Commands: migrate Postgres test DB; health; series CRUD.
  - Expected: Won’t do hợp lệ nếu chưa có traffic — ghi rõ trong test results.
- **Effort · Priority:** L · **P2**

---

## Phụ thuộc giữa phase (tóm tắt)

```text
Phase 1 (không schema lớn)
  FEAT-001 ─┬─► FEAT-003 ─┬─► (Phase 3) FEAT-016
  FEAT-002 ─┘             │
  FEAT-004 ───────────────┼─► FEAT-017, FEAT-025, FEAT-026
  FEAT-005 ───────────────┼─► FEAT-010
                          │
Phase 2 (schema trước UI giàu)
  FEAT-006 ─┬─► FEAT-008 ─► FEAT-009
            ├─► FEAT-010
            └─► FEAT-021
  FEAT-007 ─┬─► FEAT-008, FEAT-011, FEAT-013, FEAT-019
  FEAT-002 ───► FEAT-014 ─► FEAT-021
  FEAT-012 song song Phase 2
                          │
Phase 3
  FEAT-015 ─► FEAT-024
  FEAT-001+003 ─► FEAT-016
  FEAT-018, FEAT-020, FEAT-022 tương đối độc lập
  FEAT-023 sau FEAT-008
```

**Quy tắc:** metadata schema (006/007) **trước** faceted full (010) và admin IA (008); upload chunked (001) **trước** wizard (003) và queue (016); ops playback (004) **trước** tune QoE sâu (017) và Postgres (026).

---

## Mapping 30 / 60 / 90 (scorecard §5)

| Cửa sổ | FEAT IDs | KPI |
|---|---|---|
| 0–30 | 001–005 | Series+5 tập &lt; 15 phút; CDN/worker checklist |
| 31–60 | 006–014 | Facet + kind + metadata + trailer + bulk/reorder |
| 61–90 | 015–026 | Library, queue, QoE, related, profile, seasons…; Admin ≥7.5 |

---

## Tài liệu liên quan

| Doc | Vai trò |
|---|---|
| [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md) | Điểm & đề xuất nguồn |
| [`AUDIT_UPGRADE_TEST_RESULTS.md`](./AUDIT_UPGRADE_TEST_RESULTS.md) | Tránh làm lại AUD-* |
| [`SCALING_TEST_RESULTS.md`](./SCALING_TEST_RESULTS.md) | R2/worker/CF residual |
| [`ADMIN.md`](./ADMIN.md), [`CLOUDFLARE.md`](./CLOUDFLARE.md), [`ENCODE_OFFPEAK.md`](./ENCODE_OFFPEAK.md) | Ops gates |

**Kết quả test chương trình (khi implement):** tạo `docs/FEATURE_UPGRADE_TEST_RESULTS.md` theo từng FEAT ID (PASS/FAIL/SKIP) — ngoài phạm vi plan-only này.
