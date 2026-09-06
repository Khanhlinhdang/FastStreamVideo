# Kế hoạch nâng cấp ABR / cache / encode (LiveStream)

Ngày: 2026-09-05  
Cơ sở: [`NETFLIX_FEASIBILITY.md`](./NETFLIX_FEASIBILITY.md) + trạng thái code đã xác minh.  
**Phạm vi:** chỉ hạng mục khả thi **Cao** / **Trung bình–Cao**. Không implement trong tài liệu này — chỉ plan + test gate.

**Hiện trạng neo (để không “bịa” feature):**

- Player: `web/src/components/HlsPlayer.tsx` — buffer 30/60s, EWMA mặc định 2.5 Mbps, quality selector + `livestream.hls.quality`
- Encode: `server/src/services/encodeQueue.ts` — H.264 CBR ladder cố định, `probeHeight` only, `-hls_time 5`
- Media: `server/src/app.ts` — `Cache-Control: public, max-age=3600`
- Deploy: `deploy.md` — Caddy/nginx recipe, chưa cache dài cho `.m4s`
- Resume: `Watch.tsx` + `PUT /api/me/history` + Home continue-watching — **đã có**
- Scripts: `npm run dev|build|start|demo:encode`, `npx tsx server/scripts/reencode-episode.ts`

---

## Bảng quyết định Netflix → LiveStream → Phase

| Netflix tech | Quyết định LiveStream | Phase |
|---|---|---|
| Buffer ABR ~90s | Tune hls.js buffer + ABR + stall recovery | **P1** |
| Predictive prefetch (segment) | Forward buffer lớn hơn; optional prefetch tập sau | **P1** / P3 |
| CDN Open Connect | Không làm; Cache-Control + proxy recipe | **P2** |
| Per-title (full DO/VMAF) | Không; simplified ffprobe→CRF/ladder | **P3** |
| AV1 + FGS | Optional AV1/VP9 + H.264; không FGS | **P4** |
| Encode defaults tốt hơn (CRF/VBR VOD) | Thay CBR cứng / tránh bias soft 480p | **P3** |
| ML bandwidth / custom CC kernel | Không; metrics rebuffer đơn giản | **P5** |
| Live VBR events | Ngoài phạm vi sản phẩm | Won’t do |
| Resume / continue watching | Polish nhỏ nếu còn gap | **P5** |

---

## Phase 1 — ABR player tuning + forward buffer

### 1.1 Goal
Giảm rebuffer trên mạng yếu/biến động; khởi động Auto gần 720p vẫn ổn; khôi phục sau lỗi segment không “chết” player.

### 1.2 Exact implementation steps
1. Sửa `web/src/components/HlsPlayer.tsx` — object `new Hls({...})`:
   - `maxBufferLength`: 30 → **60**
   - `maxMaxBufferLength`: 60 → **120** (gần reservoir Netflix hơn, vẫn trong tầm VOD local)
   - Giữ `abrEwmaDefaultEstimate: 2_500_000` hoặc hạ nhẹ (vd. `1_800_000`) nếu test stall tăng khi start 720p trên mạng chậm
   - Thêm (nếu API hls.js version trong `web/package.json` hỗ trợ): `abrEwmaFastLive`/`abrEwmaSlowLive` không cần (VOD); dùng `abrBandWidthFactor` / `abrBandWidthUpFactor` nếu cần giảm dao động
   - Trong handler `Hls.Events.ERROR`: với `data.fatal`, thử `hls.recoverMediaError()` / `hls.startLoad()` trước khi set UI error (hiện chỉ set message)
2. Optional nhỏ: đọc `navigator.connection?.effectiveType` — nếu `2g`/`slow-2g` thì `startLevel` = rung thấp nhất thay vì `pickStartLevel` 720p+
3. Không đổi API server trong phase này

### 1.3 Acceptance criteria
- [ ] Auto vẫn liệt kê đủ level từ `master.m3u8` (480/720/1080…)
- [ ] Preference `localStorage` `livestream.hls.quality` vẫn hoạt động
- [ ] Sau throttle mạng giả lập, player recover hoặc hiện lỗi rõ — không silent hang
- [ ] `tsc` web không lỗi

### 1.4 Mandatory test procedure

```powershell
cd C:\Users\ATK\Desktop\StreamSqueeze
npm run dev
```

