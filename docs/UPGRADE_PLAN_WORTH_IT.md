# UPGRADE_PLAN có đáng làm không? (cost / benefit)

Ngày: 2026-09-05  
Đối tượng: [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md)  
Bối cảnh: LiveStream = VOD local / self-host nhỏ (SQLite, single-server Fastify, hls.js, Windows ffmpeg, catalog demo) — **không** phải Netflix.

**Verdict ngắn:** **Đáng làm một phần** — chủ yếu **P1 (ABR buffer + recovery)** và **P2 (Cache-Control phân loại)**. Phần còn lại (CRF per-title, AV1, metrics suite, prefetch tập sau) **trì hoãn hoặc bỏ** so với ưu tiên sản phẩm khác trong [`EVALUATION.md`](./EVALUATION.md).

---

## 1. Tóm tắt hiện trạng (không double-count benefit)

LiveStream **đã có** phần lớn “cảm giác streaming hiện đại” mà plan Netflix thường hứa:

| Đã có (đã xác minh code / EVALUATION) | Ý nghĩa ROI |
|---|---|
| HLS ABR multi-rung (admin upload full ladder 480/720/1080; +1440/2160 nếu nguồn cao) | Client đã chọn rung theo bandwidth — đây là substitute chính của Netflix ABR |
| `HlsPlayer`: selector Tự động / level + `localStorage` `livestream.hls.quality` | User kiểm soát chất lượng; Auto + `startLevel` ~720p+ tránh kẹt 480p |
| hls.js: `maxBufferLength=30`, `maxMaxBufferLength=60`, `abrEwmaDefaultEstimate=2.5 Mbps` | ABR buffer **đã bật**; chỉ còn room tune, không phải “thêm ABR từ zero” |
| Resume + continue-watching (`Watch.tsx`, `PUT /api/me/history`, Home) | Netflix “resume” gần như xong; polish nhỏ thôi |
| Metrics thật: views, ranking, ratings; Admin CRUD + encode full ladder | Vòng sản phẩm ingest/discover đã ổn định hơn nhánh “Netflix encode research” |
| `/media` `Cache-Control: public, max-age=3600` | Cache **đã có** (đồng nhất); chưa tách `.m4s` vs `.m3u8` |
| Encode: CBR ladder cố định + `probeHeight` cap; `-hls_time 5`; Windows init/master recovery | Pipeline VOD dùng được; chưa CRF / per-title complexity |

**Hệ quả:** lợi ích biên của plan Netflix **không** bằng “từ không có ABR → có ABR”. Phần lớn ROI Netflix-class đã bị substitute. Sau buffer + cache headers đúng, đường cong lợi ích **giảm mạnh**.

---

## 2. Bóc tách từng hạng mục trong UPGRADE_PLAN

### P1 — ABR player tuning + forward buffer + fatal recovery

| | |
|---|---|
| **Effort** | **S** · ~2–4 giờ (config + throttle test + typecheck) |
| **Benefit (scale này)** | Cao tương đối: giảm stall trên Wi‑Fi/LAN yếu; recover sau lỗi segment thay vì “chết” UI. Local LAN gần như đã đủ nhanh — lợi ích rõ hơn khi throttle / public / vài client đồng thời. |
| **Risk / complexity** | Thấp. Buffer lớn hơn → RAM/disk cache browser ↑; `startLevel` 720p + estimate cao có thể stall lần đầu trên 2G. |
| **Marginal gain vs status quo** | **High** (trong các mục còn lại của plan) — vì status quo buffer 30/60 còn thấp hơn “reservoir” mục tiêu và **không** gọi `recoverMediaError` / `startLoad`. |
| **Worth doing?** | **Yes** |

Optional `navigator.connection` → `startLevel` thấp: **Yes** nếu làm cùng P1 (+~1h); không đáng tách phase riêng.

---

### P2 — Cache-Control dài cho segment + recipe proxy

| | |
|---|---|
| **Effort** | **S** · ~2–3 giờ (header nhánh + `deploy.md` + `curl -sI`) |
| **Benefit** | **Local/dev: thấp–trung bình** (browser vẫn cache một phần). **Self-host HTTPS + reverse proxy + vài viewer: trung bình** — giảm hit Node cho `.m4s` bất biến. Không thay Open Connect. |
| **Risk** | Thấp–trung bình: re-encode cùng `episodeId` có thể bị client giữ segment cũ nếu URL không đổi; playlist cache ngắn + `rm` outDir encode hiện tại đủ hầu hết case. |
| **Marginal gain** | **Medium** nếu có (hoặc sắp có) deploy công khai; **Low** nếu chỉ localhost. |
| **Worth doing?** | **Yes** nếu deploy/public trong tầm mắt; **Later** nếu chỉ demo local thuần. Khuyến nghị: làm cùng đợt P1 vì rẻ. |

---

### P3 — CRF + simplified per-title ladder

