# Kế hoạch triển khai scale concurrent viewers (LiveStream)

Ngày: 2026-09-06  
Nguồn chiến lược: [`SCALING_STRATEGY.md`](./SCALING_STRATEGY.md)  
Baseline capacity: [`VPS_CAPACITY.md`](./VPS_CAPACITY.md) · CF: [`CLOUDFLARE.md`](./CLOUDFLARE.md) · Deploy: [`../deploy.md`](../deploy.md)

**Phạm vi:** VOD HLS self-host (Docker Compose + Caddy + Fastify/SQLite). **Không** Open Connect, multi-CDN sớm, hay đẩy HLS lại qua Node.

**Mục tiêu số (comfortable, title tương đối tập trung, avg ~3 Mbps):**

| Phase | Concurrent target | Kiến trúc tối thiểu |
|---|---|---|
| **0** | **~100–500+** | Caddy HLS bypass + Cloudflare cache `.m4s` + encode off-peak |
| **1** | **~500–2 000** | + bitrate policy + R2 hot titles + disk/cleanup (+ optional worker VM) |
| **2** | **~2 000–10 000** | HLS mặc định object+CDN; encode tách; Postgres trước multi-API; multi-CDN chỉ khi có số liệu geo |

Công thức sanity-check (luôn dùng):  
`concurrent ≈ (usable_egress_Mbps × 0.7) / avg_bitrate_Mbps` — với CDN, “usable” là capacity edge, không phải NIC VPS.

---

## Definition of Done (DoD) — bắt buộc

1. **Test-after-each-item:** Không đóng SCL-xxx nếu chưa chạy hết mục **Test bắt buộc** của item đó và ghi kết quả (pass/fail + số đo nếu có).
2. **Không phá kiến trúc hiện có:** giữ `deploy/Caddyfile` `handle_path /media/hls/*` → `file_server`; `/api/*` → `api:4000`; không serve HLS chính qua Fastify.
3. **Tương thích docs:** mọi thay đổi ops/env phải khớp [`CLOUDFLARE.md`](./CLOUDFLARE.md), [`../deploy.md`](../deploy.md), `docker-compose.yml`, stub `R2_*` / Supabase posters-only.
4. **Không bật sớm:** `SIGNED_MEDIA=1` (phá cache key), `ENABLE_AV1_LADDER=1` trên origin peak, LB nhiều API trên SQLite.
5. **Gate phase:** chỉ sang Phase kế tiếp khi đạt mục tiêu concurrent *hoặc* đã chứng minh bottleneck còn lại (hit-rate / disk / encode) bằng số đo Phase trước.

---

## Master checklist

| ID | Name | Phase | Effort | Depends | Concurrent target uplift |
|---|---|---|---|---|---|
| SCL-001 | Verify Caddy HLS bypass + Cache-Control | 0 | S | — | Nền tảng; tránh mất ×CPU nếu HLS lỡ qua Node |
| SCL-002 | Cloudflare DNS + SSL Full (strict) | 0 | S | SCL-001 | Bật proxy; chưa cache rule thì uplift media nhỏ |
| SCL-003 | Cloudflare Cache Rules HLS | 0 | S | SCL-002 | **×5–×20** cảm nhận vs bare VPS (title hot) → **100–500+** |
| SCL-004 | Encode off-peak / worker profile cùng VPS | 0 | S | — | Khôi phục **~40–100%** comfortable bị mất khi encode peak |
| SCL-005 | Baseline metrics (NIC, CF hit, bitrate) | 0 | S | SCL-003 | Không uplift trực tiếp; **gate** Phase 0→1 |
| SCL-006 | Bitrate / ABR policy siết ladder + cap player | 1 | M | SCL-005 | Avg 3→2 Mbps ≈ **+50%** cùng egress |
| SCL-007 | R2 bucket + env stub wiring | 1 | S | SCL-005 | Nền tảng storage; chưa đổi playback |
| SCL-008 | Publish HLS hot titles → R2 sau encode | 1 | L | SCL-007 | Origin egress ↓ mạnh cho title đã sync |
| SCL-009 | `playbackUrl` / `R2_PUBLIC_BASE_URL` + fallback | 1 | M | SCL-008 | Player dùng CDN URL → band **500–2k** |
| SCL-010 | Disk SSD + monitor IOPS + cleanup HLS | 1 | M | SCL-001 | Giảm rebuffer miss; ít tăng Mbps |
| SCL-011 | Optional encode worker VM riêng | 1 | M | SCL-004 | Peak watch không chia CPU/IOPS với ffmpeg |
| SCL-012 | HLS mặc định trên object + CDN | 2 | L | SCL-009, SCL-005 | Origin = API + miss mỏng → **2k–10k** (gói CDN) |
| SCL-013 | Encode worker tách hẳn (máy/spot) | 2 | M | SCL-011 hoặc SCL-004 | Ổn định QoE lúc upload ban ngày |
| SCL-014 | Optional split API vs media VM | 2 | L | SCL-012 | ×1.2–×2 nếu API/encode tranh tài nguyên |
| SCL-015 | Postgres trước multi-instance API | 2 | L | SCL-012 | Mở đường scale-out API (không thay CDN) |
| SCL-016 | Multi-CDN gate (chỉ khi có geo pain) | 2 | L | SCL-012, số liệu geo | Latency toàn cầu; **không** làm sớm |