1. Mở tập `ready` (vd. admin upload full ladder hoặc `$env:DEMO_FULL=1; npm run demo:encode`).
2. DevTools → Network → Slow 3G (hoặc throttle 1–2 Mbps).
3. Chất lượng = **Tự động**; phát 2–3 phút.
4. **Expected:** buffer phía trước tăng (Network thấy nhiều `.m4s` tải trước); stall ≤ hành vi cũ; nếu cắt mạng ngắn rồi bật lại, playback tiếp tục hoặc báo lỗi có thể đọc được.
5. Đổi selector 480p / 1080p / Auto — **Expected:** level đổi, preference còn sau F5.
6. Typecheck:

```powershell
npm run build -w web
```

**Expected:** build OK.

### 1.5 Effort
**S**

### 1.6 Dependencies / risks
- Buffer lớn hơn → RAM + disk cache browser tăng; trên máy yếu có thể chậm seek đầu.
- `startLevel` 720p + estimate cao có thể stall lần đầu trên mạng rất chậm → cần test throttle.

---

## Phase 2 — Cache production-ish cho `/media`

### 2.1 Goal
Segment HLS gần như immutable được cache dài; playlist ngắn hơn; reverse proxy giảm hit vào Node.

### 2.2 Exact implementation steps
1. `server/src/app.ts` — trong `setHeaders` của `@fastify/static`:
   - Phân nhánh theo đường dẫn/`Content-Type` hoặc extension:
     - `.m4s`, `init.mp4`, `init_*.mp4`: `Cache-Control: public, max-age=31536000, immutable`
     - `.m3u8`: `Cache-Control: public, max-age=60` (hoặc `no-cache` nếu cần re-encode thay file cùng path)
     - poster / khác: giữ hoặc `max-age=86400`
2. Cập nhật `deploy.md`:
   - Caddy: ví dụ `header /media/*.m4s Cache-Control "..."` hoặc serve `media/hls` bằng `file_server` với `header` — tránh double-compress nếu đã `encode gzip` cho binary
   - nginx: `location ~* \.(m4s|mp4)$` `expires 1y;` + `Cache-Control immutable`; `location ~* \.m3u8$` `expires 1m;`
3. Không bắt buộc Cloudflare trong phase này; ghi chú optional trong `deploy.md`

### 2.3 Acceptance criteria
- [ ] `GET /media/hls/<id>/0/seg_000.m4s` trả `Cache-Control` dài + immutable
- [ ] `GET .../master.m3u8` trả cache ngắn
- [ ] CORS origin vẫn đúng như config

### 2.4 Mandatory test procedure

```powershell
npm run dev:server
# Sau khi có HLS ready:
curl.exe -sI "http://localhost:4000/media/hls/<episodeId>/master.m3u8"
curl.exe -sI "http://localhost:4000/media/hls/<episodeId>/0/seg_000.m4s"
```

**Expected:**
- master: `max-age` nhỏ (≤120) hoặc no-cache
- seg: `max-age=31536000` và có `immutable`
- Cả hai: status 200

Nếu đã dựng Caddy theo recipe mới: lặp lại `curl -sI` qua HTTPS host — cùng kỳ vọng header (proxy không strip).

### 2.5 Effort
**S**

### 2.6 Dependencies / risks
- Re-encode **cùng** `episodeId` path: client có thể giữ segment cũ nếu URL không đổi — chấp nhận được với VOD local; nếu cần bust: xóa HLS dir (encode hiện đã `fs.rmSync` outDir) + cache ngắn playlist là đủ hầu hết trường hợp.
- Gzip trên `.m4s` thường vô ích / hại CPU — tắt compress cho media binary trên proxy.

---

## Phase 3 — Encode defaults tốt hơn + simplified per-title ladder

### 3.1 Goal
Bỏ thiên lệch “CBR mềm / ladder cứng”; chọn CRF hoặc bitrate theo chiều cao (+ heuristic nhẹ); admin upload vẫn full ladder hữu ích cho ABR.

### 3.2 Exact implementation steps
1. `server/src/services/encodeQueue.ts`:
   - Mở rộng probe: ngoài `probeHeight`, lấy `width`, optional `bit_rate` (`ffprobe -show_entries stream=width,height,bit_rate`)
   - Thêm hàm `selectLadderForTitle(meta)`:
     - Vẫn cap theo height như `selectLadder` hiện tại
     - Chọn `crf` theo bucket (ví dụ nguồn ≥1080 và bitrate nguồn thấp → CRF cao hơn / rung 1080 bitrate thấp hơn; nguồn “khó” → CRF thấp hơn)
   - Đổi encode args từ thuần `-b:v` CBR sang **CRF + maxrate cap** (VBR bị chặn trần), ví dụ per-rung: `-crf:v:i`, `-maxrate:v:i`, `-bufsize:v:i` (giữ AAC như cũ)
   - Cập nhật `ensureMasterPlaylist` BANDWIDTH estimate cho khớp maxrate mới