| | |
|---|---|
| **Effort** | **M** · ~1–2 ngày (probe mở rộng, CRF+maxrate, master BANDWIDTH, test Windows ffmpeg bundled, re-encode vài tập) |
| **Benefit** | Catalog nhỏ / demo: tiết kiệm disk **có ích nhưng không khẩn** — ladder CBR đã cho ABR hoạt động. Lợi thật: dung lượng HLS ↓ và chất lượng cảm nhận ổn hơn trên nội dung “dễ/khó”. Không cải thiện mượt mạng yếu bằng P1. |
| **Risk** | Trung bình: flag `-crf:v:i` trên ffmpeg Windows cũ; thời gian encode thay đổi; phải re-encode catalog cũ để thấy lợi; progress encode vẫn 5%→100%. |
| **Marginal gain** | **Medium** (disk/quality) · **Low** (smoothness playback). |
| **Worth doing?** | **Later** — sau P1/P2 và khi disk hoặc chất lượng visual thành pain thật. Không phải MVP “mượt mạng yếu”. |

---

### P4 — Optional AV1 / VP9 + H.264 fallback

| | |
|---|---|
| **Effort** | **L** · ~3–5+ ngày (codec, master CODECS, flag env, kiểm chứng fMP4+MSE, Safari fallback, disk gấp đôi) |
| **Benefit** | Bandwidth ↓ trên client hỗ trợ; **encode CPU Windows rất chậm**; queue tuần tự dễ tắc; catalog demo không cần. |
| **Risk** | Cao: tương thích, thời gian encode, vận hành flag, disk. |
| **Marginal gain** | **Low** tại quy mô hiện tại. |
| **Worth doing?** | **Skip** (gần hạn). Chỉ mở lại khi có traffic public thật + disk/CPU chấp nhận được. |

---

### P5 — Health metrics rebuffer + polish resume

#### 5a. POST playback events / bảng `playback_events`

| | |
|---|---|
| **Effort** | **M** · ~4–8 giờ (client events + route Zod + SQLite + spam guard tối thiểu) |
| **Benefit** | Hữu ích khi có nhiều user / A/B ABR. 1– vài viewer local: data gần như nhiễu; team nhỏ ít khi đọc dashboard. |
| **Risk** | Endpoint spam; schema/ops thêm; không có ML follow-up trong tầm mắt. |
| **Marginal gain** | **Low** (ops insight) · không trực tiếp làm mượt hơn. |
| **Worth doing?** | **Later** / gần **Skip** nếu không có kế hoạch đọc số liệu. |

#### 5b. Resume polish (flush `pause`/`beforeunload`; filter continue gần hết tập)

| | |
|---|---|
| **Effort** | **S** · ~1–3 giờ |
| **Benefit** | UX nhỏ nhưng thật (mất ≤8s tiến độ; continue list sạch hơn). Resume **đã có**. |
| **Risk** | Thấp. |
| **Marginal gain** | **Low–Medium** (UX), không phải ABR. |
| **Worth doing?** | **Yes** nếu còn ½ ngày sau P1; không block “mượt mạng yếu”. |

---

### Phase phụ — Prefetch tập sau

| | |
|---|---|
| **Effort** | **S–M** · ~3–6 giờ |
| **Benefit** | Giảm chờ khi binge “Tập sau”. Forward buffer P1 đã cover phần lớn “đói segment” trong cùng tập. |
| **Risk** | Tốn bandwidth nếu user không chuyển tập; memory nếu spawn Hls ẩn. |
| **Marginal gain** | **Low** sau P1. |
| **Worth doing?** | **Later** (sau P1 ổn) hoặc **Skip** nếu ít binge. |

---

### Won’t do (đã đúng trong plan) — xác nhận

Open Connect, DO/VMAF/per-shot, FGS, custom TCP/CC, live VBR, ML bandwidth, DRM/CDN bắt buộc: **Skip vĩnh viễn / research only** — đúng với non-goals và quy mô SQLite single-server.

---

## 3. Ma trận ROI

Xếp theo **đáng làm trước** cho LiveStream hiện tại (không phải “đẹp trên giấy Netflix”).

| Hạng mục | Effort | Benefit scale này | Marginal gain | Risk | ROI rank | Quyết định |
|---|---|---|---|---|---|---|
| P1 Buffer + ABR + fatal recovery (+ optional connection) | S | Cao (weak net) | High | Low | **1** | **Yes** |
| P2 Cache-Control `.m4s` / `.m3u8` + deploy recipe | S | TB (public) / thấp (local) | Medium | Low | **2** | **Yes** / Later local-only |
| P5b Resume flush + filter continue | S | TB (UX) | Low–Med | Low | **3** | **Yes** nếu còn giờ |
| P3 CRF + simplified per-title | M | TB (disk/quality) | Medium | Med | **4** | **Later** |
| Prefetch tập sau | S–M | Thấp–TB | Low | Med | **5** | **Later** |
| P5a Rebuffer events / SQLite | M | Thấp (ít user) | Low | Med | **6** | **Later / Skip** |
| P4 AV1/VP9 dual ladder | L | Thấp (CPU/disk) | Low | High | **7** | **Skip** |

**So sánh ngoài plan (từ EVALUATION — thường ROI cao hơn P3–P5a):** progress encode mịn, retry job failed, phụ đề VTT, thumbnail scrub, resumable upload — nếu mục tiêu là “site dùng mỗi ngày”, ưu tiên các mục đó **trước** AV1/metrics/ML-adjacent.

