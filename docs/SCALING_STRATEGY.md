# Chiến lược scale concurrent viewers (LiveStream)

Ngày: 2026-09-06  
Phạm vi: VOD HLS self-host (Docker Compose + Caddy + Fastify/SQLite). **Không** giả định live RTMP / Open Connect.  
Baseline số liệu: [`VPS_CAPACITY.md`](./VPS_CAPACITY.md). Deploy: [`../deploy.md`](../deploy.md), cache: [`CLOUDFLARE.md`](./CLOUDFLARE.md).

---

## 1. Vấn đề gốc: API load vs media egress

LiveStream có hai đường tải **không cân bằng**:

| Đường | Thành phần | Tải điển hình khi nhiều người xem |
|---|---|---|
| **API** | Fastify + SQLite (WAL): catalog, auth, views, playback events | Nhẹ — vài KB/req, đọc WAL; **hiếm khi** là tường đầu tiên ở quy mô một VPS |
| **Media egress** | HLS fMP4 `.m4s` + `init*.mp4` (~5s/segment, ~0.6–3.5 MB) | **Chiếm gần hết** — mỗi viewer ~2–5 Mbps liên tục (mốc planning **~3 Mbps**) |

Thực tế serve hiện tại (`deploy/Caddyfile`):

- `/media/hls/*` → Caddy `file_server` từ volume `livestream_media` (**bypass Node**)
- `/api/*` → `api:4000`
- Posters / uploads khác → vẫn reverse_proxy Fastify static

Encode (`EncodeQueue`, mặc định in-process trên `api`, hoặc profile `worker`) tranh **CPU + IOPS** với egress khi admin encode giờ cao điểm — làm viewer “nghẹt” sớm hơn dù NIC còn Mbps.

**Kết luận gốc:** Scale “xem mượt, không lag/stutter/server overload” = chủ yếu **giảm egress + IOPS trên origin**, tách encode khỏi peak watch, và chỉ sau đó mới lo API/SQLite. Nâng vCPU đơn thuần **không** thay CDN khi NIC đã bão hòa.

---

## 2. Phương án scale (đánh giá từng lựa chọn)

Thang **khả thi với LiveStream hiện tại**: Cao / TB / Thấp — dựa trên code + docs đã có (Caddy HLS path, Cache-Control, compose `worker`, stub `R2_*`, Supabase posters-only).

### A. Cloudflare (hoặc CDN bất kỳ) cache `.m4s` / init

| | |
|---|---|
| **Mô tả** | Proxy orange-cloud; Cache Rules: cache `.m4s`/`init*.mp4` TTL dài; playlist `.m3u8` TTL ngắn; bypass `/api`. Origin đã set `Cache-Control` immutable cho segment (`deploy/Caddyfile`, Fastify static). |
| **Khả thi** | **Cao** — đã ghi trong [`CLOUDFLARE.md`](./CLOUDFLARE.md); không cần đổi product code |
| **Chi phí** | Free/Pro CF + egress origin giảm mạnh khi hit; Free đủ bắt đầu |
| **Độ phức tạp** | Thấp (DNS + SSL Full strict + 2–3 cache rules) |
| **Uplift concurrent (ước lượng)** | Title hot tập trung: **×5–×20** “cảm nhận” vs bare VPS ([`VPS_CAPACITY.md`](./VPS_CAPACITY.md) §5–6). Cold / nhiều title miss vẫn đập origin |
| **Rủi ro** | Cache bypass (signed URL query phá key), catalog phân tán, playlist stale nếu TTL quá dài, misconfig cache `/api` |
| **Khi nào dùng** | **Ngay** khi cần > ~80–150 concurrent ổn định trên một VPS điển hình |

### B. Object storage + CDN (R2 / S3 / Supabase Storage + public CDN URL cho HLS)