**Thứ tự thực thi đề xuất (first wave):** SCL-001 → SCL-002 → SCL-003 → SCL-004 → SCL-005.

---

## Phase 0 — Ops, gần như 0 code (mục tiêu ~100–500+ concurrent)

### SCL-001 (Verify Caddy HLS bypass + Cache-Control)

- **Nguồn:** SCALING_STRATEGY §3 Phase 0.1; §2 mục E; AUD-019 đã PASS trong code
- **Mục tiêu / định nghĩa xong:** Trên production (hoặc staging giống prod), mọi `.m4s` / `init*.mp4` dưới `/media/hls/` được Caddy `file_server` phục vụ từ volume, **không** đi qua Fastify; header segment `Cache-Control: public, max-age=31536000, immutable`; playlist `.m3u8` TTL ngắn (~60s). Sửa sơ đồ cũ trong `deploy.md` nếu còn ghi `/media/*` → api cho HLS.
- **Hiện trạng:** `deploy/Caddyfile` đã có `handle_path /media/hls/*` + `file_server` + header đúng; Fastify `server/src/app.ts` cũng set Cache-Control cho path qua Node; `deploy.md` § Architecture vẫn mô tả `/media/*` → api (lệch Caddyfile).
- **Việc cần làm:**
  1. So khớp production mount: `docker-compose.yml` `proxy` volume `livestream_media:/srv:ro` ↔ Caddy `root * /srv/hls`.
  2. `curl -sI https://$DOMAIN/media/hls/<episodeId>/0/seg_000.m4s` (hoặc init) — kiểm tra `Cache-Control` immutable; so với `master.m3u8` max-age ngắn.
  3. Xác nhận request segment **không** xuất hiện trong `docker compose logs api` (chỉ Caddy).
  4. Cập nhật diagram trong [`../deploy.md`](../deploy.md) cho khớp Caddyfile (HLS bypass Node).
  5. Giữ checklist [`../deploy.md`](../deploy.md) §6.
- **Phụ thuộc:** —
- **Acceptance criteria:** Segment qua proxy có immutable Cache-Control; API log không nhận GET segment; doc deploy khớp thực tế.
- **Test bắt buộc:**
  ```bash
  docker compose --env-file .env.production ps
  curl -sI "https://$DOMAIN/media/hls/<id>/master.m3u8"   # expect max-age≈60
  curl -sI "https://$DOMAIN/media/hls/<id>/0/seg_000.m4s" # expect immutable 31536000
  docker compose --env-file .env.production logs api --tail=50  # no segment GETs during play
  ```
  Expected: play 1 tập trên Watch page mượt; headers đúng như trên.
- **Effort:** S · **Priority:** P0

---

### SCL-002 (Cloudflare DNS + SSL Full strict)

- **Nguồn:** SCALING_STRATEGY §3 Phase 0.2; [`CLOUDFLARE.md`](./CLOUDFLARE.md) §1–3
- **Mục tiêu / định nghĩa xong:** Domain orange-cloud → VPS; SSL mode **Full (strict)**; `https://DOMAIN/` và `/api/health` OK; cookie admin HTTPS (`COOKIE_SECURE=true`).
- **Hiện trạng:** Doc đầy đủ; chưa giả định site đã proxy. Caddy LE hoặc Origin Cert theo CLOUDFLARE.md.
- **Việc cần làm:**
  1. Add site + NS theo CLOUDFLARE.md §1.
  2. A/AAAA Proxied → VPS; mở 80/443.
  3. SSL/TLS → **Full (strict)** — **không** Flexible.
  4. Xác nhận `.env.production`: `DOMAIN`, `CORS_ORIGIN=https://...`, `TRUST_PROXY=true`, `COOKIE_SECURE=true`.
  5. Chạy checklist CLOUDFLARE.md §7 (trừ Cache Rules — SCL-003).
