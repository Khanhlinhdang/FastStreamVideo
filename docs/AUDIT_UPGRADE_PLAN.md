# LiveStream — Kế hoạch nâng cấp từ Project Audit

**Nguồn gốc:** [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) (2026-09-05)  
**Đối chiếu:** [`EVALUATION.md`](./EVALUATION.md), [`../features.md`](../features.md), [`UPGRADE_PLAN_WORTH_IT.md`](./UPGRADE_PLAN_WORTH_IT.md), [`UPGRADE_TEST_RESULTS.md`](./UPGRADE_TEST_RESULTS.md)  
**Nguyên tắc:** Không làm lại hạng mục ABR buffer/cache/CRF/VP9/prefetch đã **PASS** trừ khi audit vẫn đánh dấu yếu/một phần. Không nhắm Netflix Open Connect / VMAF / DRM / paywall / live RTMP.

**Ghi chú xung đột Docker / Supabase (đang có):** Repo đã có `docker-compose.yml`, `server/Dockerfile`, `web/Dockerfile`, và tích hợp opt-in Supabase Storage (`server/src/lib/supabase.ts`, `docs/SUPABASE.md`). Mọi hạng mục dưới đây phải **env-friendly**: dùng `CORS_ORIGIN`, `HOST`, `PORT`, `DATABASE_PATH`, `MEDIA_ROOT` / `HLS_DIR` / `UPLOADS_DIR`, `REPO_ROOT`, `TRUST_PROXY`, `COOKIE_*`, `SUPABASE_*` — **không** hardcode `localhost` trong đường production; local dev vẫn được phép fallback `.env.example`. Không phá volume Docker hay giả định chỉ chạy ngoài container.

---

## Definition of Done (toàn chương trình)

Chương trình audit-upgrade **xong** khi:

1. Mọi ID trong bảng master ở trạng thái **Done** (hoặc **Won’t do** có lý do ghi rõ, chỉ áp dụng backlog P2 tùy chọn như sync đa thiết bị sâu / multi-audio nếu product quyết định cắt).
2. Mỗi ID đã qua **Test bắt buộc** của chính ID đó (không “test sau”).
3. Regression tối thiểu vẫn xanh: `GET /api/health` → ok; admin upload → master ≥ 3 levels (480/720/1080); player Auto + đổi quality; `npm run build` (server + web) OK.
4. Không regression với Docker Compose / Supabase opt-in: API boot với env production-style; poster local hoặc Supabase vẫn hoạt động theo cấu hình.
5. Tài liệu vận hành cập nhật ngắn trong `README.md` / `docs/ADMIN.md` / `deploy.md` đúng với hành vi mới (không viết lại audit).

---

## Master checklist

| ID | Tên ngắn | Priority | Effort | Depends on | Phase |
|---|---|---|---|---|---|
| AUD-001 | Progress encode mịn | P0 | S | — | 1 |
| AUD-002 | Retry / clear job failed | P0 | S | AUD-001 | 1 |
| AUD-003 | Demo HLS full ladder | P0 | S | — | 1 |
| AUD-004 | Hot / hero nhất quán | P0 | S | — | 1 |
| AUD-005 | Harden auth & deploy defaults | P0 | M | — | 1 |
| AUD-006 | Phụ đề VTT/SRT | P0 | M | AUD-003 | 1 |
| AUD-007 | Unique view cửa sổ 24h | P1 | S–M | AUD-004 | 2 |
| AUD-008 | ABR cap mạng yếu sâu hơn | P1 | S | — | 2 |
| AUD-009 | Admin poster preview | P1 | S | — | 2 |
| AUD-010 | Dashboard playback_events | P1 | M | — | 2 |
| AUD-011 | Thumbnail scrub / sprite | P1 | M | AUD-001 | 2 |
| AUD-012 | Resumable upload | P1 | L | AUD-002 | 2 |
| AUD-013 | Keyboard + theater + PiP | P1 | M | — | 2 |
| AUD-014 | Comment moderation | P1 | M | AUD-005 | 2 |
| AUD-015 | Safari quality selector | P1 | M | AUD-013 | 2 |
| AUD-016 | Avatar / profile edit | P2 | S | AUD-005 | 3 |
| AUD-017 | Bulk import episodes | P2 | M | AUD-012 | 3 |
| AUD-018 | Tách encode worker | P2 | L | AUD-001, AUD-002 | 3 |
| AUD-019 | Proxy serve HLS + CDN optional | P2 | M | — | 3 |
| AUD-020 | Multi-codec ladder ổn định | P2 | M | AUD-018 | 3 |
| AUD-021 | Encode webhook / notify | P2 | S | AUD-002 | 3 |
| AUD-022 | PWA shell nhẹ | P2 | M | — | 3 |
| AUD-023 | Docker Compose harden + CI | P2 | M | AUD-005 | 3 |
| AUD-024 | RBAC editor vs admin | P2 | M | AUD-005, AUD-014 | 3 |
| AUD-025 | Signed media URLs | P2 | M–L | AUD-019 | 3 |
| AUD-026 | Sync đa thiết bị sâu | P2 | L | AUD-007 | 3 |
| AUD-027 | Quota disk / dọn job cũ | P2 | S | AUD-002 | 3 |
| AUD-028 | Multi-audio tracks | P2 | M | AUD-006 | 3 |

**Tổng:** 28 hạng mục · **3 phase** (Phase 1 = ngày 0–30 · Phase 2 = 31–60 · Phase 3 = 61–90).

**Không đưa vào plan (đã PASS / non-goals):** buffer 60/120 + fatal recover; Cache-Control `.m4s`/`.m3u8`; CRF+maxrate ladder; insert `playback_events`; prefetch tập sau; Open Connect / VMAF / DRM / paywall / live.

---

## Phase 1 — Ngày 0–30: “Dùng mỗi ngày ổn định” (P0)

Mục tiêu phase: Admin tin queue encode; demo/ABR phản ánh sản phẩm thật; auth không deploy nhầm; bắt đầu phụ đề end-to-end.

---

### ID: AUD-001 (Progress encode mịn)

