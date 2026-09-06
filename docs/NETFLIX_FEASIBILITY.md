# Netflix techniques → LiveStream: đánh giá khả thi

Ngày: 2026-09-05  
Phạm vi: đối chiếu kỹ thuật Netflix (CDN Open Connect, encoding per-title/per-shot/DO/VMAF/AV1/FGS, ABR buffer/congestion/ML) với repo **LiveStream** hiện tại.

**Ngữ cảnh LiveStream (đã xác minh trong code):**

| Lớp | Hiện trạng |
|---|---|
| Stack | Fastify 5 + better-sqlite3 + ffmpeg/ffprobe + React/Vite + **hls.js** |
| Deploy | Local/Windows hoặc self-host nhỏ; `deploy.md` gợi ý Caddy/nginx — **không** có CDN/Open Connect |
| Encode | `server/src/services/encodeQueue.ts`: ladder H.264+AAC cố định (CBR `-b:v` + maxrate/bufsize), cap theo `probeHeight`, HLS fMP4 `-hls_time 5` |
| Player | `web/src/components/HlsPlayer.tsx`: `maxBufferLength=30`, `maxMaxBufferLength=60`, `abrEwmaDefaultEstimate=2.5e6`, `startLevel` ~720p+, selector chất lượng + `localStorage` |
| Media | `@fastify/static` `/media/` với `Cache-Control: public, max-age=3600` (`server/src/app.ts`) |
| Sản phẩm | **VOD only** (`features.md` non-goals: không live realtime) |
| Team | Small / self-host |

Thang khả thi: **Không khả thi** · **Thấp** · **Trung bình** · **Cao**

---

## 1. CDN / Open Connect (edge appliance + cache hit ~98% + ML predictive caching)

### What it is
Open Connect là hệ thống CDN/edge appliance riêng của Netflix, đặt gần ISP, tối ưu cache hit và dự đoán nội dung sẽ xem để pre-position.

### Feasibility for LiveStream
**Không khả thi**

### Why
- Yêu cầu hardware/ISP peering, hợp đồng vận hành và quy mô traffic lớn — không áp dụng cho monorepo local/self-host.
- Patent/complexity vận hành edge + ML predictive cache vượt xa team nhỏ.
- Stack hiện tại phục vụ origin qua Fastify static; `deploy.md` chỉ có reverse proxy, không có CDN thương mại bắt buộc (đúng non-goals).

### Closest practical substitute
- Reverse proxy cache (Caddy/`file_server` hoặc nginx `proxy_cache` / serve trực tiếp `media/hls`) + header cache dài cho segment bất biến.
- CDN managed tùy chọn (Cloudflare/Bunny) trước origin khi có domain công khai — không phải Open Connect.
- Giữ `Cache-Control` trên `/media` (đã có `max-age=3600`; có thể tách playlist vs `.m4s`/init).

### Expected benefit at LiveStream scale
Local/LAN: gần như **0** so với Open Connect. 1– vài chục viewer: giảm tải origin và latency nhẹ nếu proxy cache đúng; ROI chủ yếu khi có HTTPS public + vài concurrent streams.

---

## 2. Encoding — Per-title encoding

### What it is
Chọn bitrate/CRF ladder theo độ phức tạp (và độ phân giải) của từng title thay vì một ladder cố định cho mọi file.

### Feasibility for LiveStream
**Cao** (phiên bản rút gọn)

### Why
- Đã có `probeHeight` trong `encodeQueue.ts`; mở rộng probe (resolution, duration, bitrate nguồn, hoặc heuristic đơn giản) là việc trong ffmpeg/ffprobe — không cần DO/VMAF.
- Ladder hiện là bảng cứng `LADDER` với `-b:v` cố định → dễ thay bằng CRF/`-crf` + ladder theo chiều cao hoặc “complexity bucket”.
- Chi phí compute tăng vừa phải trên Windows local; phù hợp small team.

### Closest practical substitute
- **Simplified per-title:** `ffprobe` height (+ optional `bit_rate` / scene-change thô) → chọn preset ladder (vd. soft anime CRF cao hơn / live-action CRF thấp hơn) hoặc giảm rung 1080p nếu nguồn “dễ”.
- Không làm shot-by-shot; không VMAF loop.

### Expected benefit at LiveStream scale
Giảm dung lượng HLS 10–40% trên nội dung đơn giản; cải thiện chất lượng cảm nhận ở cùng dung lượng trên nội dung khó. ROI cao vì encode vốn chạy local một lần mỗi tập.

---

