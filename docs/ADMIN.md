# LiveStream — Admin & ops (local/dev)

> **Cảnh báo:** Tài khoản và secret dưới đây là **mặc định local/dev**.  
> **Đổi mật khẩu admin, JWT secrets, và CORS trước mọi deploy thật.**  
> Không dùng các giá trị này trên internet công khai.

## Tài khoản seed

Sau `npm run db:seed` (hoặc `db:reset`):

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| **Admin** | `admin@livestream.local` | `admin123` | Full: disk purge, secrets — đổi qua `SEED_ADMIN_*` trước seed |
| **Editor** | `editor@livestream.local` | `editor123` | Catalog/upload/phụ đề/bình luận — `SEED_EDITOR_*` |
| **Viewer** | `viewer@livestream.local` | `viewer123` | User thường (yêu thích, lịch sử, bình luận, đánh giá) |

Đăng nhập UI: `/dang-nhap` — sau đó vào **Admin** từ menu (role `admin` hoặc `editor`).

### RBAC

| | `editor` | `admin` |
|---|---|---|
| Series / episodes / upload / schedule / genres / phụ đề / audio / comments moderation | ✅ | ✅ |
| Disk usage / jobs purge | ❌ | ✅ |

## Route Admin (web) — Control Panel

Yêu cầu đăng nhập với role `admin` hoặc `editor`. Redirect về `/dang-nhap` nếu chưa auth.

| Path | Chức năng |
|---|---|
| `/admin` | **Tổng quan** — jobs, QoE; disk/purge chỉ admin |
| `/admin/series` | Tạo/sửa series |
| `/admin/episodes` | Upload encode; **Quản lý** phụ đề VTT/SRT + audio phụ |
| `/admin/comments` | Bình luận gắn cờ — ẩn / bỏ ẩn / xóa |
| `/admin/schedule` | Lịch chiếu theo weekday |
| `/admin/genres` | CRUD thể loại |

## API Admin (tóm tắt)

Bearer JWT + `requireEditor` (admin\|editor) trừ khi ghi chú admin-only.

- Stats / series / episodes / upload / jobs retry / subtitles / audio / comments / schedule / genres: **editor+**
- `GET /api/admin/disk-usage`, `POST /api/admin/jobs/purge`: **admin only**
- Phụ đề: `GET/POST /api/admin/episodes/:id/subtitles`, `DELETE .../subtitles/:subId`
- Audio phụ: `GET/POST /api/admin/episodes/:id/audio`

## Multi-audio (AUD-028)

- Encode tự probe nhiều stream audio → đóng gói `audio/N/` + `EXT-X-MEDIA` trên master + `audio-tracks.json`.
- Hoặc admin gắn file audio phụ khi tập đã ready.
- Fixture: `bash scripts/make-dual-audio-fixture.sh` rồi upload qua Admin Episodes.
- Player: selector **Âm thanh** khi ≥2 track (hls.js `audioTracks`).

## Demo encode ladder

- `npm run demo:encode` mặc định **fast** (1 rung ~480p) — bootstrap nhanh.
- Để demo **đúng chất lượng sản phẩm**: `$env:DEMO_FULL=1; npm run demo:encode` (PowerShell) → ≥3 `STREAM-INF` (480/720/1080).
- Kiểm: `node scripts/ensure-demo-ladder.mjs` hoặc mở `/xem/neon-harbor-chronicles/1` → selector 480/720/1080.
- Jobs: `POST /api/admin/jobs/:id/retry` (failed), `DELETE /api/admin/jobs/:id` (failed/ready clear).

## Metrics công khai

- `POST /api/episodes/:id/view` — tăng view khi user bắt đầu phát
- Ranking / hot / search sắp theo `viewCount`
- `POST /api/series/:id/rating` `{ score: 1–5 }` (auth) — aggregate trên chi tiết series

## Upload → encode job

### Phim lẻ (movie)
1. **Admin → Series** → loại *Phim lẻ* → điền metadata + chọn 1 file video → **Lưu phim + upload encode**.
2. Server tự tạo tập `#1`, lưu `sourcePath` vào SQLite, xếp hàng encode ABR.

### Phim bộ (series)
1. Tạo series (không cần video ngay).
2. **Admin → Episodes**: chọn series, chọn 1 file (auto đọc số tập + tên từ filename) hoặc **bulk** nhiều file → preview → xác nhận.
   - Parser hỗ trợ: `S01E12`, `EP12` / `E12`, `Tập 12`, `12 - Title`, `[12]`.
   - Không cần đổi tên file; sửa số/tên trên preview nếu nhận diện sai.