- **Nguồn audit:** §2.6 / §4 #1 — *Progress encode realtime mịn* → **Một phần**; “UI bar có; worker chỉ nhảy ~5% → (85%) → 100%”; ưu tiên **P0**.
- **Mục tiêu / định nghĩa xong:** `encode_jobs.progress` tăng liên tục theo thời gian encode thực (ffmpeg `time=` hoặc `-progress`), admin poll thấy bar mượt; ETA tùy chọn.
- **Hiện trạng codebase:** `server/src/services/encodeQueue.ts` (`onProgress?.(5)` rồi 85/100; `runCmd` không parse stderr time); poll UI `web/src/pages/admin/AdminEpisodes.tsx`, `AdminDashboard.tsx`; schema `encode_jobs.progress` trong `server/src/db/schema.ts`.
- **Việc cần làm:**
  1. Trong `encodeEpisodeHls` / `runCmd`, stream stderr (hoặc `-progress pipe:1`) và parse `out_time_ms` / `time=HH:MM:SS`.
  2. Tính `% = min(99, time / duration * 100)` từ ffprobe duration; cập nhật DB qua callback hiện có (throttle ~500ms).
  3. Giữ 100% chỉ khi HLS ready sau recovery init/master.
  4. Không đổi contract API job; đảm bảo Windows ffmpeg bundled vẫn ổn.
- **Phụ thuộc:** —
- **Acceptance criteria:** Job encoding dài ≥30s có ≥5 giá trị progress khác nhau giữa 5 và 99; không kẹt mãi ở 5%; ready vẫn = 100.
- **Test bắt buộc sau khi xong:**
  - Upload admin 1 clip ngắn → poll `GET /api/admin/jobs/:id` mỗi 1s trong lúc encoding → quan sát progress tăng dần.
  - `npm run build -w server`
  - Kỳ vọng: progress không chỉ `{5,85,100}`.
- **Effort:** S
- **Priority:** P0

---

### ID: AUD-002 (Retry / clear job failed)

- **Nguồn audit:** §2.5 / §4 #2 — *Retry / clear job failed từ UI* → **Yếu**; “Stats đếm failed; không action retry”; **P0**. §3.3 cũng thiếu dọn job.
- **Mục tiêu / định nghĩa xong:** Admin retry job failed (re-queue encode từ `sourcePath` hiện có) và xóa/clear job failed khỏi danh sách; UI có nút rõ ràng.
- **Hiện trạng codebase:** `GET /api/admin/stats`, `GET /api/admin/jobs`, `GET /api/admin/jobs/:id` trong `server/src/routes/admin.ts`; `EncodeQueue.enqueueJob` / `resumePending` trong `encodeQueue.ts`; UI chỉ hiển thị progress/error, không retry (`AdminEpisodes.tsx`, `AdminDashboard.tsx`); client `api.adminJob` / `adminJobs` trong `web/src/api/index.ts`.
- **Việc cần làm:**
  1. Thêm `POST /api/admin/jobs/:id/retry` (requireAdmin): chỉ khi `failed`; reset status `queued`, progress 0, clear error; `episodes.statusEncode=queued`; `enqueueJob`.
  2. Thêm `DELETE /api/admin/jobs/:id` (hoặc `POST .../clear`) cho job `failed`/`ready` cũ — không xóa file HLS nếu episode vẫn ready trừ khi documented.
  3. Wire nút Retry / Xóa trên Dashboard + Episodes khi status failed.
  4. Dùng progress mịn từ AUD-001 khi retry chạy lại.
- **Phụ thuộc:** AUD-001 (để retry có UX progress đáng tin)
- **Acceptance criteria:** Job failed → Retry → encoding → ready; Clear ẩn job khỏi recent list; không recreate episode.
- **Test bắt buộc sau khi xong:**
  - Tạo failed (vd. xóa `sourcePath` tạm rồi upload/job) → Retry với source hợp lệ → ready.
  - `GET /api/admin/stats` → `jobsFailed` giảm sau clear.
  - Manual UI: nút Retry trên `/admin`.
- **Effort:** S
- **Priority:** P0

---

### ID: AUD-003 (Demo HLS full ladder)

- **Nguồn audit:** §4 #3 — *Re-encode / chuẩn hóa demo HLS full ladder*; §2.6 demo fast 480p; EVALUATION lưu ý ep demo 1 level. **P0**.
- **Mục tiêu / định nghĩa xong:** Ít nhất các episode seed dùng để demo playback có master 480/720/1080; README/`ADMIN.md` nêu rõ `DEMO_FULL=1` vs fast; người mới không kết luận “sản phẩm chỉ 480p”.
- **Hiện trạng codebase:** `server/scripts/encode-demo.ts` (`DEMO_FULL !== '1'` → fast); `server/scripts/reencode-episode.ts`; `npm run demo:encode`; README đã có dòng PowerShell `DEMO_FULL`.
- **Việc cần làm:**
  1. Chạy `$env:DEMO_FULL=1; npm run demo:encode` (hoặc `reencode-episode` cho từng ep seed thiếu rung).
  2. Kiểm `media/hls/<id>/master.m3u8` có ≥3 `STREAM-INF`.
  3. Cập nhật README/ADMIN: khuyến nghị full ladder cho demo “xem chất lượng”; giữ fast chỉ bootstrap nhanh.
  4. Optional: script `scripts/ensure-demo-ladder.mjs` liệt kê ep ready chỉ 1 rung.
- **Phụ thuộc:** —
- **Acceptance criteria:** ≥1 episode seed demo có 480+720+1080; doc không mơ hồ.
- **Test bắt buộc sau khi xong:**
  - Đọc master.m3u8 (ep demo) → 3 resolution.
  - Mở `/xem/...` → selector có 480/720/1080.
  - Không phá admin upload full ladder hiện có.
- **Effort:** S
- **Priority:** P0

---

### ID: AUD-004 (Hot / hero nhất quán)