## 3. Encoding — Per-shot + Dynamic Optimizer + VMAF

### What it is
Chia shot, tối ưu bitrate từng đoạn bằng vòng lặp encode–đo VMAF (Dynamic Optimizer) để đạt chất lượng mục tiêu với bitrate thấp nhất.

### Feasibility for LiveStream
**Không khả thi** (gần hạn: **Thấp** chỉ nghiên cứu)

### Why
- Multi-pass / multi-encode mỗi shot: thời gian encode ×10–×100; queue in-process hiện tại (`EncodeQueue` tuần tự) sẽ tắc trên Windows.
- Pipeline VMAF + shot detection + optimizer là hệ thống riêng, không nằm trong Fastify+SQLite hiện tại.
- Patent/complexity và tooling vận hành không phù hợp catalog nhỏ.

### Closest practical substitute
- Một pass CRF/VBR 2-pass đơn giản trên toàn title (xem mục 2 và mục encode defaults).
- (Sau này) spot-check VMAF thủ công trên vài sample — không đưa vào job queue production.

### Expected benefit at LiveStream scale
Benefit Netflix-scale không đạt được. Substitute CRF đơn giản đã chiếm phần lớn ROI thực tế cho thư viện nhỏ.

---

## 4. Encoding — AV1 (+ Film Grain Synthesis)

### What it is
Codec AV1 hiệu quả hơn H.264/HEVC; Film Grain Synthesis (FGS) tái tạo grain để bitrate thấp mà vẫn “đẹp”.

### Feasibility for LiveStream
- **AV1 ladder tùy chọn:** **Trung bình**
- **FGS production pipeline:** **Không khả thi**

### Why
- `libaom-av1` / `libsvtav1` qua ffmpeg khả thi kỹ thuật, nhưng encode **chậm** trên CPU Windows; browser support không đồng đều → bắt buộc giữ H.264 fallback trong `master.m3u8`.
- FGS cần toolchain/param chuyên sâu và content pipeline Netflix-class — không có trong repo; không ROI cho VOD demo/self-host.
- Code hiện chỉ `libx264` + `CODECS="avc1..."` khi synthesize master.

### Closest practical substitute
- Optional rung **AV1 hoặc VP9** cạnh H.264 trong cùng episode folder / dual codec master (hls.js chọn theo support).
- Bỏ FGS; nếu cần “đẹp hơn” ưu tiên CRF H.264 trước.

### Expected benefit at LiveStream scale
AV1: tiết kiệm bandwidth ~20–40% trên client hỗ trợ, đổi bằng thời gian encode dài và disk gấp đôi nếu giữ H.264. FGS: không áp dụng thực tế.

---

## 5. Encoding — VBR for live

### What it is
Bitrate biến thiên theo cảnh cho sự kiện live, cân bằng chất lượng/độ trễ trong pipeline live.

### Feasibility for LiveStream
**Không khả thi** (sản phẩm) / **Thấp** nếu hiểu nhầm là “VBR cho VOD”

### Why
- `features.md` ghi rõ: **không live streaming realtime** — chỉ VOD HLS.
- Không có ingest live, LL-HLS, hay event platform trong repo.

### Closest practical substitute
- Với **VOD**: dùng CRF hoặc VBR 2-pass (`-crf` / `-b:v` + `-pass`) trong `encodeEpisodeHls` thay CBR cứng — đây là cải thiện encode VOD, không phải “live VBR”.
- Không xây live events trừ khi đổi phạm vi sản phẩm.

### Expected benefit at LiveStream scale
Live VBR Netflix: **0** (không có live). CRF/VBR VOD: cải thiện chất lượng/dung lượng như mục per-title.

---

## 6. Playback — Buffer-based ABR (~90s reservoir)

### What it is
ABR quyết định rung dựa trên độ đầy buffer; Netflix giữ reservoir lớn (~90s) để giảm rebuffer và cho phép nhảy chất lượng ổn định.

### Feasibility for LiveStream
**Cao**

### Why
- hls.js đã cấu hình buffer trong `HlsPlayer.tsx` (`maxBufferLength` 30 / `maxMaxBufferLength` 60) — còn thấp hơn ~90s Netflix nhưng cùng mô hình.
- VOD + segment 5s: tăng buffer là thay đổi config client, không đụng infra.
- Selector chất lượng thủ công đã có — không xung đột.

### Closest practical substitute
- Tăng `maxBufferLength` / `maxMaxBufferLength` (vd. 60/120), tinh chỉnh `abrEwma*`, `abrBandWidthFactor`, `nudgeMaxRetry` / fatal error recovery.
- Optional: `navigator.connection` để giảm `startLevel` trên mạng chậm.