---

## 4. Kịch bản nên làm tối thiểu (MVP upgrade)

**Mục tiêu:** mượt nhất trên mạng yếu với ít giờ nhất — **không** “làm Netflix”.

1. **P1 bắt buộc**
   - `maxBufferLength` 60 / `maxMaxBufferLength` 120
   - Fatal: thử `recoverMediaError` / `startLoad` trước khi set error UI
   - Optional: `effectiveType` 2g/slow-2g → `startLevel` thấp; cân nhắc hạ nhẹ `abrEwmaDefaultEstimate` nếu stall lúc start 720p
2. **P2 nên kèm** (nếu có hoặc sắp có reverse proxy / HTTPS)
   - `.m4s` / init: `max-age` dài + `immutable`
   - `.m3u8`: cache ngắn
3. **Không** bắt buộc P3/P4/P5a/prefetch trong MVP

**Ước lượng tổng MVP:** ~0.5–1 ngày làm việc + test throttle (Slow 3G / 1–2 Mbps) theo gate trong plan.

---

## 5. Kịch bản không nên làm / trì hoãn

| Không làm gần hạn | Lý do ngắn |
|---|---|
| **Toàn bộ plan tuần tự P1→P5→P4** | Over-invest; diminishing returns sau buffer+cache |
| **P4 AV1/VP9** | Encode Windows chậm, disk đôi, catalog demo không amortize |
| **P5a playback_events production** | Không có người đọc telemetry; spam surface |
| **Prefetch tập sau sớm** | P1 đã forward-buffer; lợi ích binge nhỏ |
| **P3 CRF “để giống Netflix” trước khi pain disk/quality** | Không sửa stall mạng yếu; effort M + risk ffmpeg |
| **Bất kỳ mục Won’t do** | Đúng — giữ nguyên |

---

## 6. Verdict cuối

### **Đáng làm một phần**

Phần nên làm: **P1 + P2** (+ **P5b resume polish** nếu còn giờ).  
Không đáng làm toàn bộ plan; **chưa** ưu tiên P3/P4/P5a/prefetch trước pain thật hoặc trước UX P0/P1 trong EVALUATION.

**Lý do gắn LiveStream (3–5):**

1. **ABR + full ladder + quality selector đã có** — plan không “mở khóa streaming”; chỉ tinh chỉnh biên.
2. **Single-server + SQLite + vài (hoặc zero) concurrent public viewer** — Open Connect/CDN-class và dual-codec ladder không amortize; Cache-Control đủ substitute cho P2.
3. **hls.js đã là ABR engine** — tăng buffer + recovery là đòn bẩy rẻ nhất cho mạng yếu; ML/metrics suite không cần.
4. **Windows ffmpeg + queue in-process tuần tự** — P4 (và phần nào P3 phức tạp) tăng thời gian encode / rủi ro toolchain hơn lợi bandwidth catalog demo.
5. **Resume / admin / views thật đã xong** — đừng đếm lại như benefit của upgrade Netflix; thời gian nên đổ vào P1/P2 hoặc gap UX thật (subtitle, progress encode, retry job).

---

## 7. Recommendation theo ngân sách thời gian

### Nếu còn **1–2 ngày**
- **Ngày 1:** P1 đầy đủ + test throttle bắt buộc; optional connection-aware start.
- **Nửa ngày còn lại:** P2 headers + cập nhật `deploy.md`; nếu còn slot → P5b flush history.
- **Không** đụng P3/P4/P5a/prefetch.
- Nếu mục tiêu “dùng mỗi ngày” quan trọng hơn smoothness: cân nhắc **đổi** nửa ngày sau P1 sang retry job / encode progress thay vì P3.

### Nếu còn **1–2 tuần**
- Tuần 1 đầu: **P1 + P2** xong và ổn định.
- Phần lớn tuần: ưu tiên **EVALUATION P0/P1 sản phẩm** (encode progress, retry failed, subtitle/thumbnail, upload lớn) — ROI cảm nhận user cao hơn CRF/AV1.
- Chỉ khi disk HLS đau hoặc chuẩn bị public nhiều viewer: **P3 CRF rút gọn** (1–2 ngày), không dual AV1.
- Prefetch tập sau: optional cuối tuần nếu đo được binge thật.
- **P4 + P5a:** giữ backlog; không commit vào sprint trừ khi có yêu cầu rõ (bandwidth cost / cần số liệu stall).

---

## Ghi chú trung thực

- Plan gốc xếp P1→P2→P3→P5→P4 là **hợp lý về thứ tự kỹ thuật**, nhưng **không** có nghĩa mọi phase đều worth it ở scale này.
- Nhiều kỹ thuật Netflix đã được **substitute** (ABR ladder, hls.js EWMA, resume, cache 1h, admin full ladder). Sau **ABR buffer + cache headers**, lợi ích biên của “làm giống Netflix hơn” **nhỏ**.
- Đánh giá này **không** khuyến khích rubber-stamp toàn bộ [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md).
