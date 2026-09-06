# Audit Upgrade — Test Results

**Plan:** [`AUDIT_UPGRADE_PLAN.md`](./AUDIT_UPGRADE_PLAN.md)  
**Started:** 2026-09-05  
**Completed (program):** 2026-09-05  
**Gap close-out:** 2026-09-05 (AUD-028 + remaining ops gaps)

## Completion summary

| Metric | Value |
|---|---|
| Total IDs | 28 |
| PASS | 28 |
| SKIP | 0 |
| FAIL | 0 |
| **Completion** | **28/28 (100%)** |

---

## Master status table

| ID | Status | Evidence | Notes |
|---|---|---|---|
| AUD-001 | PASS | API poll job#4: 56 distinct values 6–98 then 100; build server OK | stderr `\r` `time=` parse |
| AUD-002 | PASS | Failed job#7 → retry → ready; DELETE cleared from recentJobs | UI Retry/Xóa |
| AUD-003 | PASS | ep1+ep5 master ≥3 STREAM-INF; `ensure-demo-ladder.mjs` clean | README/ADMIN docs |
| AUD-004 | PASS | hot=[] after zero views; hot has series after view | Seed `isHot: false` |
| AUD-005 | PASS | Login spam → 429; `X-Content-Type-Options`; prod default JWT throws | helmet + rate-limit |
| AUD-006 | PASS | VTT upload → `/media/subs/1/...` 200; DTO `subtitles[]` | Player toggle |
| AUD-007 | PASS | Same cookie 2× view → `deduped:true`, count +1 only once | `view_dedup` + cookie |
| AUD-008 | PASS | `abrMaxBitrateForConnection` 3g/2g/saveData; manual uncapped | HlsPlayer |
| AUD-009 | PASS | `createObjectURL` preview + 5MB/MIME validate in AdminSeries | Code + UI |
| AUD-010 | PASS | POST playback event → GET playback-stats; bad token 401/403 | Dashboard QoE |
| AUD-011 | PASS | Encode → `thumbs.vtt`+`thumbs.jpg`; custom seek hover preview in HlsPlayer | Sprite + VTT + scrub UI |
| AUD-012 | PASS | Chunk init → PUT parts → complete → jobId | octet-stream parts |
| AUD-013 | PASS | Space/J/K/F/←/→, Theater, PiP in HlsPlayer | Build web OK |
| AUD-014 | PASS | Comment → report → hide → absent from public list | Rate-limit comments |
| AUD-015 | PASS | Native path `loadNativeVariants` + swap `video.src` | Safari path |
| AUD-016 | PASS | `PATCH /api/me` displayName khớp | |
| AUD-017 | PASS | AdminEpisodes multi-file bulk create+upload | Maps epN from filename |
| AUD-018 | PASS | `server/src/worker.ts` + `ENCODE_IN_PROCESS=0` + compose profile | |
| AUD-019 | PASS | Caddy `file_server` for `/media/hls/*` + volume mount | |
| AUD-020 | PASS | ADMIN.md `ENABLE_AV1_LADDER` VP9-first (prior UPGRADE PASS) | No default AV1 |
| AUD-021 | PASS | `ENCODE_WEBHOOK_URL` POST on ready/failed; fail-open | |
| AUD-022 | PASS | manifest + `sw.js` (no HLS cache) + prod SW register | |
| AUD-023 | PASS | `.github/workflows/ci.yml` + **`.github/workflows/docker-e2e.yml`** | HTTP CI overlay; Docker not on this Windows host |
| AUD-024 | PASS | Editor catalog 200; disk-usage 403; admin disk 200 (`aud024-rbac.ts`) | Seed editor user |
| AUD-025 | PASS | `SIGNED_MEDIA` + HMAC + cookie for segments | Off by default |
| AUD-026 | PASS | Stale `clientUpdatedAt` → `{ignored:true}` | LWW history |
| AUD-027 | PASS | disk-usage + jobs/purge endpoints (admin-only) | UI hidden for editors |
| AUD-028 | PASS | Dual-audio fixture → EXT-X-MEDIA×2 + `audio-tracks.json`; player Âm thanh | `aud028-multi-audio.ts` + encode smoke |

---

## Gap close-out evidence (2026-09-05)

### AUD-028 multi-audio
- Probe ≥2 audio streams; package `audio/N/` AAC HLS; rewrite master with `#EXT-X-MEDIA` + `AUDIO="audio"`.
- Admin: `POST /api/admin/episodes/:id/audio` attaches alternate file when ready.
- Player: hls.js `audioTracks` selector (hidden when &lt;2).
- Fixture: `scripts/make-dual-audio-fixture.sh` or `npx tsx server/scripts/aud028-multi-audio.ts`.
- Gate: `AUD-028 PASS { mediaCount: 2, tracks: 2 }` + full encode ep 9028 with 2 MEDIA tags.

### Docker compose e2e (Linux CI)
- Workflow: [`.github/workflows/docker-e2e.yml`](../.github/workflows/docker-e2e.yml)
- Overlay: `docker-compose.ci.yml` + `deploy/Caddyfile.ci` (HTTP `:80`, host port **8080**)
- Smoke: `scripts/ci-docker-smoke.sh` (health + `/` + `/api/home` + media)
- **Local Windows:** Docker CLI not installed — files added; CI agent runs Linux compose.

### Admin UI polish
- `/admin/comments` — list flagged, ẩn / bỏ ẩn / xóa (Vietnamese labels).
- `/admin/episodes` → **Quản lý** — upload/delete VTT/SRT + attach alternate audio.

### Thumbnail scrub
- Custom seek bar under video; hover shows sprite crop from `thumbs.vtt`.
- Encode smoke: `thumbs.vtt` + `thumbs.jpg` present for ep 9028.

### RBAC requireEditor vs requireAdmin
- Content routes → `requireEditor`; `disk-usage` + `jobs/purge` → `requireAdmin`.
- Seed: `editor@livestream.local` / `editor123` (env `SEED_EDITOR_*`).
- Frontend: `isFullAdmin` gates disk/purge UI; editors still access `/admin/*` content.

---

## Manual smoke (biggest user-facing)

1. `npm run dev` → login editor → `/admin/episodes` upload sub; `/admin/comments`
2. Dual-audio: run fixture script → upload → Watch selector **Âm thanh**
3. Hover seek bar on ready episode with thumbs → preview frame
4. Editor token → `GET /api/admin/disk-usage` → 403; admin → 200
5. Linux: `docker compose -f docker-compose.yml -f docker-compose.ci.yml --env-file .env.ci up -d --build` then `BASE_URL=http://127.0.0.1:8080 ./scripts/ci-docker-smoke.sh`

## Remaining gaps

_None — program complete._