2. `server/scripts/encode-demo.ts` / `reencode-episode.ts`: giữ `DEMO_FULL` / `DEMO_FAST`; document trong README một dòng về ladder CRF
3. **Không** thêm VMAF loop hay shot split

### 3.3 Acceptance criteria
- [ ] Admin upload nguồn 1080p → master có ≥3 STREAM-INF (480/720/1080) trừ khi intentionally capped
- [ ] Fast demo (`demo:encode` không `DEMO_FULL`) vẫn 1 rung nếu giữ hành vi hiện tại
- [ ] File HLS phát được trên `HlsPlayer`; init.mp4 Windows fix vẫn chạy
- [ ] Dung lượng thư mục `media/hls/<id>` không lớn vô lý so với trước (CRF thường nhỏ hơn CBR cao)

### 3.4 Mandatory test procedure

```powershell
cd C:\Users\ATK\Desktop\StreamSqueeze
# Encode một tập test (thay ID/path thật):
npx tsx server/scripts/reencode-episode.ts <episodeId>
# Kiểm tra ladder:
Get-Content .\media\hls\<episodeId>\master.m3u8
```

**Expected:** các dòng `#EXT-X-STREAM-INF` với RESOLUTION 854x480, 1280x720, 1920x1080 (nếu nguồn đủ cao).

```powershell
npm run dev
# UI: phát tập, selector thấy đủ level; nghe/nhìn không vỡ hình
npm run build -w server
```

**Expected:** `tsc` server OK; playback OK.

So sánh nhanh kích thước (trước/sau nếu còn bản cũ):

```powershell
Get-ChildItem .\media\hls\<episodeId> -Recurse | Measure-Object -Property Length -Sum
```

### 3.5 Effort
**M**

### 3.6 Dependencies / risks
- CRF làm thời gian encode thay đổi; progress vẫn 5%→100% (gap đã biết trong EVALUATION) — không block phase này.
- Bundled Windows ffmpeg cũ: xác nhận flag `-crf:v:0` hoạt động; nếu không, fallback `-b:v` theo bucket.
- Master synthesize `CODECS` vẫn `avc1` cho đến Phase 4.

---

## Phase 4 — Optional AV1 hoặc VP9 kèm H.264 fallback

### 4.1 Goal
Thêm một rung hiệu quả bandwidth cho browser hỗ trợ; mọi client khác vẫn H.264.

### 4.2 Exact implementation steps
1. Trong `encodeEpisodeHls`, sau (hoặc song song tuần tự) ladder H.264: encode thêm 1 variant `libsvtav1` hoặc `libvpx-vp9` ở 720p hoặc 1080p (chọn 1 codec để giảm scope).
2. `master.m3u8`: liệt kê variant AV1/VP9 **trước hoặc sau** H.264 với `CODECS=` đúng; hls.js chọn theo MSE support.
3. Feature flag env: `ENABLE_AV1_LADDER=1` (mặc định off) trong `server/src/config.ts` — tránh làm chậm mọi encode local.
4. Cập nhật `docs/ADMIN.md` một mục: bật flag → encode chậm hơn rõ rệt.

### 4.3 Acceptance criteria
- [ ] Flag off: hành vi encode giống Phase 3 (chỉ H.264)
- [ ] Flag on: master có thêm STREAM-INF AV1/VP9; Chrome phát được; Safari fallback H.264 nếu không decode AV1
- [ ] Disk chứa cả hai họ codec

### 4.4 Mandatory test procedure

```powershell
$env:ENABLE_AV1_LADDER="1"
npx tsx server/scripts/reencode-episode.ts <episodeId>
Select-String -Path .\media\hls\<episodeId>\master.m3u8 -Pattern "STREAM-INF|CODECS"
```

**Expected:** ít nhất một dòng CODECS av01/vp09 và các dòng avc1.

UI Chrome + (nếu có) Safari: phát Auto — **Expected:** không lỗi fatal; có thể kiểm tra level hiện tại qua hls.js debug hoặc Network mime.

```powershell
Remove-Item Env:ENABLE_AV1_LADDER
npx tsx server/scripts/reencode-episode.ts <episodeId2>
# Expected: không có CODECS av01/vp09
```

### 4.5 Effort
**L**

### 4.6 Dependencies / risks
- Encode CPU rất chậm trên Windows; queue tuần tự dễ tắc nếu bật mặc định.
- fMP4 + AV1 HLS tương thích trình duyệt cần kiểm chứng với ffmpeg build đang dùng.
- FGS **không** làm.

---

