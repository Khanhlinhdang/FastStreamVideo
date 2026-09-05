# LiveStream — Đánh giá toàn diện (sau vòng cải thiện)

Ngày đánh giá: 2026-09-05  
Phạm vi: ABR/playback, Admin Control Panel, metrics thật (views/ranking/ratings), kiểm thử local Windows.

---

## 1. Những gì đã hoạt động sau vòng này

### Phát video / chất lượng
- Admin upload & replace encode **luôn dùng full ABR ladder** (480 / 720 / 1080; thêm 1440/2160 nếu nguồn đủ cao) — không còn “fast 480p-only” cho upload admin.
- Ladder **CRF + maxrate** (simplified per-title từ ffprobe width/height/bit_rate); cap theo chiều cao nguồn.
- `HlsPlayer`: chọn chất lượng **Tự động + các level HLS**; preference `localStorage`; buffer **60/120**; fatal recover; slow-net startLevel thấp.
- Optional `ENABLE_AV1_LADDER=1` → thêm rung VP9 (ưu tiên) / AV1; mặc định tắt.
- `/media`: `.m4s`/init immutable 1y; `.m3u8` max-age 60.
- Resume flush pause/pagehide; continue-watching lọc gần hết tập; prefetch master tập sau <60s cuối.
- `POST /api/playback/events` + bảng `playback_events` (rebuffer/error).
- Encode Windows vẫn giữ fix `init.mp4` / `init_N.mp4` + synthesize `master.m3u8` khi ffmpeg thoát sớm.

### Admin Control Panel (`/admin`)
- **Tổng quan**: đếm series / episodes / genres / jobs (queued, ready, failed) / tổng views + encode gần đây.
- **Series**: tạo/sửa với title, synopsis, poster URL hoặc upload, genres đa chọn, **country**, year, status, quality/audio labels, Hot, lịch weekday(s) + note; tìm/lọc; soft-delete.
- **Episodes**: tạo tập + upload kèm file; thay video (re-upload → re-encode full ladder); theo dõi progress; tìm/lọc; soft-delete.
- Nav tiếng Việt: Tổng quan · Series · Episodes · Lịch chiếu · Thể loại.

### Metrics thật
- `POST /api/episodes/:id/view` tăng `episodes.viewCount` + `series.viewCount` (client gọi khi **bắt đầu phát**, dedupe theo `sessionStorage`).
- Ranking / home hot / search ưu tiên **viewCount** thật (không còn phụ thuộc seed ảo hàng trăm nghìn).
- Seed baseline `viewCount` / `rankingScore` = **0**.
- Ratings: bảng `ratings` (1–5 / user / series); hiển thị trung bình trên chi tiết + chấm sao khi đã login.

### Schema
- Cột `series.country` + bảng `ratings` + `playback_events`; migrate SQLite additive an toàn.

Chi tiết gate test upgrade ABR/cache/encode: [`UPGRADE_TEST_RESULTS.md`](./UPGRADE_TEST_RESULTS.md).

---

## 2. Kết quả kiểm thử (evidence)

| Hạng mục | Kết quả |
|---|---|
| API health | `GET /api/health` → ok |
| Web | `http://localhost:5173/` → 200 (Vite proxy `/api`) |
| Admin stats | `GET /api/admin/stats` trả counts + recent jobs |
| Tạo series | Country `Viet Nam`, genres, `scheduleWeekdays` [1,3,5] OK |
| Upload + encode | Episode 40, job 3 → **ready** ~90s |
| HLS levels | `media/hls/40/master.m3u8`: **854x480, 1280x720, 1920x1080** + `init_N.mp4` + segments |
| Soft-delete | Series eval biến mất khỏi admin/public search |
| Views | Sau zero DB: 2× `POST .../view` → series=2; ranking top = series vừa xem |
| Ratings | `POST /api/series/:id/rating` score=5 → `ratingAvg=5`, `ratingCount=1` |
| Typecheck | `tsc --noEmit` server + web OK sau sửa migrate typing |

**Lưu ý:** Demo cũ (`demo:encode` mặc định) vẫn có thể chỉ 480p nếu chưa chạy `DEMO_FULL=1`. Episode demo ep1 từng chỉ 1 level; admin upload mới (ep39/ep40) đủ 3 levels.

---

## 3. Gap / UX còn lại

