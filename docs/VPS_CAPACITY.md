# Ước lượng sức chứa viewer đồng thời (một VPS)

Ngày: 2026-09-05  
Phạm vi: **LiveStream / StreamSqueeze** trên **một VPS**, **không** giả định Cloudflare cache / CDN ngoài (phần uplift ghi riêng).  
Ngữ cảnh: VOD HLS (không live RTMP). Số liệu là **ước lượng bảo thủ**, không load-test production.

---

## Tóm tắt kiến trúc liên quan (từ codebase)

| Thành phần | Hành vi thực tế |
|---|---|
| ABR ladder | `encodeQueue.ts`: 480p ~1.0–1.2 Mbps video + ~96 kbps audio; 720p ~2.5–3.0 + 128k; 1080p ~5.0–5.5 + 160k; optional 1440/2160 nếu nguồn đủ cao. CRF + `maxrate` (thường **dưới** maxrate). |
| Segment | HLS fMP4, `-hls_time 5` → ~5s/segment. Kích thước thô ~0.6–3.5 MB/segment tùy rung. |
| Serve media | Docker: Caddy `file_server` cho **`/media/hls/*`** từ volume (bypass Node). Posters/subs/uploads vẫn `reverse_proxy` → Fastify `@fastify/static`. |
| Cache-Control | `.m4s` / `init*.mp4`: `public, max-age=31536000, immutable`. `.m3u8`: `max-age=60`. |
| API | Fastify + **SQLite** (`better-sqlite3`, WAL). Catalog / auth / views / playback events — tải nhẹ so với egress HLS. |
| Encode | `EncodeQueue` **tuần tự** (1 job ffmpeg cùng lúc), mặc định in-process trên `api` (hoặc profile `worker`). libx264 đa luồng → **ngốn CPU + ghi đĩa** mạnh khi encode. |
| Compose | `api` + `web` + `proxy` (+ optional `worker`) chia CPU/RAM/disk của **cùng một máy**. |

Player (`HlsPlayer`): Auto ABR, buffer 60/120, `abrEwmaDefaultEstimate` ~1.8 Mbps — nhiều client sẽ neo quanh **720p** trên mạng tốt, một phần lên 1080p.

---

## 1. Bottleneck xếp hạng (một VPS, không CDN)

Thứ tự **thường gặp** khi nhiều người xem cùng lúc (encode **không** chạy):

| # | Bottleneck | Vì sao |
|---|---|---|
| **1** | **Egress bandwidth** | Mỗi viewer ~ vài Mbps liên tục. NIC 100 Mbps / 500 Mbps / 1 Gbps gần như luôn hết trước CPU serve (Caddy đọc file tĩnh). |
| **2** | **Disk IOPS / throughput** | Nhiều title khác nhau → đọc ngẫu nhiên khỏi page cache. Volume Docker trên disk chậm (HDD / shared cloud volume) làm rebuffer dù còn “Mbps trên giấy”. Cùng một title hot → OS cache giúp nhiều. |
| **3** | **CPU (serve)** | Caddy `file_server` + TLS rẻ hơn encode rất nhiều. Chỉ trở thành vấn đề khi hàng trăm kết nối + gzip/TLS trên máy yếu, hoặc khi **encode** tranh CPU. |
| **4** | **RAM** | Page cache HLS + buffer container. 1–2 GB dễ thrash khi encode + serve; 4–8 GB thoải mái hơn cho cache nóng. |
| **5** | **SQLite locks** | WAL giúp đọc catalog/views. Ở quy mô “một VPS streaming”, API << media; khóa SQLite **hiếm khi** là trần viewer (trừ spam telemetry / admin nặng). |
| **6** | **Node event loop** | HLS chính **không** đi qua Node (Caddy). Node chỉ API + `/media` non-HLS. Trần viewer gần như **không** do event loop — trừ khi tắt Caddy HLS path và ép mọi thứ qua Fastify static. |

Khi **admin encode trên cùng box**: CPU encode và ghi đĩa nhảy lên hạng 1–2 tạm thời; egress vẫn quan trọng nhưng máy “nghẹt” sớm hơn.

---

## 2. Bảng giả định (planning)