### Expected benefit at LiveStream scale
Giảm stall trên Wi‑Fi yếu/LAN biến động; tăng memory/bandwidth download trước. ROI rất cao, effort nhỏ.

---

## 7. Playback — ABR + congestion control pacing

### What it is
Phối hợp chọn bitrate với congestion control / pacing download (thường cần stack mạng tùy biến, đôi khi kernel/TCP custom) để tránh đầy buffer rồi đột ngột đói.

### Feasibility for LiveStream
**Thấp** (kernel/custom CC: **Không khả thi**)

### Why
- Custom TCP pacing / congestion kernel là R&D Netflix-scale, không chạy trên app Node + browser thường.
- Browser/hls.js đã có giới hạn tải qua buffer config; không expose kernel CC.

### Closest practical substitute
- hls.js: `maxStarvationDelay`, `maxLoadingDelay`, `abrMaxWithRealBitrate`, giới hạn `capLevelToPlayerSize`.
- Proxy HTTP/2; tránh overload bằng `maxBufferSize` hợp lý.
- Không viết congestion-control kernel.

### Expected benefit at LiveStream scale
Substitute config: giảm overshoot bitrate nhẹ. Custom CC: không khả thi → benefit 0.

---

## 8. Playback — ML bandwidth prediction

### What it is
Mô hình ML dự đoán bandwidth tương lai để chọn rung trước khi buffer tụt.

### Feasibility for LiveStream
**Thấp**

### Why
- Cần dataset stall/throughput lớn, inference pipeline, và A/B — vượt quy mô catalog local.
- hls.js EWMA đã là estimator đủ cho vài–vài chục user.

### Closest practical substitute
- Giữ/tinh chỉnh `abrEwmaDefaultEstimate` + EWMA half-life của hls.js.
- Optional: ghi log rebuffer client → endpoint đơn giản (học rule-based sau, không ML).

### Expected benefit at LiveStream scale
ML: gần 0 trong 12 tháng. EWMA tuning: cải thiện khởi động và ít dao động rung.

---

## 9. Playback — Predictive prefetch

### What it is
Prefetch segment/title sắp xem (tập sau, trailer, continuum) dựa trên hành vi.

### Feasibility for LiveStream
**Trung bình** (segment gần playhead: **Cao**; prefetch tập sau/ML: **Thấp–Trung bình**)

### Why
- hls.js buffer lớn hơn đã “prefetch” segment phía trước trong cùng rendition — gần như free.
- Prefetch tập kế tiếp cần logic `Watch.tsx` + bandwidth guard; hữu ích nhưng dễ lãng phí disk/bandwidth trên local.
- Predictive multi-title kiểu Netflix cần catalog/telemetry lớn.

### Closest practical substitute
- Tăng forward buffer (mục 6).
- Optional: `link rel=prefetch` hoặc `fetch()` vài segment đầu của `next` episode khi user gần hết tập (sau khi ABR ổn).
- Không làm ML predictive cache toàn catalog.

### Expected benefit at LiveStream scale
Buffer lớn: rõ rệt. Prefetch tập sau: giảm chờ khi bấm “Tập sau”; lợi ích vừa nếu người dùng thường binge.

---

## Bảng tóm tắt

| Kỹ thuật Netflix | Khả thi LiveStream | Quyết định gần hạn |
|---|---|---|
| Open Connect / ML edge cache | Không khả thi | Proxy cache + Cache-Control; CDN managed tùy chọn |
| Per-title encoding (đầy đủ Netflix) | Trung bình→Cao nếu rút gọn | **Làm** simplified ffprobe→ladder/CRF |
| Per-shot + Dynamic Optimizer + VMAF | Không khả thi | Hoãn vĩnh viễn / nghiên cứu sau |
| AV1 + Film Grain Synthesis | AV1: Trung bình; FGS: Không | AV1/VP9 optional; **không** FGS |
| VBR for live | Không khả thi (không live) | CRF/VBR **VOD** thôi |
| Buffer-based ABR ~90s | Cao | **Làm** tune hls.js buffer/ABR |
| ABR + custom congestion pacing | Không / Thấp | Chỉ config hls.js + HTTP cache |
| ML bandwidth prediction | Thấp | EWMA + metrics đơn giản |
| Predictive prefetch | Trung bình | Buffer + optional prefetch tập sau |

Chi tiết triển khai các mục khả thi cao/trung bình-cao: [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md).