- **Nguồn audit:** §2.1 *Hot flag độc lập view* → **Một phần**; §4 #4 **P0**; seed `isHot=true` + `viewCount=0` trong `seed-data.ts`.
- **Mục tiêu / định nghĩa xong:** Hero/home hot phản ánh popularity thật: top `viewCount` **hoặc** `isHot AND viewCount > 0` (chọn một rule, document); seed không tạo hero “ảo”.
- **Hiện trạng codebase:** `GET /api/home` hot query `isHot = 1 ORDER BY viewCount` trong `server/src/routes/catalog.ts`; seed `server/src/db/seed-data.ts` nhiều `isHot: true` với view 0; UI `web/src/pages/Home.tsx`.
- **Việc cần làm:**
  1. Đổi query hot: ví dụ `(isHot = 1 AND viewCount > 0) OR` fallback top views; hoặc hero = top views, `isHot` chỉ badge.
  2. Cập nhật seed: `isHot` chỉ khi có rule (hoặc mặc định 0; admin bật sau khi có view).
  3. Đồng bộ copy UI nếu cần (“Thịnh hành” ≠ flag rỗng).
- **Phụ thuộc:** —
- **Acceptance criteria:** DB seed mới / reset → hero không liệt kê series view=0 chỉ vì isHot; sau khi xem thật, series đó có thể vào hot/ranking hợp lý.
- **Test bắt buộc sau khi xong:**
  - `npm run db:reset` + seed → `GET /api/home` hot rỗng hoặc chỉ series đủ điều kiện.
  - `POST /api/episodes/:id/view` vài lần → series xuất hiện ranking/hot theo rule mới.
- **Effort:** S
- **Priority:** P0

---

### ID: AUD-005 (Harden auth & deploy defaults)

- **Nguồn audit:** §3.4 Bảo mật — thiếu rate limit login/register/upload; không Helmet/security headers; secrets mặc định nguy hiểm; §4 #5 **P0** M.
- **Mục tiêu / định nghĩa xong:** Rate limit login/register (và upload admin cơ bản); checklist bắt buộc đổi JWT/seed admin trước production; headers bảo mật tối thiểu; tương thích Docker (`TRUST_PROXY`, `COOKIE_SECURE`).
- **Hiện trạng codebase:** `server/src/routes/auth.ts` không rate limit; rate limit chỉ `playback.ts`; `config.ts` default JWT/seed; `.env.example` / `.env.production.example`; `deploy.md`; không `@fastify/helmet`.
- **Việc cần làm:**
  1. Rate limit in-memory (hoặc `@fastify/rate-limit`) cho `/api/auth/login`, `/register`; optional upload.
  2. Boot warn (hoặc fail khi `NODE_ENV=production`) nếu JWT/seed vẫn giá trị `change-me` / `admin123`.
  3. Security headers cơ bản (CSP lỏng cho SPA, `X-Content-Type-Options`, etc.) — không phá Vite/HLS.
  4. Cập nhật checklist `deploy.md` + `.env.production.example` (DOMAIN, secrets, CORS không localhost trên public host).
  5. Ghi chú XSS/localStorage access token: mitigate tối thiểu (không bắt buộc chuyển cookie access trong ID này trừ khi effort cho phép).
- **Phụ thuộc:** —
- **Acceptance criteria:** >N login fail/IP → 429; production với secret mặc định bị chặn hoặc warn rõ; headers hiện trên `GET /api/health` hoặc HTML.
- **Test bắt buộc sau khi xong:**
  - Spam `POST /api/auth/login` sai password → 429.
  - `NODE_ENV=production` + secret mặc định → hành vi documented.
  - Docker/`CORS_ORIGIN` custom vẫn login được từ origin cấu hình.
- **Effort:** M
- **Priority:** P0

---

### ID: AUD-006 (Phụ đề VTT/SRT)

- **Nguồn audit:** §2.2 *Phụ đề…* → **Yếu**; §5 #1 **P0** M; lộ trình 0–30 “bắt đầu phụ đề VTT”.
- **Mục tiêu / định nghĩa xong:** Admin upload phụ đề gắn episode; player hiện/tắt track (hls.js `subtitleDisplay` và/hoặc `<track>`); SRT được chuyển VTT nếu cần.
- **Hiện trạng codebase:** Không cột/subtitle path trên `episodes` (`schema.ts`); `HlsPlayer.tsx` không subtitle API; admin upload chỉ video (`admin.ts` `/episodes/:id/upload`); `Watch.tsx`.
- **Việc cần làm:**
  1. Migrate: bảng `episode_subtitles` hoặc cột/JSON tracks (`label`, `lang`, `path`).
  2. Admin API upload `.vtt`/`.srt` → lưu dưới `media/subs/<episodeId>/` (env `MEDIA_ROOT`).
  3. Catalog/episode DTO trả `subtitles[]` URLs qua `/media/...`.
  4. `HlsPlayer`: render tracks + toggle UI tiếng Việt.
  5. Safari native path: `<track kind="subtitles">` trên `<video>`.
- **Phụ thuộc:** AUD-003 (để test trên tập demo full ladder sẵn sàng)
- **Acceptance criteria:** Upload VTT → Watch bật phụ đề thấy text; tắt được; soft-delete episode không lộ file qua UI (file có thể GC sau).
- **Test bắt buộc sau khi xong:**
  - Upload VTT mẫu → `GET` series/episode có subtitle URL → curl 200.
  - Manual Watch: bật/tắt sub; `npm run build -w web`.
- **Effort:** M
- **Priority:** P0

**Gate Phase 1:** health + admin upload 3 levels + progress mịn + retry + demo full ladder + hot rule + auth rate limit + 1 episode có sub.

---

## Phase 2 — Ngày 31–60: “UX streaming” (P1)

Mục tiêu phase: Cảm giác xem gần site thương mại nhỏ; ingest WAN đỡ đau; QoE có chỗ nhìn.

---

### ID: AUD-007 (Unique view cửa sổ 24h)