| | |
|---|---|
| **Mô tả** | Sau encode, sync/upload HLS tree lên R2/S3 (hoặc bucket public); player dùng `R2_PUBLIC_BASE_URL` / `playbackUrl` thay vì chỉ `/media/hls/...`. CF/R2 custom domain cache edge. Env stub đã có (`R2_*` trong `.env.production.example`, note [`SUPABASE.md`](./SUPABASE.md)). |
| **Khả thi** | **TB** — posters Supabase đã có; **HLS vẫn VPS disk** hôm nay; cần pipeline upload + URL wiring |
| **Chi phí** | Storage + request rẻ; egress CDN thường rẻ hơn VPS Mbps “không giới hạn marketing” khi scale lớn |
| **Độ phức tạp** | Trung–cao (sync atomic, invalidate playlist, dual-read fallback, disk cleanup) |
| **Uplift** | Origin gần như chỉ API + miss → **500–2k+** realistic; **10k** khả thi nếu CDN/egress plan đủ và catalog không phá cache |
| **Rủi ro** | Consistency encode→publish; chi phí request nhỏ lẻ; signed URL vs cacheability |
| **Khi nào dùng** | Sau khi CF cache origin đã chứng minh hit-rate; title hot / disk VPS đầy; cần vượt vài nghìn concurrent |

### C. Tách VM **origin media** vs **API**

| | |
|---|---|
| **Mô tả** | Máy A: Fastify + SQLite (+ web). Máy B: chỉ Caddy/nginx `file_server` HLS (hoặc NFS/shared volume). DNS/path `media.` hoặc reverse proxy tách host. |
| **Khả thi** | **TB** — Caddy đã tách path HLS; cần chia volume/sync và cấu hình DOMAIN phụ |
| **Chi phí** | +1 VPS (media NIC lớn hơn API) |
| **Độ phức tạp** | Trung (ops 2 máy, backup 2 nơi, deploy 2 compose) |
| **Uplift** | Chủ yếu **bảo vệ API/encode khỏi NIC media**; concurrent vẫn bị **egress media VM** trừ khi thêm CDN. Uplift thuần split: thường **×1.2–×2** comfortable nếu trước đó encode/API tranh tài nguyên |
| **Rủi ro** | Sync HLS chậm → 404; complexity ops cho team nhỏ |
| **Khi nào dùng** | Encode/API bị OOM/CPU thrash trong khi media NIC còn headroom; hoặc chuẩn bị origin “sạch” trước CDN |

### D. Nhiều VPS sau load balancer (sticky không cần cho HLS tĩnh)

| | |
|---|---|
| **Mô tả** | LB L4/L7 → N origin cùng nội dung HLS (rsync/object) + 1 primary API hoặc API stateless sau. HLS segment bất biến → **không cần sticky session**. |
| **Khả thi** | **Thấp–TB** — SQLite single-writer **không** scale-out dễ; media replication tốn công |
| **Chi phí** | N× VPS + LB |
| **Độ phức tạp** | Cao (replication, failover SQLite/Postgres Phase B, deploy) |
| **Uplift** | Tuyến tính theo N **chỉ khi** media đã replicated và API không phải SQLite đơn; thực tế team nhỏ hay kẹt DB trước |
| **Rủi ro** | Split-brain DB; chi phí > lợi ích so với CDN |
| **Khi nào dùng** | Muộn — sau object storage/CDN; hoặc HA API sau khi Postgres ([`SUPABASE.md`](./SUPABASE.md) Phase B) |

### E. Nginx/Caddy sendfile / static file server chuyên dụng (cùng VPS)

| | |
|---|---|
| **Mô tả** | Serve HLS bằng kernel sendfile, không qua Node. |
| **Khả thi** | **Cao — đã làm** (`deploy/Caddyfile` `handle_path /media/hls/*` + `file_server`) |
| **Chi phí** | 0 thêm |
| **Độ phức tạp** | Đã xong; chỉ cần **không** đẩy lại HLS qua Fastify |
| **Uplift** | So với serve qua Node: lớn về CPU; **không** tăng NIC — egress vẫn là tường |
| **Rủi ro** | Deploy sai (deploy.md diagram cũ từng ghi `/media` → api) — verify production khớp Caddyfile |
| **Khi nào dùng** | Giữ nguyên; checklist verify mỗi lần deploy ([`deploy.md`](../deploy.md) §6) |