3. Server lưu `media/uploads/ep-<id>-<timestamp>.<ext>`.
4. `statusEncode = queued` → job queue in-process.
5. Worker ffmpeg:
   - probe chiều cao (+ width/bitrate) nguồn
   - ABR ladder H.264 + AAC **CRF + maxrate** (**480 / 720 / 1080**; 1440/2160 nếu nguồn đủ)
   - HLS VOD, fMP4, segment ~5s, `master.m3u8` (+ fix init trên Windows)
   - **Optional:** `ENABLE_AV1_LADDER=1` thêm 1 rung **VP9** (`libvpx-vp9`, ưu tiên trên Windows) hoặc AV1 (`libaom-av1`) ở 720p — encode chậm hơn H.264; mặc định tắt
6. Khi xong: `ready`, `hlsPath = hls/<episodeId>/master.m3u8`.
7. Theo dõi: thanh tiến độ trên UI hoặc `GET /api/admin/jobs/:id`.

### Persistence (đừng seed lại nếu muốn giữ upload)
- DB: `data/livestream.db` · Media: `media/uploads`, `media/hls`
- `npm run dev` / `npm run start:local` (`seed-if-empty`) **giữ** dữ liệu
- `npm run db:seed` / `db:reset` **xóa catalog** trong DB (file media trên đĩa có thể còn orphan)

## Playback cache (máy client)

| Lớp | Hành vi |
|---|---|
| hls.js / MSE buffer | ~60–120s trong RAM; đổi tập → player remount → `hls.destroy()` giải phóng buffer |
| Service Worker | **Không** cache `/media`, `.m3u8`, `.m4s`, `.mp4` |
| HTTP disk cache (trình duyệt) | Segment `.m4s` / `init.mp4` có `Cache-Control: immutable` (1 năm) — browser có thể giữ trên đĩa theo chính sách cache của Chrome/Edge; đổi video **không** xóa ngay toàn bộ cache cũ, nhưng trình duyệt tự eviction khi đầy |

## Preview taxonomy

Bốn miền “preview” khác nhau — dùng shared admin primitives, **không** gộp hover catalog với seek scrub:

| Kind | Chỗ dùng | Component / state |
|---|---|---|
| `hoverCatalog` | Catalog poster hover | `HoverPreviewCard` + `MutedPreviewPlayer` |
| `seekScrub` | Watch seek bar | `HlsPlayer` `scrubPreview` + `thumbs.vtt` |
| `adminFile` | Chọn poster/video trước upload | `AdminFilePreview` + `useObjectUrl` |
| `adminImport` | Bulk episodes trước import | `AdminImportPreview` |

Job chưa xong được **resume** khi API khởi động lại (`queued` / `encoding`).

### Peak vs encode (SCL-004)

- Peak watch: **không** encode full ladder trên cùng VPS — xem [`ENCODE_OFFPEAK.md`](./ENCODE_OFFPEAK.md).
- `ENCODE_IN_PROCESS=0` + `docker compose --profile worker` (off-peak).
- `ENABLE_AV1_LADDER=0` trên origin peak.
- Health: `encoder: "remote"` khi API không pump ffmpeg.

### Bitrate policy (SCL-006)

| Env | Effect |
|---|---|
| `MAX_ENCODE_HEIGHT=720` | Bỏ rung 1080 (và cao hơn) |
| Default ladder | 480 ~1 Mbps maxrate · 720 ~2.5 · 1080 ~4.5 (siết so với bản cũ) |

Player: saveData / mạng chậm → `abrMaxBitrate` + `autoLevelCapping` height.

### R2 HLS (SCL-007–009)

Khi `R2_*` đủ + `R2_PUBLISH_MODE=hot|all`, sau encode sync cây HLS lên R2; `playbackUrl` absolute. Local vẫn giữ (Phase 1). Admin: `POST /api/admin/episodes/:id/publish-r2`. Cleanup local sau R2: `POST /api/admin/hls/cleanup-local` `{ dryRun: true }` (admin).

### ENABLE_AV1_LADDER

| | |
|---|---|
| Env | `ENABLE_AV1_LADDER=1` |
| Default | off (`0`) |
| Effect | Thêm STREAM-INF `vp09…` (hoặc `av01…` nếu không có VP9) vào `master.m3u8` cạnh H.264 |
| Cost | Thời gian encode ↑↑; disk ↑; queue tuần tự dễ tắc nếu bật trên mọi upload |

Chỉ bật khi chấp nhận CPU/disk và đã kiểm tra playback trên Chrome (Safari thường fallback H.264).

## Đường dẫn HLS

Sau khi `ready`:

```text
/media/hls/<episodeId>/master.m3u8
```

Player UI có dropdown **Chất lượng** (Auto + levels). Preference lưu localStorage.

## Checklist trước deploy

- [ ] Đổi `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- [ ] Đổi mật khẩu admin (seed lại với `SEED_ADMIN_*` mới, hoặc đổi hash trong DB)
- [ ] Giới hạn CORS / cookie `secure` trên HTTPS
- [ ] Backup SQLite + thư mục `media/`
- [ ] Xem thêm đánh giá & roadmap: [`EVALUATION.md`](./EVALUATION.md)