- Progress encode chỉ nhảy 5% → 100% (chưa parse ffmpeg time).
- Dedup view theo session tab — refresh session / nhiều thiết bị vẫn cộng; chưa có “unique viewer / 24h”.
- Player quality trên Safari native HLS: selector level hạn chế hơn hls.js.
- Admin chưa có bulk import, drag-drop queue lớn, hay preview poster sau upload ngay trong form (có upload nhưng UX còn tối giản).
- Một số series seed vẫn `isHot` dù view=0 — hero “hot” phụ thuộc flag + views.
- Job failed lịch sử vẫn hiện trong stats (job 1 cũ) — chưa UI retry/clear.
- Chưa có phụ đề, thumbnail scrub, continue từ nhiều thiết bị sync sâu.

---

## 4. Nâng cấp để thành site streaming mượt hiện đại

### Mạng yếu / ABR
- Tune bitrate ladder theo nội dung; `abrEwma*` / cap bitrate theo mạng.
- Preload / `startLevel` theo `navigator.connection`.
- CDN + HTTP/2/3, cache segment dài hạn; origin shield.

### Codec & encode
- HEVC / AV1 + AAC/Opus với fallback H.264; multi-codec master.
- Worker encode tách process / queue Redis; GPU NVENC khi có.
- Resumable upload (tus/S3 multipart) cho file lớn.

### UX xem
- Thumbnail sprite / preview seek; phụ đề VTT; audio tracks; PiP; PWA offline nhẹ.
- Picture-in-picture, keyboard shortcuts, theater mode.

### Sản phẩm & vận hành
- Analytics (play start, stall, bitrate switches), moderation comments, RBAC chi tiết.
- Transcode webhook, DRM optional, geo/catalog rules.

---

## 5. Roadmap ưu tiên

### P0 (ổn định local → dùng được mỗi ngày)
- Giữ full-ladder admin encode + quality selector (đã có).
- Metrics views/ranking thật + admin CRUD đủ field (đã có).
- Progress encode mịn hơn; retry job failed từ UI.
- Re-encode demo với `DEMO_FULL=1` hoặc script migrate HLS cũ 480p-only.

### P1 (UX streaming)
- Thumbnails + subtitles; better weak-network ABR defaults.
- Resumable upload; poster crop/preview trong admin.
- Unique view window + dashboard charts nhẹ.

### P2 (scale / modern)
- CDN, multi-codec, separate encode workers, PWA, analytics suite, moderation tools.

**Admin vs user:** P0 ưu tiên **admin ingest + chất lượng phát**; user-facing polish (subtitle, thumbnail, PWA) xếp P1–P2 sau khi catalog/encode ổn.

---

## 6. Cách mở Admin & upload (nhanh)

1. Chạy `npm run dev` (hoặc `dev:server` + `dev:web`).
2. Đăng nhập `/dang-nhap`: `admin@livestream.local` / `admin123`.
3. Vào **Bảng điều khiển** → `/admin`.
4. **Series** → tạo phim (quốc gia, thể loại, lịch…).
5. **Episodes** → chọn series, số tập, chọn file video → **Tạo + upload encode**.
6. Đợi status **Sẵn sàng** → mở trang xem; dùng dropdown **Chất lượng** để đổi 480/720/1080.

Chi tiết ops: [`ADMIN.md`](./ADMIN.md). Tổng tính năng: [`../features.md`](../features.md).

---

## 7. Đối chiếu Netflix & kế hoạch ABR/CDN/encode

Đánh giá khả thi từng kỹ thuật Netflix (Open Connect, per-title/DO/VMAF, AV1/FGS, ABR buffer/ML, prefetch) trong ngữ cảnh LiveStream local/self-host:

- [`NETFLIX_FEASIBILITY.md`](./NETFLIX_FEASIBILITY.md) — khả thi / substitute / benefit theo quy mô hiện tại  
- [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md) — plan theo phase (ABR buffer, Cache-Control/proxy, CRF per-title rút gọn, AV1 optional, metrics) kèm **test gate bắt buộc**

Không thay roadmap §5 ở trên; hai tài liệu kia chi tiết hóa nhánh mạng/encode/playback.

---

## 8. Project audit toàn diện

Bản audit inventory + đánh giá UX/bảo mật/scale + đề xuất P0–P2 + lộ trình 30/60/90 (xác minh theo codebase, không thay roadmap §5):

→ **[`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md)**