- **Nguồn audit:** §2.7 *Unique viewer / 24h* → **Yếu**; §4 #6 **P1**; client dedupe `sessionStorage` trong `Watch.tsx`.
- **Mục tiêu / định nghĩa xong:** Đếm view server-side dedup theo `(viewerKey, episodeId)` trong 24h; ranking ít bị spam refresh/tab.
- **Hiện trạng codebase:** `POST /api/episodes/:id/view` luôn +1 (`catalog.ts`); client `livestream.viewed.${id}` sessionStorage (`Watch.tsx`).
- **Việc cần làm:**
  1. Bảng `view_dedup` (viewerKey, episodeId, viewedAt) hoặc hash cookie `livestream_vid`.
  2. Server: nếu đã xem trong 24h → không tăng count (vẫn 200 `{deduped:true}`).
  3. ViewerKey: cookie httpOnly hoặc header device id; hoạt động cả ẩn danh.
  4. Giữ tương thích Docker/`COOKIE_SECURE`.
- **Phụ thuộc:** AUD-004 (ranking/hot đã dựa views thật)
- **Acceptance criteria:** 10× POST view cùng viewer/episode trong 1h → +1 lần; viewer khác → +1.
- **Test bắt buộc sau khi xong:**
  - Gọi view lặp với cùng cookie → series.viewCount không tăng liên tục.
  - Xóa cookie / viewer khác → tăng.
- **Effort:** S–M
- **Priority:** P1

---

### ID: AUD-008 (ABR cap mạng yếu sâu hơn)

- **Nguồn audit:** §3.2 / §4 #7 — còn thiếu cap bitrate theo `navigator.connection`; **P1**. **Không** làm lại buffer 60/120 / recover (đã PASS).
- **Mục tiêu / định nghĩa xong:** Trên `2g`/`3g`/saveData: `abrMaxBitrate` (hoặc tương đương) giới hạn rung cao; prefetch đã guard thì giữ/siết thêm nếu cần.
- **Hiện trạng codebase:** `HlsPlayer.tsx` `pickStartLevel` + slow-2g; buffer/EWMA đã tune; prefetch guard trong `Watch.tsx`.
- **Việc cần làm:**
  1. Map `effectiveType` / `downlink` → `hls.abrMaxBitrate` hoặc loại level cao khỏi Auto.
  2. Lắng nghe `change` trên `navigator.connection` để cập nhật runtime.
  3. Không phá manual quality selector (user vẫn chọn 1080 nếu muốn).
- **Phụ thuộc:** —
- **Acceptance criteria:** Simulate `effectiveType=3g` → Auto không nhảy 1080 ngay; manual 1080 vẫn được.
- **Test bắt buộc sau khi xong:**
  - Unit/logic test hoặc DevTools override connection → quan sát level Auto.
  - `npm run build -w web`
  - Manual Slow 3G 2 phút không regression recover.
- **Effort:** S
- **Priority:** P1

---

### ID: AUD-009 (Admin poster preview)

- **Nguồn audit:** §2.5 bulk/poster crop → **Yếu**; §4 #8 **P1** preview blob; tương thích Supabase poster upload hiện có.
- **Mục tiêu / định nghĩa xong:** Chọn file poster → preview ngay trong form; validate MIME/kích thước trước upload; vẫn hỗ trợ URL + Supabase/local.
- **Hiện trạng codebase:** `AdminSeries.tsx` có `posterFile` nhưng UX tối giản; `POST /api/admin/series/:id/poster` → local hoặc `uploadPosterToSupabase`.
- **Việc cần làm:**
  1. `URL.createObjectURL` preview; revoke on change/unmount.
  2. Validate type/size client; optional max dimension hint.
  3. (Optional nhẹ) crop cơ bản — không block nếu chỉ preview+validate.
- **Phụ thuộc:** —
- **Acceptance criteria:** Admin thấy preview trước Save; file quá lớn bị từ chối rõ ràng; upload Supabase/local không regress.
- **Test bắt buộc sau khi xong:**
  - Manual `/admin/series`: chọn ảnh → preview → lưu → poster hiện public.
  - Tắt Supabase env → `/media/posters/...`; bật env → URL supabase (nếu có credentials test).
- **Effort:** S
- **Priority:** P1

---

### ID: AUD-010 (Dashboard playback_events)

- **Nguồn audit:** §2.2 telemetry **Một phần** — chưa dashboard; §2.7 analytics **Yếu**; §4 #9 **P1**. Insert events đã PASS — chỉ thêm đọc/UI.
- **Mục tiêu / định nghĩa xong:** Trang admin QoE nhẹ: rebuffer count, avg `durationMs`, error count theo episode (và/hoặc 24h).
- **Hiện trạng codebase:** `POST /api/playback/events` + bảng `playback_events`; không GET aggregate; `AdminDashboard.tsx` chỉ jobs/views.
- **Việc cần làm:**
  1. `GET /api/admin/playback-stats?since=` aggregate SQL group by episodeId/type.
  2. UI bảng trên `/admin` hoặc `/admin/qoe`.
  3. Index theo `createdAt`/`episodeId` nếu thiếu.
- **Phụ thuộc:** —
- **Acceptance criteria:** Sau vài rebuffer giả → admin thấy số >0 đúng episode.
- **Test bắt buộc sau khi xong:**
  - `POST /api/playback/events` mẫu → `GET /api/admin/playback-stats` khớp.
  - RequireAdmin: user thường → 403.
- **Effort:** M
- **Priority:** P1

---

### ID: AUD-011 (Thumbnail scrub / sprite)

- **Nguồn audit:** §2.2 / §5 #2 **P1** M — ffmpeg sprite + VTT thumbnails.
- **Mục tiêu / định nghĩa xong:** Seek preview trên player (sprite + VTT hoặc storyboard URL); generate lúc encode hoặc job phụ.
- **Hiện trạng codebase:** Không sprite pipeline; `encodeQueue.ts` chỉ HLS; `HlsPlayer` native controls.
- **Việc cần làm:**
  1. Sau encode (hoặc song song): ffmpeg tile sprite + `thumbs.vtt`.
  2. Lưu `media/hls/<id>/thumbs.*`; expose URL episode.
  3. Player: preview khi hover seek bar (cần wrapper controls — phối hợp AUD-013 nếu controls custom chưa có: tối thiểu preview API + UI đơn giản).
