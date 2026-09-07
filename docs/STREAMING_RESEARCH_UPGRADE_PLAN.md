# LiveStream — Kế hoạch nâng cấp (nghiên cứu streaming toàn cầu)

**Ngày:** 2026-09-08  
**Ngữ cảnh:** VOD self-host (Fastify + SQLite + ffmpeg HLS + React/hls.js).  
**Nguồn:** Netflix, YouTube, Disney+, Prime Video, iQIYI/WeTV + docs nội bộ FEATURE_SCORECARD / NETFLIX_FEASIBILITY / COMPETITOR_*.

## Không làm gần hạn

Open Connect, per-shot VMAF/DO, ML ABR, live realtime, DRM L1, personalization ML sâu.

## Bài học ngành → áp dụng

| Trụ cột | Pattern | LiveStream action |
|---|---|---|
| UX | Billboard, continue, facets, resume, captions memory, data saver | P0/P1 dưới đây |
| Admin | Ingest→queue→encode, wizard, movie vs series | P0-1, P0-4, P0-5 |
| Playback mượt | ABR buffer defense, prefetch first segment, CDN cache, sprite scrub | P0-2, P0-3, P2 |

## Roadmap

### P0

| ID | Tính năng | Khả thi |
|---|---|---|
| P0-1 | Upload chunked + progress % byte | Cao |
| P0-2 | ABR slow-net defense | Cao |
| P0-3 | Prefetch first HLS segment | Cao |
| P0-4 | Admin edit episode metadata UI | Cao |
| P0-5 | Wizard Series→Tập→Upload | Cao–TB |

### P1

| ID | Tính năng | Khả thi |
|---|---|---|
| P1-1 | Search facets đầy đủ (URL shareable) | Cao |
| P1-2 | Related / Vì bạn xem (rule-based) | Cao |
| P1-3 | Persist sub/audio/quality preference | Cao |
| P1-4 | Skip intro / credits | TB |
| P1-5 | Trailer URL đúng cho hover | Cao |

### P2

| ID | Tính năng |
|---|---|
| P2-1 | Encode off-peak + CF/R2 checklist |
| P2-2 | Ladder 360p slow-start |
| P2-3 | Media library + orphan cleanup |
| P2-4 | QoE dashboard theo episode |

## Gate test (bắt buộc)

Mỗi ID: Done = code + mục trong [`STREAMING_UPGRADE_TEST_RESULTS.md`](./STREAMING_UPGRADE_TEST_RESULTS.md) với bằng chứng. Không Done nếu thiếu test thật.

Template:

- Mục tiêu
- Cách tái hiện
- Điều kiện mạng
- Kỳ vọng
- Bằng chứng
- Regress (home / watch / admin login)