- **Phụ thuộc:** SCL-001 (origin headers đúng trước khi CF cache)
- **Acceptance criteria:** UI + health + admin login HTTPS; không cảnh báo cert; CF → origin HTTPS.
- **Test bắt buộc:**
  ```bash
  curl -fsS "https://$DOMAIN/api/health"   # {"ok":true,...}
  curl -sI "https://$DOMAIN/"              # 200
  ```
  Manual: admin login + refresh session. Expected: cookie Secure hoạt động.
- **Effort:** S · **Priority:** P0

---

### SCL-003 (Cloudflare Cache Rules HLS)

- **Nguồn:** SCALING_STRATEGY §2 mục A; §3 Phase 0.2; CLOUDFLARE.md §4
- **Mục tiêu / định nghĩa xong:** Cache Rules: bypass `/api`; cache `/media/hls/` `*.m4s`/`*.mp4` Edge TTL dài + Respect origin; `.m3u8` TTL 1–2 phút; posters `/media/posters/` ~1 ngày OK. **Không** bật `SIGNED_MEDIA` trừ khi thiết kế cache key (query ký phá HIT).
- **Hiện trạng:** Origin đã set Cache-Control đúng (Caddy + Fastify). Rules CF chưa có trong repo (ops dashboard).
- **Việc cần làm:**
  1. Tạo 3–4 Cache Rules đúng bảng CLOUDFLARE.md §4.
  2. Prefer “Respect origin” cho segment.
  3. Document trong runbook nội bộ: **giữ `SIGNED_MEDIA=0`** khi dùng CF cache (xem `.env.ci` / config).
  4. Warm cache: phát 1 title hot 2 lần từ 2 client/network; so sánh `CF-Cache-Status` (HIT/MISS).
- **Phụ thuộc:** SCL-002
- **Acceptance criteria:** `/api/*` Bypass; segment lần 2 = HIT (hoặc equivalent); playlist không stale lâu sau re-encode (TTL ngắn).
- **Test bắt buộc:**
  ```bash
  curl -sI "https://$DOMAIN/api/health" | findstr /I "cf-cache cache"
  curl -sI "https://$DOMAIN/media/hls/<id>/0/seg_000.m4s"   # 1st: MISS/EXPIRED OK
  curl -sI "https://$DOMAIN/media/hls/<id>/0/seg_000.m4s"   # 2nd: expect HIT
  curl -sI "https://$DOMAIN/media/hls/<id>/master.m3u8"     # short TTL / DYNAMIC ok
  ```
  Smoke: 2–3 browser Watch cùng title — origin NIC không tăng tuyến tính với số viewer. Load nhẹ (tuỳ tool): 20–50 concurrent cùng URL segment → CF HIT ratio tăng.
- **Effort:** S · **Priority:** P0

---

### SCL-004 (Encode off-peak / worker profile cùng VPS)

- **Nguồn:** SCALING_STRATEGY §2 mục I; §3 Phase 0.3; `docker-compose.yml` profile `worker`
- **Mục tiêu / định nghĩa xong:** Peak watch **không** chạy ffmpeg full ladder trên cùng box; hoặc `ENCODE_IN_PROCESS=0` trên `api` + `docker compose --profile worker` chỉ ngoài giờ cao điểm / khi NIC/CPU rảnh. `ENABLE_AV1_LADDER=0` trên origin peak.
- **Hiện trạng:** Worker đã có (`server/src/worker.ts`, compose profile); mặc định encode in-process trên `api` (`ENCODE_IN_PROCESS` khác `"0"`). Health báo `encoder: inline|remote` (`app.ts`).
- **Việc cần làm:**
  1. Viết lịch ops: encode đêm / off-peak; cấm admin encode giờ peak nếu NIC > ngưỡng.
  2. Thử cùng VPS: `.env.production` `ENCODE_IN_PROCESS=0` trên service `api` (compose `environment` override hoặc env_file); `docker compose --env-file .env.production --profile worker up -d`.
  3. Xác nhận `/api/health` → `encoder: "remote"`; worker log poll jobs.
  4. Ghi chú [`../docs/ADMIN.md`](./ADMIN.md) / deploy: peak = không encode; `ENABLE_AV1_LADDER=0`.
- **Phụ thuộc:** — (có thể song song SCL-001–003)
- **Acceptance criteria:** Upload → job queued → worker encode → `ready`; tắt worker → job nằm queued; peak watch không thấy CPU ffmpeg 100% nếu tuân lịch.
- **Test bắt buộc:**
  ```bash
  docker compose --env-file .env.production --profile worker up -d
  curl -sS "https://$DOMAIN/api/health"   # encoder: remote
  # Admin upload 1 episode → wait ready
  docker compose --env-file .env.production stop worker
  # Upload khác → status queued; start worker → ready
  ```
  Expected: Watch vẫn play trong lúc **không** encode; nếu cố encode peak, ghi nhận CPU/IOPS tăng (baseline cho SCL-005).