- **Phụ thuộc:** AUD-001 (progress vẫn đúng khi thêm bước thumbs)
- **Acceptance criteria:** Episode ready có thumbs; hover/scrub hiện frame gần đúng thời điểm.
- **Test bắt buộc sau khi xong:**
  - Encode clip ngắn → file sprite/vtt tồn tại.
  - Manual scrub trên Watch.
  - Build server+web OK.
- **Effort:** M
- **Priority:** P1

---

### ID: AUD-012 (Resumable upload)

- **Nguồn audit:** §2.6 *Resumable upload* → **Yếu** (multipart 2GB một phát); §5 #3 **P1** L.
- **Mục tiêu / định nghĩa xong:** Upload file lớn qua chunked PUT hoặc tus; ghép file rồi enqueue encode như hiện tại; hoạt động sau proxy/Docker (body size limits documented).
- **Hiện trạng codebase:** `@fastify/multipart` 2GB (`app.ts`); `POST .../episodes/:id/upload` ghi một file (`admin.ts`).
- **Việc cần làm:**
  1. Chọn protocol (chunked init/complete hoặc tus tối giản).
  2. API: create session → upload parts → complete → `sourcePath` + `enqueue`.
  3. Client admin: progress upload % tách với encode %.
  4. Document Caddy/nginx `request_body` / timeouts; env paths không hardcode.
- **Phụ thuộc:** AUD-002 (retry encode sau upload đứt rồi complete lại)
- **Acceptance criteria:** File >200MB (hoặc mô phỏng nhiều chunk) upload thành công sau “gián đoạn” chunk giữa chừng; encode ready.
- **Test bắt buộc sau khi xong:**
  - Upload chunked end-to-end → job ready.
  - Incomplete session không để episode ready giả.
  - `npm run build -w server` + manual AdminEpisodes.
- **Effort:** L
- **Priority:** P1

---

### ID: AUD-013 (Keyboard + theater + PiP)

- **Nguồn audit:** §2.2 / §3.1 player native controls; §5 #4 **P1**.
- **Mục tiêu / định nghĩa xong:** Wrapper quanh `<video>`: phím Space/J/K/F/←/→, theater mode, PiP button; giữ quality + sub.
- **Hiện trạng codebase:** `HlsPlayer.tsx` dùng controls HTML5 + quality select; CSS player.
- **Việc cần làm:**
  1. Custom control bar tối thiểu (play, seek, volume, fullscreen, theater, PiP, quality, sub).
  2. Keyboard khi player focus.
  3. Theater: class layout trên `Watch.tsx`.
  4. `requestPictureInPicture` với fallback ẩn nút nếu không hỗ trợ.
- **Phụ thuộc:** —
- **Acceptance criteria:** Mọi shortcut documented hoạt động trên Chrome; PiP khi supported; không regress HLS Auto.
- **Test bắt buộc sau khi xong:**
  - Manual checklist phím + theater + PiP.
  - `npm run build -w web`
- **Effort:** M
- **Priority:** P1

---

### ID: AUD-014 (Comment moderation)

- **Nguồn audit:** §2.4 moderation → **Yếu**; §5 #5 **P1**; rate limit post thiếu (§3.4).
- **Mục tiêu / định nghĩa xong:** User report/flag; admin hide; rate limit tạo comment; không hiện comment `hidden` cho public.
- **Hiện trạng codebase:** `server/src/routes/comments.ts` CRUD owner; `Comments.tsx`; soft-delete owner only.
- **Việc cần làm:**
  1. Cột `hiddenAt` / `flagCount` hoặc bảng reports.
  2. API user `POST /api/comments/:id/report`; admin `POST /api/admin/comments/:id/hide`.
  3. Rate limit POST comments (tận dụng pattern AUD-005).
  4. UI admin danh sách flagged + nút ẩn; UI user nút báo cáo.
- **Phụ thuộc:** AUD-005 (rate limit infrastructure)
- **Acceptance criteria:** Comment ẩn không list public; admin thấy; report tăng flag.
- **Test bắt buộc sau khi xong:**
  - Tạo comment → report → hide → `GET` comments không còn body.
  - Spam POST comment → 429.
- **Effort:** M
- **Priority:** P1

---

### ID: AUD-015 (Safari quality selector)

- **Nguồn audit:** §2.2 *Quality selector trên Safari native HLS* → **Yếu**.
- **Mục tiêu / định nghĩa xong:** Trên Safari native path, user vẫn chọn chất lượng được (variant playlist riêng hoặc chuyển `src` theo level ước lượng), hoặc fallback hls.js MSE khi cần selector đầy đủ.
- **Hiện trạng codebase:** `HlsPlayer.tsx` nhánh native không expose levels như hls.js.
- **Việc cần làm:**
  1. Parse master.m3u8 lấy variant URLs khi native.
  2. UI quality đổi bằng cách set `video.src` variant / detach-reattach.
  3. Hoặc dùng hls.js trên Safari nếu MSE ổn — đo và chọn 1 hướng, document.
- **Phụ thuộc:** AUD-013 (chung control bar)
- **Acceptance criteria:** Safari (hoặc WebKit mock): đổi 480/720 hoạt động; Auto vẫn play.
- **Test bắt buộc sau khi xong:**
  - Manual Safari hoặc epiphany/WebKit nếu có; fallback: unit parse master + code path test.
  - Build web OK.
- **Effort:** M
- **Priority:** P1

**Gate Phase 2:** unique views + ABR cap + poster preview + QoE admin + thumbs + resumable + player chrome + moderation + Safari quality path.

---

## Phase 3 — Ngày 61–90: “Vận hành & scale nhẹ” (P2)

Mục tiêu phase: Self-host production-like cho nhóm nhỏ; vẫn không đổi non-goals Netflix-scale.

---

### ID: AUD-016 (Avatar / profile edit)