### F. Giảm bitrate / ABR ladder thông minh hơn (phía encode)

| | |
|---|---|
| **Mô tả** | Siết `maxrate`/CRF, bỏ rung 1080 mặc định cho một số title, cap player trên mạng yếu (đã có hướng saveData/2g). Công thức: `concurrent ≈ (usable_Mbps × 0.7) / avg_bitrate` |
| **Khả thi** | **Cao** — ladder trong `encodeQueue.ts`; tune env/policy không cần CDN |
| **Chi phí** | 0 infra; đánh đổi chất lượng cảm nhận |
| **Độ phức tạp** | Thấp–trung (A/B bitrate, đo stats player) |
| **Uplift** | Avg 3→2 Mbps ≈ **+50%** concurrent cùng NIC; khóa đa số 480p còn hơn |
| **Rủi ro** | User phàn nàn “mờ”; encode lại tốn CPU |
| **Khi nào dùng** | Song song Phase 0 nếu NIC sát trần trước khi CF hit ổn định; community ưu tiên “xem được” hơn 1080p |

### G. Prefetch / player buffer (đã có)

| | |
|---|---|
| **Mô tả** | hls.js buffer 60/120, EWMA ~1.8 Mbps, prefetch master tập sau ([`features.md`](../features.md)). |
| **Khả thi** | **Cao — đã làm** |
| **Chi phí** | 0 |
| **Độ phức tạp** | — |
| **Uplift server** | **Hạn chế** — giúp client chống jitter/startup; **tăng** burst ngắn lên origin lúc prefetch; không thay CDN |
| **Rủi ro** | Prefetch quá hăng trên mạng yếu (đã có guard) |
| **Khi nào dùng** | Giữ; không kỳ vọng đây là đòn scale concurrent |

### H. Multi-CDN đa vùng (sau này)

| | |
|---|---|
| **Mô tả** | Hai+ CDN / Anycast / geo steering cho HLS URL. |
| **Khả thi** | **Thấp** hôm nay — premature |
| **Chi phí** | Cao (hợp đồng, tooling) |
| **Độ phức tạp** | Rất cao |
| **Uplift** | Latency/QoE toàn cầu ở **nhiều nghìn–chục nghìn** viewer phân tán địa lý |
| **Rủi ro** | Over-engineering; cache key lệch giữa CDN |
| **Khi nào dùng** | Sau khi đã R2/CDN đơn và có tín hiệu geo thật sự đau |

### I. Offload transcode (encode worker tách) — peak watch không bị ffmpeg giết

| | |
|---|---|
| **Mô tả** | `ENCODE_IN_PROCESS=0` trên `api` + service `worker` (`docker-compose.yml` profile `worker`), tốt nhất **máy/CPU riêng** hoặc encode off-peak. |
| **Khả thi** | **Cao** — worker đã có trong compose; tách máy = mount/volume hoặc sync HLS |
| **Chi phí** | 0 nếu cùng VPS off-peak; +1 VPS nhỏ nếu tách thật |
| **Độ phức tạp** | Thấp (cùng máy) → trung (máy riêng + shared media) |
| **Uplift** | Không tăng egress; **khôi phục** ~40–100% comfortable viewer bị mất khi encode cùng box ([`VPS_CAPACITY.md`](./VPS_CAPACITY.md) §7) |
| **Rủi ro** | Worker + API cùng disk vẫn tranh IOPS nếu không tách volume/NIC |
| **Khi nào dùng** | Ngay khi admin upload/encode giờ cao điểm overlapping peak watch |

---

## 3. Xếp hạng ROI — roadmap LiveStream

Ưu tiên theo **viewer mượt / giờ công / tiền** cho team nhỏ (1 VPS → CF → object → tách encode).

### Phase 0 — tuần này (ops, gần như 0 code)