- **Effort:** S · **Priority:** P0

---

### SCL-005 (Baseline metrics NIC / CF hit / bitrate)

- **Nguồn:** SCALING_STRATEGY §3 Phase 0.4; VPS_CAPACITY § checklist
- **Mục tiêu / định nghĩa xong:** Có sổ đo peak: origin egress Mbps, CPU, disk util, CF cache hit ratio (dashboard), avg bitrate thực từ player/stats hoặc BANDWIDTH ladder. Quyết định “Phase 0 đạt 100–500 comfortable?” bằng số, không cảm tính.
- **Hiện trạng:** Không có dashboard bắt buộc trong app; phụ thuộc VPS metrics + CF Analytics.
- **Việc cần làm:**
  1. Chọn nguồn: `vnstat`/`iftop`/cloud NIC graph + CF Caching analytics.
  2. Peak window 15–30 phút: ghi concurrent ước lượng (telemetry/`playback_events` nếu có), egress origin, CF HIT%.
  3. Lấy avg bitrate: player stats hoặc parse `master.m3u8` BANDWIDTH + level đang neo.
  4. Điền bảng: bare vs CF; so với mục tiêu Phase 0.
  5. **Gate:** HIT tốt + origin egress thấp → sang Phase 1 R2 chỉ khi cần >500 hoặc disk/title cold đau; nếu HIT kém → sửa cache/SIGNED_MEDIA/catalog trước khi viết pipeline R2.
- **Phụ thuộc:** SCL-003 (và nên có SCL-004 ổn định)
- **Acceptance criteria:** Một trang/runbook metrics với ít nhất 1 peak mẫu; công thức concurrent đối chiếu VPS_CAPACITY.
- **Test bắt buộc:**
  ```bash
  # Ví dụ Windows/VPS — thay bằng tool host thật
  curl -sS "https://$DOMAIN/api/health"
  curl -s "https://$DOMAIN/media/hls/<id>/master.m3u8" | findstr BANDWIDTH
  ```
  Expected: ghi được egress origin ≪ (concurrent × avg_bitrate) khi CF HIT cao; nếu không → fail gate, không nhảy R2.
- **Effort:** S · **Priority:** P0

**Phase 0 exit:** Comfortable **~100–500+** trên title hot với CF HIT ổn; encode không đè peak; metrics có số.

---

## Phase 1 — Code nhỏ + storage (mục tiêu ~500–2 000)

### SCL-006 (Bitrate / ABR policy)

- **Nguồn:** SCALING_STRATEGY §2 mục F; §3 Phase 1.1; ladder `server/src/services/encodeQueue.ts`
- **Mục tiêu / định nghĩa xong:** Siết `maxrate`/policy mặc định (hoặc flag env) để avg bitrate cộng đồng thấp hơn khi không cần 1080; optional cap player (saveData / max level) đã có hướng trong `HlsPlayer.tsx` / `Watch.tsx`. Đo lại concurrent cùng NIC/CF.
- **Hiện trạng:** Ladder 480 `maxrate 1200k`, 720 `3000k`, 1080 `5500k`; player Auto + `abrEwmaDefaultEstimate` ~1.8 Mbps → nhiều client neo 720p.
- **Việc cần làm:**
  1. Quyết định product: có bắt buộc 1080 mặc định không? Nếu không — giảm top rung hoặc env `MAX_ENCODE_HEIGHT=720`.
  2. Chỉnh `encodeQueue.ts` DEFAULT_LADDER / build ladder + document [`ADMIN.md`](./ADMIN.md).
  3. Optional: cap `hls.autoLevelCapping` / prop từ UX “tiết kiệm dữ liệu” (đã có `saveData`).
  4. Re-encode mẫu 1–2 title hot (off-peak) để đo avg mới.
  5. **Không** bật `ENABLE_AV1_LADDER` như đòn scale peak.
- **Phụ thuộc:** SCL-005 (biết bitrate hiện tại)
- **Acceptance criteria:** Title mới (hoặc re-encode) có ladder/policy mới; avg bitrate đo được giảm hoặc cap player hoạt động; QoE chấp nhận được với community.
- **Test bắt buộc:**
  ```bash
  # Sau encode mẫu
  curl -s "https://$DOMAIN/media/hls/<id>/master.m3u8"
  # Local unit/smoke nếu có script reencode
  npm test -w server -- --grep encode   # hoặc smoke encode script hiện có trong repo
  ```
  Manual: Watch Auto trên mạng tốt — level cao nhất khớp policy. Expected: BANDWIDTH top ≤ policy mới.