- **Nguồn audit:** §2.3 *Avatar / profile edit* → **Yếu** (`avatarUrl` có, UI chưa).
- **Mục tiêu / định nghĩa xong:** User đổi displayName + avatar (URL hoặc upload nhỏ local/Supabase).
- **Hiện trạng codebase:** `users.avatarUrl` schema; `GET /api/me`; comments map avatar; không UI edit (`Auth.tsx` / Library).
- **Việc cần làm:**
  1. `PATCH /api/me` Zod (displayName, avatarUrl) + optional upload.
  2. Trang hồ sơ hoặc modal trong Header.
  3. Reuse storage pattern poster (local/Supabase) nếu upload.
- **Phụ thuộc:** AUD-005
- **Acceptance criteria:** Đổi tên/avatar → comments/header cập nhật sau refresh.
- **Test bắt buộc sau khi xong:** PATCH me → GET me khớp; build OK.
- **Effort:** S
- **Priority:** P2

---

### ID: AUD-017 (Bulk import episodes)

- **Nguồn audit:** §2.5 *Bulk import / drag-drop queue* → **Yếu**; §3.3 thiếu bulk ingest.
- **Mục tiêu / định nghĩa xong:** Admin chọn nhiều file hoặc folder mapping `epN` → tạo episode + queue encode tuần tự.
- **Hiện trạng codebase:** Tạo từng episode + 1 file (`AdminEpisodes.tsx`).
- **Việc cần làm:**
  1. UI multi-file drop; map số tập từ tên file.
  2. API batch create+upload sessions (ưu tiên dùng AUD-012).
  3. Hiển thị hàng đợi nhiều job.
- **Phụ thuộc:** AUD-012
- **Acceptance criteria:** 3 file → 3 episodes queued/encoding/ready không treo UI.
- **Test bắt buộc sau khi xong:** Manual bulk 3 clip ngắn; stats jobs đúng.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-018 (Tách encode worker)

- **Nguồn audit:** §2.6 worker tách process → **Yếu**; §4 #10 **P2** L; single-process chặn API (§1, §3.3).
- **Mục tiêu / định nghĩa xong:** Encode chạy process/worker riêng (child process hoặc `node server/worker`); API chỉ enqueue DB; tương thích Docker service `worker` optional.
- **Hiện trạng codebase:** `EncodeQueue` in-process trong API (`encodeQueue.ts`, boot `resumePending`).
- **Việc cần làm:**
  1. Tách entry `server/src/worker.ts` đọc job `queued`.
  2. API chỉ INSERT job; không `pump` ffmpeg nặng (feature flag `ENCODE_IN_PROCESS=1` giữ dev đơn giản).
  3. docker-compose service `worker` cùng volume media/data.
  4. Health riêng hoặc label trên `/api/health` (`encoder: inline|remote`).
- **Phụ thuộc:** AUD-001, AUD-002
- **Acceptance criteria:** Encode 1080 không làm `/api/health` latency xấu rõ; worker crash không chết API process.
- **Test bắt buộc sau khi xong:**
  - Chạy API + worker → upload → ready.
  - Tắt worker → job ở queued; bật lại → xử lý.
  - Compose profile documented.
- **Effort:** L
- **Priority:** P2

---

### ID: AUD-019 (Proxy serve HLS + CDN optional)

- **Nguồn audit:** §4 #11 **P2**; deploy recipe đã có — cần áp dụng/verify production thật. Cache-Control origin đã PASS — không làm lại header logic trừ bug.
- **Mục tiêu / định nghĩa xong:** Production serve `/media/hls` qua Caddy/nginx disk (bypass Node) theo `deploy.md` / compose proxy; optional CDN/R2 note (`docs/CLOUDFLARE.md`, env R2) không bắt buộc bật.
- **Hiện trạng codebase:** Fastify static `/media` (`app.ts`); `docker-compose` proxy Caddy; `deploy.md`.
- **Việc cần làm:**
  1. Xác nhận Caddy file_server cho HLS volume; API không cần stream segment.
  2. Checklist verify Cache-Control tại mép proxy.
  3. Doc optional CDN pull — env-friendly base URL nếu có.
- **Phụ thuộc:** —
- **Acceptance criteria:** Request `.m4s` không hit Node access log (hoặc đo được proxy serve); master vẫn 200.
- **Test bắt buộc sau khi xong:**
  - `curl -sI` master vs segment qua domain proxy.
  - Compose up → phát 1 tập.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-020 (Multi-codec ladder ổn định)

- **Nguồn audit:** §2.6 VP9/AV1 **Một phần**; §4 #12 **P2**. VP9 path đã PASS — chỉ ổn định vận hành, **không** bật AV1 mặc định.
- **Mục tiêu / định nghĩa xong:** `ENABLE_AV1_LADDER` document rõ VP9-first; Safari/H.264 fallback; đo disk/time; không libaom mặc định.
- **Hiện trạng codebase:** `encodeOptionalEfficientVariant` trong `encodeQueue.ts`; flag `config.enableAv1Ladder`; ADMIN.md note.
- **Việc cần làm:**
  1. Doc ma trận client + khi nào bật.
  2. Smoke script assert master có `avc1` trước, `vp09` sau khi flag on.
  3. Guard: skip nếu encode > budget thời gian (optional).
  4. Chỉ khuyến nghị khi AUD-018 worker đủ CPU.
- **Phụ thuộc:** AUD-018
- **Acceptance criteria:** Flag 0 = chỉ H.264; flag 1 = +VP9; playback H.264 clients không gãy.
- **Test bắt buộc sau khi xong:** Lặp smoke như UPGRADE_TEST_RESULTS P4 (VP9); không bắt buộc AV1.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-021 (Encode webhook / notify)

- **Nguồn audit:** §5 #6 **P2** S; §3.3 thiếu thông báo encode xong.
- **Mục tiêu / định nghĩa xong:** Optional `ENCODE_WEBHOOK_URL` POST khi job ready/failed; UI toast/polling mạnh khi ready (multi-tab).
- **Hiện trạng codebase:** Không webhook; admin poll job; `config.ts` đã có stub email/Sentry env chưa dùng.
- **Việc cần làm:**
  1. Sau update job ready/failed → POST JSON `{jobId,episodeId,status}` nếu env set.
  2. Client: Notification API hoặc toast khi poll thấy ready.
  3. Không fail encode nếu webhook lỗi (log only).