## Phase 5 — Health metrics rebuffer + polish resume

### 5.1 Goal
Thu thập stall từ client để biết ABR/encode có vấn đề; siết UX continue-watching nếu còn gap nhỏ.

### 5.2 Exact implementation steps
1. **Client** `HlsPlayer.tsx`: lắng `waiting` / `playing` hoặc `Hls.Events.ERROR` non-fatal; đếm rebuffer (duration ms).
2. **API** mới: `POST /api/playback/events` body Zod `{ episodeId, type: 'rebuffer'|'error', durationMs?, level? }` — không auth bắt buộc hoặc auth optional; ghi log Fastify / bảng SQLite mỏng `playback_events` (id, episodeId, type, durationMs, createdAt).
3. Đăng ký route trong `server/src/app.ts` (file `server/src/routes/playback.ts`).
4. **Resume polish** (chỉ nếu test chỉ ra gap):
   - Home continue: lọc `positionSec` > 5 và < 95% duration nếu có duration (hiện lấy 12 dòng history thô — có thể lọc bỏ gần hết tập)
   - `Watch.tsx`: flush history khi `pause`/`beforeunload` (hiện interval 8s) — giảm mất tiến độ

### 5.3 Acceptance criteria
- [ ] Gây stall (throttle) → ít nhất 1 event xuất hiện trong log/DB
- [ ] `GET /api/health` không đổi contract
- [ ] Continue-watching không list tập đã xem gần cuối (nếu đã implement filter)

### 5.4 Mandatory test procedure

```powershell
npm run dev
# Throttle mạng cực mạnh hoặc DevTools Offline 3s giữa chừng phát
# Sau đó:
# Nếu dùng SQLite table:
npx tsx -e "import {getDb} from './server/src/db/index.ts'" 
# hoặc query thủ công bằng sqlite3 CLI:
# SELECT * FROM playback_events ORDER BY id DESC LIMIT 5;
```

**Expected:** có row `rebuffer` với `durationMs` > 0.

Resume:

1. Login viewer → xem tới phút 2 → thoát tab.
2. Vào Home / `/lich-su` → mở lại tập.
3. **Expected:** `startPosition` ≈ vị trí đã lưu (±10s).

Typecheck: `npm run build`.

### 5.5 Effort
**M**

### 5.6 Dependencies / risks
- Endpoint public có thể bị spam — rate-limit đơn giản hoặc chỉ nhận từ same-origin sau này.
- Không xây ML trên events trong near-term.

---

## Phase phụ (optional, sau P1) — Prefetch tập sau

### Goal
Khi còn <60s cuối tập và có `next`, prefetch `master.m3u8` (+ vài segment đầu) của tập kế.

### Steps
- `Watch.tsx`: biết `next` + `playbackUrl`; `useEffect` khi `currentTime` gần hết → `fetch(nextMaster)` / `new Hls` ẩn không attach (cẩn thận memory) hoặc chỉ `link rel=prefetch`.
- Tắt khi `navigator.connection.saveData` hoặc effectiveType chậm.

### Acceptance + test
- Network tab thấy request tới `/media/hls/<nextId>/master.m3u8` trước khi bấm Tập sau.
- Bấm Tập sau: thời gian tới first-frame ngắn hơn baseline (đo thủ công vài lần).

### Effort
**S–M** · Risk: tốn bandwidth nếu user không binge.

---

## Won’t do / later research

| Hạng mục | Lý do |
|---|---|
| Open Connect appliances / ISP peering | Infra + cost; ngoài self-host |
| Full Dynamic Optimizer + VMAF per-shot | Thời gian encode + complexity; ROI thấp catalog nhỏ |
| Film Grain Synthesis production | Toolchain Netflix-class; không có trong stack |
| Custom TCP / congestion-control kernel | Không kiểm soát được từ Fastify/browser |
| Live VBR / live events platform | Non-goal: chỉ VOD HLS |
| ML bandwidth prediction production | Thiếu data + team; dùng EWMA + events P5 |
| DRM / paywall / multi-region CDN bắt buộc | Ngoài `features.md` non-goals |

---

## Thứ tự thực hiện đề xuất (ROI)

1. **P1** ABR/buffer/recovery  
2. **P2** Cache-Control + proxy recipe  
3. **P3** CRF + simplified per-title  
4. **P5** Rebuffer events (+ resume flush) — song song được với P3  
5. **P4** AV1/VP9 optional (chỉ khi disk/CPU chấp nhận được)  
6. Prefetch tập sau — sau khi P1 ổn

Mỗi phase **chỉ merge khi** mandatory test procedure tương ứng đã chạy và đạt expected results.