- **Effort:** M · **Priority:** P1

---

### SCL-007 (R2 bucket + env stub wiring)

- **Nguồn:** SCALING_STRATEGY §2 mục B; §3 Phase 1.2; [`SUPABASE.md`](./SUPABASE.md) Related stubs; `.env.production.example` `R2_*`
- **Mục tiêu / định nghĩa xong:** Bucket R2 (hoặc S3-compatible) + credentials trong `.env.production`; `R2_PUBLIC_BASE_URL` (custom domain CF) trỏ public read; API boot log integrations nhận diện R2 configured (tương tự supabase). **Chưa** bắt buộc upload HLS.
- **Hiện trạng:** Chỉ stub comment trong `.env.example` / `.env.production.example`; HLS luôn `HLS_DIR=/media/hls` trên volume; posters có thể Supabase Storage.
- **Việc cần làm:**
  1. Tạo R2 bucket + API token; optional custom domain `media.$DOMAIN`.
  2. Điền `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
  3. Thêm đọc config trong `server/src/config.ts` + log boot (không commit secrets).
  4. Smoke: SDK/cli list bucket / put object test `health.txt`.
  5. Cập nhật SUPABASE.md / SCALING note: R2 = HLS roadmap, posters vẫn Supabase-or-local.
- **Phụ thuộc:** SCL-005 (gate Phase 0)
- **Acceptance criteria:** Env có mặt; put/get object test OK qua public URL; app không phá khi R2 trống (HLS local vẫn chạy).
- **Test bắt buộc:**
  ```bash
  docker compose --env-file .env.production up -d api
  curl -fsS "https://$DOMAIN/api/health"
  curl -fsS "$R2_PUBLIC_BASE_URL/health.txt"   # sau khi put thử
  ```
  Expected: health OK; object test 200; thiếu R2 → behavior cũ (local HLS).
- **Effort:** S · **Priority:** P1

---

### SCL-008 (Publish HLS hot titles → R2 sau encode)

- **Nguồn:** SCALING_STRATEGY §3 Phase 1.2; mục B risks (atomic sync, dual-read)
- **Mục tiêu / định nghĩa xong:** Sau encode `ready`, pipeline sync cây HLS (`master.m3u8`, variant, `*.m4s`, init) lên R2 cho title/episode được đánh dấu “hot” (flag admin hoặc allowlist). Atomic đủ để tránh playlist trỏ segment chưa upload. Local disk vẫn giữ bản copy Phase 1.
- **Hiện trạng:** Encode ghi `HLS_DIR` local (`encodeQueue.ts`); không có uploader R2.
- **Việc cần làm:**
  1. Module `server/src/services/r2HlsPublish.ts` (S3 client) — upload prefix `hls/<episodeId>/...`.
  2. Hook sau encode success trong `encodeQueue.ts` (hoặc job step mới).
  3. Flag DB/env: publish all vs hot-only (bắt đầu hot-only).
  4. Retry/backoff; log fail không xoá local.
  5. Invalidate/short TTL playlist đã hiểu (CF rule SCL-003).
- **Phụ thuộc:** SCL-007
- **Acceptance criteria:** Episode hot sau encode có đủ object trên R2 khớp local; fail upload → episode vẫn play được qua `/media/hls` local.
- **Test bắt buộc:**
  ```bash
  # Encode 1 episode hot → so khớp
  curl -sI "$R2_PUBLIC_BASE_URL/hls/<id>/master.m3u8"
  curl -sI "$R2_PUBLIC_BASE_URL/hls/<id>/0/seg_000.m4s"
  curl -sI "https://$DOMAIN/media/hls/<id>/master.m3u8"   # fallback local vẫn 200
  ```
  Expected: R2 và local cùng play được bằng ffplay/hls.js smoke.
- **Effort:** L · **Priority:** P1

---

### SCL-009 (`playbackUrl` / `R2_PUBLIC_BASE_URL` + fallback)

- **Nguồn:** SCALING_STRATEGY §3 Phase 1.2; `server/src/lib/mappers.ts`; `web` Watch / `mediaUrl`
- **Mục tiêu / định nghĩa xong:** Khi HLS đã publish R2, `episode.playbackUrl` trỏ `R2_PUBLIC_BASE_URL/.../master.m3u8` (absolute); nếu chưa sync hoặc R2 tắt → giữ `/media/hls/<id>/master.m3u8`. Client đã ưu tiên `playbackUrl` (`Watch.tsx`, `resolveHoverPreview.ts`).
- **Hiện trạng:** Mapper build `playbackUrl` từ path local (+ optional `SIGNED_MEDIA` query). Stub `R2_PUBLIC_BASE_URL` chưa dùng.
- **Việc cần làm:**
  1. Lưu trạng thái `hlsStorage: local|r2` (DB column hoặc suy ra từ publish flag).
  2. `mappers.ts`: nếu r2 → absolute URL public; **không** ký query làm phá CF/R2 cache trừ khi cache key đã thiết kế.
  3. CORS/player: R2 custom domain cho phép đọc HLS (public bucket hoặc CF).
  4. Smoke hover preview + Watch full.
  5. Document fallback trong features/ADMIN.
- **Phụ thuộc:** SCL-008
- **Acceptance criteria:** API JSON `playbackUrl` absolute R2 cho episode đã publish; chưa publish → path local; phát OK cả hai.
- **Test bắt buộc:**
  ```bash
  curl -sS "https://$DOMAIN/api/..."  # episode detail — kiểm tra playbackUrl
  ```
  Manual: Watch episode R2 + episode local-only. Expected: cả hai play; Network tab segment từ host R2 khi đã publish.
- **Effort:** M · **Priority:** P1

---

### SCL-010 (Disk SSD + IOPS monitor + cleanup HLS)

- **Nguồn:** SCALING_STRATEGY §3 Phase 1.3; VPS_CAPACITY bottleneck #2
- **Mục tiêu / định nghĩa xong:** Volume media trên SSD; có monitor disk util/IOPS; policy cleanup HLS/upload cũ (admin hoặc cron) để tránh đầy đĩa — đặc biệt khi dual local+R2.
- **Hiện trạng:** Compose volume `livestream_media`; chưa có job cleanup chuẩn hoá trong plan này.
- **Việc cần làm:**
  1. Xác nhận VPS disk type (SSD); migrate volume nếu đang HDD chậm.
  2. Alert ngưỡng % đầy `docker system df` / mount `/var/lib/docker/volumes`.
  3. Script/admin: xoá HLS local của episode đã ổn định trên R2 (Phase 1 optional; Phase 2 mạnh hơn) **sau** khi playbackUrl R2 verified.
  4. Không xoá uploads nguồn nếu còn cần re-encode.
- **Phụ thuộc:** SCL-001; cleanup R2-aware phụ thuộc SCL-009
- **Acceptance criteria:** Disk headroom documented; cleanup dry-run + 1 episode thật an toàn; không 404 playback.
- **Test bắt buộc:**
  ```bash
  docker compose --env-file .env.production exec api df -h /media
  # dry-run cleanup → play lại episode
  curl -sI "$PLAYBACK_URL/master.m3u8"
  ```
  Expected: play 200 sau cleanup; df giảm.
- **Effort:** M · **Priority:** P1

---

### SCL-011 (Optional encode worker VM riêng)

- **Nguồn:** SCALING_STRATEGY §3 Phase 1.4; mục I / C một phần
- **Mục tiêu / định nghĩa xong:** Nếu upload ban ngày thường xuyên: worker (+ffmpeg) trên máy/CPU riêng; share `livestream_media` (NFS/rsync/object) hoặc encode rồi sync HLS về origin/R2. Peak watch VPS không chạy libx264.
- **Hiện trạng:** Worker cùng compose/cùng máy khi bật profile.
- **Việc cần làm:**
  1. Quyết định share: NFS volume vs encode-on-worker rồi `r2HlsPublish` trực tiếp (ưu tiên nếu SCL-008 xong).
  2. Compose/worker-only host: `ENCODE_IN_PROCESS=1` trên worker VM; api VM `=0`; cùng `DATABASE_PATH` strategy (SQLite file share **rủi ro** — ưu tiên API primary DB + worker remote poll cùng mount, hoặc chỉ publish R2 từ worker).
  3. Document ops 2 máy trong deploy supplement ngắn (không thay day-1 single compose).
  4. Giữ single-writer SQLite: **một** process migrate; worker chỉ encode.
- **Phụ thuộc:** SCL-004; tốt nhất sau SCL-008 nếu worker upload thẳng R2
- **Acceptance criteria:** Encode trên worker VM; api/proxy watch VPS CPU encode ≈ 0 lúc job chạy; episode ready + play.
- **Test bắt buộc:**
  ```bash
  # Trên API VM
  curl -sS "https://$DOMAIN/api/health"   # encoder: remote
  # Start job → top trên watch VPS không thấy ffmpeg; worker VM có ffmpeg
  ```
  Expected: ready + Watch OK.
- **Effort:** M · **Priority:** P2 (optional Phase 1; bắt buộc hơn ở Phase 2 nếu peak overlap)

**Phase 1 exit:** Comfortable **~500–2 000** cảm nhận; origin egress chủ yếu miss + playlist + API; hot titles trên R2.

---

## Phase 2 — Hướng 2k–10k (thực dụng, không Open Connect)

### SCL-012 (HLS mặc định trên object + CDN)

- **Nguồn:** SCALING_STRATEGY §3 Phase 2.1; §5 band ~2 000 / ~10 000
- **Mục tiêu / định nghĩa xong:** Mọi episode mới: publish R2 (hoặc S3) là nguồn phát chính; VPS = API + web + origin shield mỏng (local optional cache/miss). CF/R2 custom domain phục vụ hầu hết `.m4s`.
- **Hiện trạng:** Sau Phase 1 chỉ hot-path; cold vẫn local.
- **Việc cần làm:**
  1. Đổi default publish = all encodes (feature flag).
  2. Player/API mặc định absolute CDN URL.
  3. Origin Caddy HLS giữ làm shield/fallback tạm; kế hoạch giảm phụ thuộc NIC.
  4. Giám sát chi phí request R2 + CF.
  5. Load test có kiểm soát (staging): hàng trăm–vài nghìn concurrent synthetics cùng title — quan sát origin NIC ≈ phẳng.
- **Phụ thuộc:** SCL-009, SCL-005
- **Acceptance criteria:** >95% segment bytes từ CDN/R2 trong peak mẫu; origin NIC không scale theo concurrent.
- **Test bắt buộc:**
  ```bash
  # So sánh CF/R2 analytics vs VPS NIC graph trong cửa sổ peak
  curl -sI "$R2_PUBLIC_BASE_URL/hls/<id>/0/seg_000.m4s"
  ```
  Load/smoke: k6/vegeta hoặc nhiều hls.js headless — expected origin egress ổn định thấp.
- **Effort:** L · **Priority:** P1 (khi cộng đồng vượt Phase 1)

---

### SCL-013 (Encode worker tách hẳn — máy/spot)

- **Nguồn:** SCALING_STRATEGY §3 Phase 2.2; mục I
- **Mục tiêu / định nghĩa xong:** Encode farm/worker riêng (có thể spot): peak watch **không bao giờ** chia CPU/disk với ffmpeg. Pipeline: upload → queue → worker → R2 publish → DB ready.
- **Hiện trạng:** SCL-004/011 có thể mới cùng máy hoặc optional VM.
- **Việc cần làm:**
  1. Chuẩn hoá image worker-only (cùng `server/Dockerfile`).
  2. Tắt hẳn encode trên api (`ENCODE_IN_PROCESS=0` prod bắt buộc).
  3. Autoscale/spot optional — không bắt buộc K8s; một VM worker đủ team nhỏ.
  4. Alert queue depth / job age.
- **Phụ thuộc:** SCL-011 hoặc SCL-004 + SCL-008
- **Acceptance criteria:** Prod api process không spawn ffmpeg; SLA encode documented; watch QoE độc lập encode.
- **Test bắt buộc:**
  ```bash
  docker compose --env-file .env.production exec api ps aux  # no ffmpeg during job
  # worker host: ffmpeg present during job
  curl -sS "https://$DOMAIN/api/health"  # encoder: remote
  ```
  Expected: song song 1 encode + N viewers không làm rebuffer hàng loạt (so baseline SCL-005).
- **Effort:** M · **Priority:** P1

---

### SCL-014 (Optional split API vs media VM)

- **Nguồn:** SCALING_STRATEGY §2 mục C; §3 Phase 2.3
- **Mục tiêu / định nghĩa xong:** Chỉ khi telemetry/API/SQLite nóng **sau** khi media đã lên CDN: máy A API+SQLite+web; máy B (hoặc bỏ hẳn) media file_server. Uplift concurrent thuần thấp nếu đã R2 — mục tiêu bảo vệ API.
- **Hiện trạng:** Một compose: api+web+proxy(+worker).
- **Việc cần làm:**
  1. Đo: API latency/SQLite lock vs media — chỉ làm nếu API là bottleneck thật.
  2. Tách DNS `media.` hoặc path; sync HLS nếu còn local shield.
  3. **Không** nhân API trên SQLite (xem SCL-015).
- **Phụ thuộc:** SCL-012
- **Acceptance criteria:** API p95 cải thiện khi media NIC/IOPS tách; playback không 404 do sync trễ.
- **Test bắt buộc:** health + Watch E2E; chaos: dừng media VM → fallback R2 vẫn play nếu SCL-012 xong.
- **Effort:** L · **Priority:** P3 (chỉ khi số liệu đòi hỏi)

---

### SCL-015 (Postgres trước multi-instance API)

- **Nguồn:** SCALING_STRATEGY §3 Phase 2.4; mục D; [`SUPABASE.md`](./SUPABASE.md) Phase B
- **Mục tiêu / định nghĩa xong:** Trước mọi LB nhiều API: migrate SQLite → Postgres (`DATABASE_URL`) theo roadmap SUPABASE Phase B. **Không** scale-out API khi còn single-writer SQLite.
- **Hiện trạng:** SQLite `better-sqlite3` production; `DATABASE_URL` stub chưa dùng.
- **Việc cần làm:**
  1. Theo SUPABASE.md Phase B steps 1–6 (schema, repo layer, migrate, dual-read, cutover).
  2. Chỉ sau cutover mới cân nhắc horizontal API đọc.
  3. Media vẫn CDN/R2 — item này **không** thay SCL-012.
- **Phụ thuộc:** SCL-012 (ưu tiên media trước); team sẵn sàng downtime/migration window
- **Acceptance criteria:** App chạy Postgres; row counts khớp; API health OK; encode jobs không mất.
- **Test bắt buộc:** full migrate staging → smoke admin + Watch + encode; backup/restore drill.
- **Effort:** L · **Priority:** P2

---

### SCL-016 (Multi-CDN gate — chỉ khi có geo pain)

- **Nguồn:** SCALING_STRATEGY §2 mục H; §3 Phase 2.5; §6 “Không cần làm sớm”
- **Mục tiêu / định nghĩa xong:** **Không triển khai** trừ khi có số liệu RTT/rebuffer theo vùng sau SCL-012. Nếu làm: geo steering hai CDN, thống nhất cache key, không đổi product HLS.
- **Hiện trạng:** Premature; một CF/R2 đủ.
- **Việc cần làm:**
  1. Thu thập geo metrics (CF analytics / player RTT).
  2. Viết ADR ngắn go/no-go.
  3. Nếu go: dual origin URL hoặc DNS steering — ngoài scope code hiện tại cho đến khi ADR pass.
- **Phụ thuộc:** SCL-012 + bằng chứng geo
- **Acceptance criteria:** ADR quyết định; nếu no-go → đóng item là “wont do”; nếu go → plan con riêng.
- **Test bắt buộc:** Chỉ khi go — canary region A/B HIT + QoE. Expected: cải thiện vùng đau mà không phá cache key.
- **Effort:** L · **Priority:** P3 (gate)

**Phase 2 exit:** Kiến trúc sẵn **2 000–10 000** concurrent phụ thuộc gói CDN/egress; NIC một VPS không còn là trần.

---

## Những việc cố ý không đưa vào backlog này

| Không làm | Lý do (SCALING_STRATEGY §6) |
|---|---|
| Netflix Open Connect / appliance ISP | Không có leverage; overkill |
| Custom TCP/UDP protocol | hls.js + HTTPS đủ |
| Đẩy HLS lại qua Fastify | Trái Caddyfile / AUD-019 |
| `ENABLE_AV1_LADDER` mặc định peak | Encode nặng, hại concurrent |
| LB nhiều VPS + SQLite | Đau DB/sync hơn CDN |
| Prefetch player như đòn scale server | Chủ yếu QoE client (đã có) |

---

## Liên kết nhanh

| Tài liệu | Vai trò |
|---|---|
| [`SCALING_STRATEGY.md`](./SCALING_STRATEGY.md) | Chiến lược + ROI phases |
| [`VPS_CAPACITY.md`](./VPS_CAPACITY.md) | Baseline một VPS không CDN |
| [`CLOUDFLARE.md`](./CLOUDFLARE.md) | DNS / SSL / Cache Rules |
| [`../deploy.md`](../deploy.md) | Compose verify |
| [`SUPABASE.md`](./SUPABASE.md) | Posters; Postgres Phase B; stub R2 |
| `deploy/Caddyfile` | HLS `file_server` |
| `docker-compose.yml` | api / web / proxy / profile `worker` |
| `.env.production.example` | `R2_*`, `ENABLE_AV1_LADDER` |

---

*Kế hoạch triển khai nội bộ — cập nhật ID khi đổi cách publish HLS hoặc ladder mặc định. Mọi SCL-xxx chỉ “Done” sau khi Test bắt buộc pass.*