- **Phụ thuộc:** AUD-002
- **Acceptance criteria:** Webhook nhận event; UI báo ready; webhook down không làm job failed.
- **Test bắt buộc sau khi xong:** Local webhook catcher (nc/`httpbin`) nhận payload; encode vẫn ready.
- **Effort:** S
- **Priority:** P2

---

### ID: AUD-022 (PWA shell nhẹ)

- **Nguồn audit:** §5 #7 **P2**; non-goals: không PWA đầy đủ/offline HLS nặng.
- **Mục tiêu / định nghĩa xong:** Installable shell (manifest + SW cache app shell only); **không** cache HLS segment.
- **Hiện trạng codebase:** Vite SPA thuần; không SW.
- **Việc cần làm:**
  1. `vite-plugin-pwa` hoặc manual manifest.
  2. Runtime caching navigate/shell; deny `/media` và `.m3u8`/`.m4s`.
  3. Icon + tên LiveStream.
- **Phụ thuộc:** —
- **Acceptance criteria:** Lighthouse installable (hoặc manifest hợp lệ); Network HLS vẫn network-only.
- **Test bắt buộc sau khi xong:** Build web; verify SW không cache segment; manual “Add to home screen” nếu được.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-023 (Docker Compose harden + CI)

- **Nguồn audit:** §2.8 Docker/CI/monitoring → **Yếu** (audit ghi “không có”; **codebase hiện đã có** compose/Dockerfiles — plan = hoàn thiện/verify, không viết từ zero). §5 #8.
- **Mục tiêu / định nghĩa xong:** Compose documented end-to-end; healthchecks xanh; CI tối thiểu (typecheck/build); secrets qua env file; tương thích Supabase opt-in.
- **Hiện trạng codebase:** `docker-compose.yml`, `server/Dockerfile`, `web/Dockerfile`, `.env.production.example`, `docs/SUPABASE.md`.
- **Việc cần làm:**
  1. Verify `docker compose up` + health API/web/proxy.
  2. Thêm CI GitHub Actions: `npm run build` + optional lint trên PR.
  3. Doc conflict: SQLite volume vs future `DATABASE_URL`; không hardcode localhost trong image.
  4. Optional worker service khi AUD-018 xong.
- **Phụ thuộc:** AUD-005 (secrets production)
- **Acceptance criteria:** Clone mới theo doc → stack healthy; CI fail khi tsc lỗi.
- **Test bắt buộc sau khi xong:**
  - `docker compose --env-file .env.production up -d --build` → health 200.
  - CI workflow chạy local `act` hoặc push dry-run documented.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-024 (RBAC editor vs admin)

- **Nguồn audit:** §5 #9 **P2**; role hiện chỉ `user`/`admin`.
- **Mục tiêu / định nghĩa xong:** Role `editor` CRUD catalog/upload; không đổi JWT secrets / user roles / seed admin; `admin` full (moderation, genres xóa, stats nhạy cảm tùy chọn).
- **Hiện trạng codebase:** `users.role CHECK(user, admin)`; `requireAdmin` auth.
- **Việc cần làm:**
  1. Migrate role check thêm `editor`.
  2. `requireEditor` vs `requireAdmin` trên routes.
  3. UI AdminLayout ẩn mục không đủ quyền.
- **Phụ thuộc:** AUD-005, AUD-014
- **Acceptance criteria:** Editor upload OK; editor không hide-all / không đổi role users; admin full.
- **Test bắt buộc sau khi xong:** Token editor → 403 route admin-only; 200 catalog write.
- **Effort:** M
- **Priority:** P2

---

### ID: AUD-025 (Signed media URLs)

- **Nguồn audit:** §5 #10 **P2**; §3.4 media public nếu biết URL.
- **Mục tiêu / định nghĩa xong:** Optional token ngắn hạn cho `/media/hls/...` (query HMAC hoặc path cookie); player lấy URL ký từ API; tắt bằng env để LAN mở.
- **Hiện trạng codebase:** Static public `/media` (`app.ts`).
- **Việc cần làm:**
  1. Flag `SIGNED_MEDIA=1` + secret env.
  2. API playback URL ký TTL; static hook verify.
  3. HlsPlayer dùng URL có chữ ký; segment relative resolve phải nhất quán (ký cả directory hoặc cookie).
  4. Tương thích proxy AUD-019.
- **Phụ thuộc:** AUD-019
- **Acceptance criteria:** Không token → 401/403 khi flag on; Watch vẫn phát với token mới.
- **Test bắt buộc sau khi xong:** curl segment không ký fail; có ký success; flag off = hành vi cũ.
- **Effort:** M–L
- **Priority:** P2

---

### ID: AUD-026 (Sync đa thiết bị sâu)

- **Nguồn audit:** §2.3 *Sync đa thiết bị sâu* → **Yếu** (chỉ REST history đơn giản).
- **Mục tiêu / định nghĩa xong:** Conflict policy rõ (last-write-wins theo `updatedAt`); optional offline queue client; không full CRDT.
- **Hiện trạng codebase:** `PUT /api/me/history` (`me.ts`); Watch flush pause/pagehide.
- **Việc cần làm:**
  1. Server reject/ignore position cũ hơn `updatedAt`.
  2. Client queue khi offline + flush khi online.
  3. Document giới hạn.
- **Phụ thuộc:** AUD-007 (cùng tư duy identity thiết bị hữu ích)
- **Acceptance criteria:** Hai thiết bị: máy có progress mới hơn thắng; offline vẫn không mất tiến độ khi online lại.
- **Test bắt buộc sau khi xong:** PUT cũ sau PUT mới không ghi đè; build OK.
- **Effort:** L
- **Priority:** P2

---

### ID: AUD-027 (Quota disk / dọn job cũ)