1. **Xác nhận Caddy HLS bypass Node** trên production: response `/media/hls/.../*.m4s` từ proxy, `Cache-Control: public, max-age=31536000, immutable` ([`deploy/Caddyfile`](../deploy/Caddyfile), checklist [`deploy.md`](../deploy.md) §6).
2. **Bật Cloudflare** theo [`CLOUDFLARE.md`](./CLOUDFLARE.md): orange-cloud, SSL **Full (strict)**, Cache Rules:
   - Bypass `/api`
   - Cache `/media/hls/` `*.m4s` / `*.mp4` (Edge TTL dài, Respect origin)
   - `.m3u8` TTL 1–2 phút
3. **Không encode giờ peak**: lịch admin hoặc `ENCODE_IN_PROCESS=0` + `docker compose --profile worker` **ngoài** giờ cao điểm ([`docker-compose.yml`](../docker-compose.yml)).
4. Đo: NIC egress origin, CF cache hit ratio, CPU lúc peak; ghi avg bitrate thực từ player/stats.

**Mục tiêu Phase 0:** comfortable **~100–500+** (title hot, CF hit tốt) trên VPS 200 Mbps–1 Gbps thay vì trần bare ~几十–200.

### Phase 1 — vài tuần–1 tháng (nhỏ code + storage)

1. **Bitrate policy**: siết ladder / mặc định không đẩy mọi client 1080 nếu community không cần (encode-side + optional cap player) — nâng concurrent cùng egress.
2. **R2 (hoặc S3) cho title hot**: sau encode, publish HLS lên bucket; `R2_PUBLIC_BASE_URL` / `playbackUrl` (stub env đã có). Giữ fallback `/media/hls` khi chưa sync.
3. **Disk**: SSD + monitor IOPS; cleanup HLS cũ.
4. Optional: VM worker encode riêng nếu upload ban ngày thường xuyên.

**Mục tiêu Phase 1:** ổn định **~500–2 000** concurrent cảm nhận; origin egress chủ yếu miss + playlist + API.

### Phase 2 — khi vượt community / cần 2k–10k

1. **HLS mặc định trên object + CDN**; VPS = API + web + origin shield mỏng.
2. Tách **encode worker** hẳn (máy/spot) — peak watch không chia CPU với ffmpeg (**mục I**).
3. Cân nhắc **API/media split** (mục C) chỉ nếu API/SQLite bắt đầu nóng (telemetry spam, admin nặng) — thường sau media scale.
4. Postgres / multi-instance API ([`SUPABASE.md`](./SUPABASE.md) Phase B) **trước** khi LB nhiều API (mục D).
5. Multi-CDN (mục H) chỉ khi có số liệu geo.

**Mục tiêu Phase 2:** kiến trúc sẵn **2 000–10 000** concurrent (phụ thuộc gói CDN/egress và hit-rate), không phụ thuộc NIC một VPS.

---

## 4. Phương án tối ưu khuyến nghị (một đường chính)

**Đường chính cho LiveStream / team nhỏ:**

1. **Cloudflare cache trước Docker VPS hiện tại** (Phase 0)  
2. **R2 (hoặc tương đương) cho HLS title nóng** (Phase 1)  
3. **Tách encode worker** khỏi máy đang phục vụ peak watch (Phase 1–2)

### Vì sao thắng các hướng khác

- **E đã xong** — đừng lãng phí thời gian “tối ưu static server” thêm; bottleneck là **Mbps ra Internet**, không phải Fastify.
- **CF trước multi-VPS / LB**: một rule cache mang lại uplift lớn hơn gấp nhiều so với nhân đôi VPS + đau SQLite replication (D).
- **R2 sau CF**: chứng minh hit-rate và pattern title hot trước khi viết pipeline sync; tránh dual-storage sớm.
- **Worker encode** rẻ hơn mua NIC lớn chỉ để “vừa encode vừa stream”.
- **Split API/media (C)** hữu ích nhưng ROI thấp hơn CF+R2 cho concurrent thuần; để sau khi CDN đã ăn.
- Phù hợp stack đã document: [`CLOUDFLARE.md`](./CLOUDFLARE.md), `R2_*`, compose `worker`, Caddy HLS path.

---

## 5. Mục tiêu số theo band concurrent