| Giả định | Giá trị dùng để ước lượng | Ghi chú |
|---|---|---|
| Mix Auto ABR trung bình | **2–5 Mbps / viewer** (lấy **~3 Mbps** làm mốc tính) | 480≈1.1–1.3; 720≈2.5–3.2; 1080≈4.5–5.7. CRF thường thấp hơn maxrate. |
| Peak đồng thời | Spike ngắn 1.2–1.5× “comfortable” | Startup buffer / seek làm burst ngắn. |
| Segment | ~5 s; ~0.6–3.5 MB | Burst I/O theo nhịp playlist. |
| Hit cùng title phổ biến | Cao (RAM/disk cache + optional CF) | Nhiều title “đuôi dài” → IOPS xấu hơn. |
| Usable egress | **~70%** bandwidth quảng cáo | TCP overhead, burst khác title, overhead TLS, ISP shaping. |
| Encode trên box | Tắt hoặc off-peak cho số “comfortable” | Bật encode → giảm rõ (mục 7). |
| Không CDN / không CF cache | Mọi `.m4s` về origin | Đây là baseline tài liệu này. |

**Công thức (mục 4):**

```text
concurrent ≈ (usable_egress_Mbps × 0.7) / avg_bitrate_Mbps
```

Với `usable_egress_Mbps` = bandwidth NIC “trên giấy” (hoặc limit provider). Hệ số **0.7** đã nằm trong công thức — đừng nhân 0.7 lần nữa.

Ví dụ: NIC 500 Mbps, avg 3 Mbps → `(500 × 0.7) / 3 ≈ 117` viewer lý thuyết theo băng thông. Trần thực tế thường **thấp hơn** vì IOPS/CPU/encode.

---

## 3. Ước lượng theo tier VPS (bảo thủ)

Giả định: Caddy serve HLS từ disk như compose hiện tại; **không** CDN; **không** encode song song giờ cao điểm; avg **~3 Mbps** (khoảng 2–5).  
**Comfortable** = xem mượt phần lớn thời gian. **Hard ceiling** = bắt đầu lag/rebuffer hàng loạt.

### 1 vCPU / 1–2 GB / 100 Mbps

| | Concurrent viewers |
|---|---|
| Comfortable | **12–25** |
| Hard ceiling | **25–40** |

- Egress: `(100 × 0.7) / 3 ≈ 23` — khớp vùng comfortable.  
- RAM 1 GB: page cache mỏng; encode cùng lúc gần như **cấm** nếu muốn giữ viewer.  
- Đĩa cloud chậm → lấy cận dưới.

### 2 vCPU / 4 GB / 200–500 Mbps

| NIC | Comfortable | Hard ceiling |
|---|---|---|
| ~200 Mbps | **30–50** | **50–70** |
| ~500 Mbps | **60–100** | **100–140** |

- Egress lý thuyết 500 Mbps ≈ 117 @ 3 Mbps; cắt bảo thủ vì Docker overhead, TLS, đĩa, spike ABR.  
- 4 GB đủ cache một title hot vừa phải.  
- Đây là tier “typical” self-host nhỏ / cộng đồng.

### 4 vCPU / 8 GB / 1 Gbps

| | Concurrent viewers |
|---|---|
| Comfortable | **120–200** |
| Hard ceiling | **200–280** |

- Egress: `(1000 × 0.7) / 3 ≈ 233`.  
- Comfortable thấp hơn ceiling vì IOPS đa-title và headroom.  
- **Không** phải Netflix-scale: vài trăm viewer đã là “máy origin đơn đang chịu tải thật”, không phải hàng nghìn ổn định.

**Lưu ý mix bitrate:** nếu hầu hết client khóa 1080p (~5 Mbps), chia các khoảng trên cho ~1.5–1.7. Nếu nhiều 480p (mạng yếu / save-data), có thể cao hơn ~30–50%.

---

## 4. Công thức nhanh

```text
concurrent ≈ (usable_egress_Mbps × 0.7) / avg_bitrate_Mbps
```

| `avg_bitrate_Mbps` gợi ý | Khi nào dùng |
|---|---|
| 2.0 | Nhiều 480p / mạng yếu / cap ABR |
| **3.0** | Mix Auto điển hình (mốc tài liệu này) |
| 5.0 | Đa số 1080p ổn định |

Sau khi có số theo bandwidth, **giảm thêm** nếu: HDD, encode đang chạy, nhiều title khác nhau, hoặc media đi qua Node thay vì Caddy.

---

## 5. Việc gì làm tăng số viewer