- **Nguồn audit:** §3.3 thiếu quota disk, dọn job cũ (bổ sung ngoài bảng §4 nhưng thuộc gap vận hành).
- **Mục tiêu / định nghĩa xong:** Admin thấy ước lượng dung lượng `media/`; xóa job ready/failed cũ hơn N ngày; cảnh báo ngưỡng.
- **Hiện trạng codebase:** Stats counts; không disk; clear job thuộc AUD-002 mở rộng.
- **Việc cần làm:**
  1. `GET /api/admin/disk-usage` (du HLS/uploads) — cẩn thận perf.
  2. `POST /api/admin/jobs/purge?olderThanDays=`
  3. Dashboard hiển thị.
- **Phụ thuộc:** AUD-002
- **Acceptance criteria:** Purge giảm số job cũ; disk endpoint trả số liệu hợp lý trên fixture.
- **Test bắt buộc sau khi xong:** Tạo job cũ (SQL touch finishedAt) → purge → biến mất; health OK.
- **Effort:** S
- **Priority:** P2

---

### ID: AUD-028 (Multi-audio tracks)

- **Nguồn audit:** §2.2 *multi-audio* trong cụm player **Yếu** (cùng nhóm sub/thumb/PiP).
- **Mục tiêu / định nghĩa xong:** Episode có thể gắn ≥1 audio (dup ffmpeg map hoặc file audio phụ); player chọn track.
- **Hiện trạng codebase:** Encode map `0:a:0?` một audio; không UI track.
- **Việc cần làm:**
  1. Schema audio tracks / encode multi `-map` khi nguồn có nhiều audio.
  2. hls.js audioTrack API + UI.
  3. Doc giới hạn nguồn.
- **Phụ thuộc:** AUD-006 (cùng bề mặt player tracks)
- **Acceptance criteria:** Nguồn 2 audio → selector đổi được; 1 audio → UI ẩn/disabled.
- **Test bắt buộc sau khi xong:** Fixture dual-audio encode → đổi track manual; build OK.
- **Effort:** M
- **Priority:** P2

**Gate Phase 3 / chương trình:** DoD toàn chương trình ở đầu tài liệu.

---

## Thứ tự thực thi khuyến nghị (dependency-aware)

```text
AUD-001 → AUD-002 → AUD-021 / AUD-027
AUD-003 → AUD-006 → AUD-028
AUD-004 → AUD-007 → AUD-026
AUD-005 → AUD-014 → AUD-024
         ↘ AUD-016
         ↘ AUD-023
AUD-001 → AUD-011
AUD-002 → AUD-012 → AUD-017
AUD-001+002 → AUD-018 → AUD-020
AUD-013 → AUD-015
AUD-019 → AUD-025
AUD-008, AUD-009, AUD-010, AUD-022: song song sau khi Phase 1 gate xanh
```

Mỗi ID **tự có test gate** — không chuyển ID tiếp theo nếu gate ID hiện tại đỏ (trừ ID song song không phụ thuộc).

---

## Mapping nhanh audit → ID (đủ coverage)

| Audit item | ID |
|---|---|
| Progress encode mịn (§4.1, §2.5 một phần) | AUD-001 |
| Retry/clear failed (§4.2, §2.5 yếu) | AUD-002 |
| Demo full ladder (§4.3) | AUD-003 |
| Hot ranking (§4.4, §2.1 một phần) | AUD-004 |
| Harden auth/deploy (§4.5, §3.4) | AUD-005 |
| Phụ đề VTT (§5.1, §2.2 yếu) | AUD-006 |
| Unique view 24h (§4.6, §2.7 yếu) | AUD-007 |
| ABR cap mạng yếu (§4.7, §3.2) | AUD-008 |
| Poster preview (§4.8, §2.5 yếu) | AUD-009 |
| Dashboard playback_events (§4.9, §2.2/2.7) | AUD-010 |
| Thumbnail scrub (§5.2) | AUD-011 |
| Resumable upload (§5.3, §2.6 yếu) | AUD-012 |
| Keyboard/theater/PiP (§5.4, §3.1) | AUD-013 |
| Comment moderation (§5.5, §2.4 yếu) | AUD-014 |
| Safari quality (§2.2 yếu) | AUD-015 |
| Avatar/profile (§2.3 yếu) | AUD-016 |
| Bulk import (§2.5 yếu) | AUD-017 |
| Encode worker (§4.10, §2.6 yếu) | AUD-018 |
| Proxy HLS + CDN (§4.11) | AUD-019 |
| Multi-codec ổn định (§4.12, §2.6 một phần) | AUD-020 |
| Encode webhook (§5.6) | AUD-021 |
| PWA (§5.7) | AUD-022 |
| Docker + CI (§5.8, §2.8 yếu) | AUD-023 |
| RBAC editor (§5.9) | AUD-024 |
| Signed media URLs (§5.10) | AUD-025 |
| Sync đa thiết bị (§2.3 yếu) | AUD-026 |
| Quota disk / dọn job (§3.3) | AUD-027 |
| Multi-audio (§2.2 yếu) | AUD-028 |

---

## Tài liệu liên quan

| File | Vai trò |
|---|---|
| [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) | Inventory + P0–P2 gốc |
| [`EVALUATION.md`](./EVALUATION.md) | Trạng thái sau vòng ABR/admin |
| [`UPGRADE_TEST_RESULTS.md`](./UPGRADE_TEST_RESULTS.md) | Gate PASS — không làm lại |
| [`UPGRADE_PLAN_WORTH_IT.md`](./UPGRADE_PLAN_WORTH_IT.md) | ROI: ưu tiên sản phẩm hơn Netflix-class |
| [`../deploy.md`](../deploy.md) | Proxy / production |
| [`SUPABASE.md`](./SUPABASE.md) | Opt-in storage — giữ tương thích |
| [`ADMIN.md`](./ADMIN.md) | Ops admin |

---

## Completion note (2026-09-05)

Chương trình audit-upgrade **28/28 PASS** (gồm AUD-028 multi-audio + Docker e2e CI + admin polish + scrub + RBAC split). Chi tiết: [`AUDIT_UPGRADE_TEST_RESULTS.md`](./AUDIT_UPGRADE_TEST_RESULTS.md).
