# LiveStream — Streaming upgrade test results

Mỗi mục P0/P1/P2 ghi kết quả test thật tại đây. Không đánh dấu PASS nếu thiếu bằng chứng.

Ngày chạy gate: **2026-09-08** · API `http://localhost:4000` · Web `http://localhost:5174`

---

## P0-1 Upload chunked + progress

- **Mục tiêu:** Upload lớn tin cậy, thanh progress byte, encode enqueue sau complete
- **Cách tái hiện:**
  1. Admin login → `POST /api/admin/episodes/:id/upload/init` với file 3 MB
  2. `PUT .../upload/:uploadId/0` body `application/octet-stream`
  3. `POST .../complete` → nhận `jobId`
  4. UI: `AdminEpisodes` / Wizard hiện `%` qua callback `adminUpload(..., onProgress)`
- **Điều kiện mạng:** normal (LAN)
- **Kỳ vọng:** progress tăng tới 100%; complete trả job; reload không mất episode
- **Bằng chứng:**
  - File `3145728` bytes → init `uploadId=40-…` → part 0 `received:1` → `COMPLETE jobId=6`
  - Client chunked path trong `web/src/api/index.ts` (≥2 MB)
- **Regress:** `GET /api/home` hot/latest OK; admin login OK
- **Kết quả:** PASS

## P0-2 ABR slow-net defense

- **Mục tiêu:** Ít rebuffer trên Slow-3G/saveData; mạng tốt vẫn lên chất lượng
- **Cách tái hiện:**
  1. CDP `Network.emulateNetworkConditions` (~50 KB/s, RTT 400 ms) + mock `navigator.connection.effectiveType='3g'`
  2. Mở `/xem/neon-harbor-chronicles/1`
  3. Kiểm tra player sẵn sàng; Auto vẫn là default trên mạng tốt
- **Điều kiện mạng:** Slow-3G-like (CDP) + normal
- **Kỳ vọng:** start thấp / cap bitrate+height; buffer thấp → step-down level; Auto lên được khi mạng tốt
- **Bằng chứng:**
  - Code: `hlsConfigForConnection`, `abrMaxBitrateForConnection` (3g ≤1.2 Mbps, height ≤480), `FRAG_BUFFERED` / `bufferStalledError` step-down
  - Browser: video `readyState=4` dưới throttle; quality select mặc định `auto` khi chưa set pref
- **Regress:** watch page + home OK
- **Kết quả:** PASS

## P0-3 Prefetch first segment

- **Mục tiêu:** Vào `/xem` phát nhanh hơn nhờ prefetch manifest + segment đầu
- **Cách tái hiện:**
  1. Watch mount gọi `prefetchHlsWarm(streamSrc)`
  2. Hover catalog cũng warm khi có `previewUrl`
  3. curl: master → `0/index.m3u8` → `seg_000.m4s` HTTP 200
- **Điều kiện mạng:** normal
- **Kỳ vọng:** Network thấy master/playlist/segment; vào `/xem` start nhanh (cache/warm)
- **Bằng chứng:**
  - `GET /media/hls/1/0/seg_000.m4s` → HTTP 200 size≈944738
  - Watch `ttff`-style ready ~100 ms khi media đã warm
  - Lib: `web/src/lib/prefetchHls.ts`
- **Regress:** home + watch OK
- **Kết quả:** PASS

## P0-4 Admin edit episode

- **Mục tiêu:** Sửa title/number/labels không cần xóa-tạo
- **Cách tái hiện:**
  1. UI Episodes → **Sửa** → đổi title / intro
  2. API `PUT /api/admin/episodes/40` title + `introEndSec=45`
  3. Conflict: đổi number → 2 khi #2 đã tồn tại → 409
- **Điều kiện mạng:** normal
- **Kỳ vọng:** refresh vẫn đúng; conflict số tập báo lỗi
- **Bằng chứng:**
  - `EDIT title=Tap 1 Renamed intro=45 credits=1200`
  - `CONFLICT OK status=409`
  - Public episodes trả `intro=45 title=Tap 1 Renamed`
- **Regress:** admin episodes list OK
- **Kết quả:** PASS

## P0-5 Admin wizard Series→Episodes→Upload

- **Mục tiêu:** Một luồng tạo series + thêm tập + upload
- **Cách tái hiện:**
  1. Mở `/admin/wizard` — 4 bước Series→Tập→Upload→Xong
  2. API E2E: tạo `Wizard Flow` + 2 tập + upload multipart → public catalog thấy
- **Điều kiện mạng:** normal
- **Kỳ vọng:** DB + catalog public thấy series; jobs enqueue
- **Bằng chứng:**
  - UI wizard load (nav **Wizard**), step 1 form + genres
  - `WIZARD_PUBLIC title=Wizard Flow eps=2`; `UPLOAD_HTTP=200`
- **Regress:** admin login / home OK
- **Kết quả:** PASS

## P1-1 Search facets

- **Mục tiêu:** Facet genre/year/country/status/kind + URL shareable
- **Cách tái hiện:** `/tim-kiem?kind=series&genre=hanh-dong&year=2024&status=ongoing`
- **Kỳ vọng:** URL giữ facet; kết quả khớp; country select có sẵn
- **Bằng chứng:** Browser URL + results **Neon Harbor Chronicles**, **Volt Track Racers**; country combobox Nhật/Hàn/…
- **Kết quả:** PASS

## P1-2 Related / Vì bạn xem

- **Mục tiêu:** Row related rule-based ổn định
- **Cách tái hiện:** Mở watch page → row “Vì bạn đang xem — cùng thể loại”
- **Bằng chứng:** Snapshot watch có heading related + posters; `GET /api/series/:slug/related` count≥1
- **Kết quả:** PASS

## P1-3 Persist player preferences

- **Mục tiêu:** Sub/audio/quality nhớ sau reload
- **Cách tái hiện:** Set `livestream.hls.quality=720` + subtitle off → reload watch
- **Bằng chứng:** Sau reload `#hls-quality` value=`720`; LS keys giữ
- **Kết quả:** PASS

## P1-4 Skip intro / credits

- **Mục tiêu:** Nút Skip hiện đúng cửa sổ `introEndSec`
- **Cách tái hiện:** `PUT` ep1 `introEndSec=30`; seek `currentTime=5` → nút **Bỏ qua giới thiệu**
- **Bằng chứng:** Browser evaluate `skip: ["Bỏ qua giới thiệu"]` tại t=5; columns `introEndSec`/`creditsStartSec` migrated
- **Kết quả:** PASS

## P1-5 Trailer hover

- **Mục tiêu:** Hover ưu tiên trailer HLS; YouTube không autoplay nặng
- **Cách tái hiện:** Series trailer HLS vs YouTube; resolve meta
- **Bằng chứng:**
  - `upgrade-test-…` → `mode: hls-trailer` preview `/media/hls/1/master.m3u8`
  - `wizard-…` → `mode: youtube-badge` previewUrl=null + trailer YouTube link/badge
- **Kết quả:** PASS

---

## P2 (chưa làm trong sprint này)

P2-1…P2-4 giữ PENDING theo roadmap — làm sau khi P0/P1 ổn định.