Giả định avg **~3 Mbps**, VOD, title tương đối tập trung. “Kiến trúc cần” = tối thiểu để **comfortable** (không rebuffer hàng loạt).

| Band concurrent | Kiến trúc tối thiểu | Ghi chú |
|---|---|---|
| **~100** | Một VPS (2–4 vCPU, ≥4 GB, **≥500 Mbps** usable) + Caddy HLS `file_server`; **không** encode lúc peak. CF cache **khuyến nghị** nhưng chưa bắt buộc nếu NIC đủ và 1 title hot trong page cache. | Khớp tier “typical” trong [`VPS_CAPACITY.md`](./VPS_CAPACITY.md) §3 |
| **~500** | **Bắt buộc** Cloudflare (hoặc CDN) cache `.m4s` đúng rule; origin VPS vừa phải; encode off-peak hoặc worker; tránh `SIGNED_MEDIA` phá cache trừ khi thiết kế cache key. | Origin chủ yếu miss + `.m3u8` + API |
| **~2 000** | CF + **object storage (R2/S3) cho HLS hot** + CDN URL; VPS = API/SQLite + web; encode worker tách; monitor cache hit & origin egress. | Bare multi-VPS không CDN **không** đủ tin cậy ở bitrate 2–5 Mbps |
| **~10 000** | Object + CDN (plan egress rõ) làm nguồn phát chính; origin shield; encode farm/worker riêng; API có thể cần Postgres + scale-out đọc; cân nhắc multi-region CDN nếu audience toàn cầu. | SQLite single-box + disk HLS local **không** phải đường 10k |

Công thức sanity-check luôn:  
`concurrent ≈ (usable_egress_Mbps × 0.7) / avg_bitrate_Mbps` — với CDN, “usable_egress” là **capacity edge**, không phải NIC VPS.

---

## 6. Những gì KHÔNG cần làm sớm

| Tránh sớm | Lý do ngắn |
|---|---|
| Netflix **Open Connect**-like / appliance ISP | Không có leverage ISP; overkill self-host |
| Custom TCP / UDP transport / protocol riêng | hls.js + HTTPS đủ; rủi ro client lớn |
| Multi-CDN / anycast phức tạp (H) | Chưa có traffic geo chứng minh |
| LB nhiều VPS + SQLite (D) | DB và sync media đau hơn CDN |
| Đẩy lại toàn bộ HLS qua Node/Fastify | Làm xấu CPU; trái AUD-019 / Caddyfile |
| AV1/VP9 ladder mặc định trên origin peak (`ENABLE_AV1_LADDER`) | Encode nặng hơn H.264; hại concurrent |
| DRM / VMAF per-title lab / live RTMP scale | Ngoài scope VOD hiện tại |
| Tối ưu prefetch thêm như đòn scale server (G) | Chủ yếu QoE client |

---

## Kế hoạch triển khai

Chi tiết hóa Phase 0–2 thành backlog SCL-xxx (acceptance, file paths, test bắt buộc sau mỗi item, checklist master): xem [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md). Tài liệu đó bám Caddy/Compose/Cloudflare/R2 stub hiện có — không thay chiến lược ROI ở trên.

---

## Liên kết nhanh

| Tài liệu | Vai trò |
|---|---|
| [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md) | Backlog triển khai SCL-xxx + DoD test-after-each |
| [`VPS_CAPACITY.md`](./VPS_CAPACITY.md) | Ước lượng concurrent một VPS (baseline không CDN) |
| [`CLOUDFLARE.md`](./CLOUDFLARE.md) | DNS, SSL, Cache Rules |
| [`../deploy.md`](../deploy.md) | Compose, verify HLS + Cache-Control |
| [`SUPABASE.md`](./SUPABASE.md) | Posters Storage; Postgres Phase B; stub R2 |
| `deploy/Caddyfile` | `file_server` `/media/hls` |
| `docker-compose.yml` | `api` / `web` / `proxy` / profile `worker` |

---

*Tài liệu chiến lược nội bộ — cập nhật khi đổi cách publish HLS (R2) hoặc ladder bitrate mặc định.*