| Biện pháp | Tác động kỳ vọng (order-of-magnitude) |
|---|---|
| **Cloudflare proxy cache** cho `.m4s` / init (playlist TTL ngắn) | Với **1–vài title hot**: origin egress giảm mạnh → thường **×5–×20** viewer “cảm nhận” so với bare VPS (xem mục 6). Nhiều title cold vẫn đập origin. |
| **Đĩa media tách / SSD nhanh** | Giảm rebuffer khi miss cache; nâng trần IOPS, ít khi tăng bandwidth. |
| **Tắt encode on-box giờ cao điểm** | Giữ gần đủ số mục 3; encode lúc thấp điểm hoặc máy worker riêng. |
| **CDN / R2 + signed URL** (optional) | Origin gần như chỉ API + cache miss; scale viewer theo CDN, không theo NIC VPS. |
| Giữ Caddy `file_server` cho HLS | Đã có trong compose — **đừng** đẩy lại toàn bộ HLS qua Fastify nếu chăm capacity. |

Chi tiết CF: [`CLOUDFLARE.md`](./CLOUDFLARE.md). Deploy: [`deploy.md`](../deploy.md).

**Roadmap scale (CDN → R2 → tách encode, ROI theo phase):** xem [`SCALING_STRATEGY.md`](./SCALING_STRATEGY.md) — tách rõ API vs media egress, đánh giá từng phương án, và mục tiêu concurrent 100 / 500 / 2k / 10k. Tài liệu này chỉ ước lượng **một VPS**; chiến lược nâng band nằm ở SCALING_STRATEGY.

---

## 6. Kết luận thẳng (honest verdict)

| Kịch bản | Max “user thật” hợp lý |
|---|---|
| **Một VPS, không CDN** | **Vài chục → khoảng 150–250** concurrent mượt tùy tier (100 Mbps → ~20; 500 Mbps–1 Gbps → ~80–200). Vượt ~300 trên một origin tự host là **lạc quan / rủi ro cao** trừ khi bitrate rất thấp và đĩa cực khỏe. |
| **Cùng VPS + Cloudflare cache** (title tập trung, rule cache `.m4s` đúng) | Thường lên **hàng trăm**; community nhỏ với 1–2 phim hot có thể **~500–2000** concurrent *cảm nhận* trong khi origin chỉ phục vụ miss + playlist + API. **Không** đảm bảo nếu catalog phân tán / cache bypass / signed URL phá cache. |

LiveStream là VOD self-host (SQLite + disk HLS), không Open Connect. Đừng kỳ vọng nghìn viewer ổn định **trên NIC VPS trần** ở bitrate 2–5 Mbps.

---

## 7. Encode trên cùng máy — viewer giảm bao nhiêu?

`EncodeQueue` chạy **một** job ffmpeg tại một thời điểm, nhưng libx264 (full ladder 480/720/1080, filter_complex split) thường:

- Chiếm **hầu hết CPU** (đặc biệt 1–2 vCPU),
- Ghi tuần tự nhiều variant + segment lên cùng volume `livestream_media`,
- Tranh IOPS với Caddy đang đọc HLS cho viewer.

| Tier khi đang encode full ABR | Comfortable viewer còn lại (ước lượng) |
|---|---|
| 1 vCPU / 100 Mbps | ~**30–50%** số mục 3 → khoảng **5–12** (dễ rebuffer) |
| 2 vCPU / 200–500 Mbps | ~**40–60%** → khoảng **20–60** tùy NIC |
| 4 vCPU / 1 Gbps | ~**50–70%** → khoảng **70–140** nếu còn headroom core |

**Quy tắc thực dụng:** coi encode giờ cao điểm = **mất khoảng một nửa** sức chứa comfortable (đôi khi hơn trên máy 1–2 vCPU). Tách `worker` profile sang máy khác, hoặc encode đêm, hoặc GPU/NVENC (ngoài scope hiện tại) nếu cần vừa encode vừa phục vụ đông.

Optional `ENABLE_AV1_LADDER` / VP9 còn nặng hơn H.264 — tránh bật trên origin đang phục vụ peak.

---

## Checklist vận hành ngắn

1. Đo bitrate thực tế từ `master.m3u8` / stats player, không chỉ tin maxrate.  
2. Monitor egress NIC + disk util + CPU lúc peak và lúc encode.  
3. Xác nhận response `.m4s` có `Cache-Control` immutable (Caddy + origin).  
4. Nếu cần > ~100–150 concurrent ổn định: lên kế hoạch **CF cache hoặc CDN**, đừng chỉ nâng vCPU.

---

*Tài liệu ước lượng kỹ thuật nội bộ — cập nhật khi ladder bitrate hoặc cách serve HLS đổi.*
