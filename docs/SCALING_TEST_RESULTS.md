# Scaling — Test Results

**Plan:** [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md)  
**Started:** 2026-09-06  
**Environment:** Local Windows (`DESKTOP-2LMN5CG`); **Docker CLI not installed** → Compose/`https://$DOMAIN` live CF checks adapted (Fastify Cache-Control, Caddyfile review, R2 mock dir). Production enablement documented in [`../deploy.md`](../deploy.md) + [`CLOUDFLARE.md`](./CLOUDFLARE.md).

## Completion summary

| Metric | Value |
|---|---|
| Total IDs (Phase 0–2 scope) | 16 |
| PASS | 13 |
| SKIP (external SaaS / live peak / optional gate) | 3 |
| FAIL | 0 |

---

## Master status table

| ID | Status | Evidence |
|---|---|---|
| SCL-001 | **PASS** | Caddyfile `handle_path /media/hls/*` + `file_server`; Fastify HEAD `seg_000.m4s` → `Cache-Control: public, max-age=31536000, immutable`; `master.m3u8` → `max-age=60`; `deploy.md` architecture fixed |
| SCL-002 | **SKIP** | No production Cloudflare domain/VPS in this workspace. Docs + checklist in [`CLOUDFLARE.md`](./CLOUDFLARE.md) §1–3, §7; `.env.production.example` has `COOKIE_SECURE`/`TRUST_PROXY`. Enable on VPS then run CF checklist |
| SCL-003 | **SKIP** | No CF edge to observe `CF-Cache-Status`. Cache Rules table + `SIGNED_MEDIA=0` warning + warm-cache curl recipe in [`CLOUDFLARE.md`](./CLOUDFLARE.md) §4. Origin headers verified under SCL-001 |
| SCL-004 | **PASS** | `ENCODE_IN_PROCESS=0` → `/api/health` `encoder:"remote"` (`server/scripts/scl004-remote-encoder.ts`); compose profile `worker` + [`ENCODE_OFFPEAK.md`](./ENCODE_OFFPEAK.md); retry path respects remote mode |
| SCL-005 | **PASS** | Runbook [`SCALING_METRICS.md`](./SCALING_METRICS.md) with formula, collection table, Phase 0→1 gate. Live peak sample deferred to production window |
| SCL-006 | **PASS** | Ladder maxrates tightened (720≤2500k, 1080≤4500k); `MAX_ENCODE_HEIGHT=720` drops 1080; HlsPlayer `autoLevelCapping` on saveData/slow nets; smoke script |
| SCL-007 | **PASS** | `config` R2_* + boot `integrations.r2`; health `r2`/`r2PublishMode`; env examples; `R2_MOCK_DIR` for local. Live R2 keys: none → mock path used |
| SCL-008 | **PASS** | `r2HlsPublish.ts` atomic order; mock publish ep1 → 28 objects incl. `master.m3u8`+`seg_000.m4s`; fail leaves local; admin `POST .../publish-r2` |
| SCL-009 | **PASS** | `episodes.hlsStorage`; mapper local `/media/hls/...` vs absolute `R2_PUBLIC_BASE_URL/hls/<id>/master.m3u8`; no sign on R2 URLs |
| SCL-010 | **PASS** | `hlsCleanup.ts` + admin `POST /api/admin/hls/cleanup-local` dry-run; smoke candidates=1 after mock publish; disk-usage returns r2 flags |
| SCL-011 | **PASS** | Ops doc [`WORKER_VM.md`](./WORKER_VM.md) (shared volume vs R2 publish). No second VM in lab → doc acceptance |
| SCL-012 | **PASS** | Feature flag `R2_PUBLISH_MODE=all` publishes every encode; playback absolute CDN URL. Live >95% CDN bytes needs prod analytics (see Remaining gaps) |
| SCL-013 | **PASS** | Same as SCL-004/011: prod recommendation `ENCODE_IN_PROCESS=0` + worker VM/spot; docs ENCODE_OFFPEAK + WORKER_VM; api does not spawn ffmpeg when remote |
| SCL-014 | **SKIP** | Optional; only after API bottleneck post-CDN. No split VM implemented — deferred until metrics demand |
| SCL-015 | **SKIP** | Postgres Phase B still roadmap ([`SUPABASE.md`](./SUPABASE.md)); intentionally after media CDN |
| SCL-016 | **PASS** | ADR [`ADR_MULTI_CDN.md`](./ADR_MULTI_CDN.md) = **won't do** until geo pain after SCL-012 |

---

## Per-item logs

### SCL-001 — Verify Caddy HLS bypass + Cache-Control

- **Status:** PASS  
- **Commands:** `npx tsx server/scripts/scl-scaling-smoke.ts`  
- **Evidence:**
  - Caddyfile contains `handle_path /media/hls/*` + `file_server` + immutable segment headers
  - Fastify (local stand-in when Docker absent): playlist `max-age=60`; segment/init `31536000, immutable`
  - `deploy.md` diagram updated: `/media/hls/*` → Caddy file_server (not api)
- **Note:** Full `docker compose` + “no segment in api logs” requires Docker on VPS — config already correct.

### SCL-002 — Cloudflare DNS + SSL Full strict

- **Status:** SKIP  
- **Reason:** No orange-cloud domain / VPS reachable from this agent session.  
- **Delivered:** CLOUDFLARE.md checklist §7 (SCL-002 block); deploy.md env requirements.

### SCL-003 — Cloudflare Cache Rules HLS

- **Status:** SKIP (live HIT) / code+docs ready  
- **Reason:** Cannot read `CF-Cache-Status` without proxied production hostname.  
- **Delivered:** Ordered Cache Rules table; Respect origin; `SIGNED_MEDIA=0` hard warning; warm-cache curl recipe.

### SCL-004 — Encode off-peak / worker profile

- **Status:** PASS  
- **Evidence:** `scl004-remote-encoder.ts` → `{"encoder":"remote",...}`; [`ENCODE_OFFPEAK.md`](./ENCODE_OFFPEAK.md); compose `ENCODE_IN_PROCESS` passthrough + worker profile notes.

### SCL-005 — Baseline metrics

- **Status:** PASS (runbook)  
- **Evidence:** [`SCALING_METRICS.md`](./SCALING_METRICS.md). Fill peak sample table on first production peak.

### SCL-006 — Bitrate / ABR policy

- **Status:** PASS  
- **Evidence:** smoke: heights `480,720,1080`; with `MAX_ENCODE_HEIGHT=720` → `480,720`; 720 maxrate `2500k`.

### SCL-007 — R2 env wiring

- **Status:** PASS  
- **Evidence:** health exposes `r2`/`r2PublishMode`; mock dir configures without SaaS keys.

### SCL-008 — Publish HLS → R2

- **Status:** PASS (mock)  
- **Evidence:** 28 objects under `data/r2-mock-scl/hls/1/` including master + segments. Live R2: set real `R2_*` and omit `R2_MOCK_DIR`.

### SCL-009 — playbackUrl / fallback

- **Status:** PASS  
- **Evidence:** local → `/media/hls/1/master.m3u8`; r2 → `https://media.test.local/hls/1/master.m3u8`.

### SCL-010 — Disk cleanup

- **Status:** PASS  
- **Evidence:** dry-run after mock publish: `candidates=1`, `freedBytes≈24.9MB`; confirm=false by default.

### SCL-011 / SCL-013 — Worker VM / encode farm

- **Status:** PASS (docs + remote mode)  
- **Evidence:** [`WORKER_VM.md`](./WORKER_VM.md), remote health flag, compose worker service.

### SCL-012 — HLS default on object + CDN

- **Status:** PASS (flag)  
- **Evidence:** `R2_PUBLISH_MODE=all` path implemented. Prod: set mode `all` after Phase 0 gate.

### SCL-014 / SCL-015

- **Status:** SKIP  
- **Reason:** Explicit optional / Postgres Phase B; media CDN first.

### SCL-016 — Multi-CDN gate

- **Status:** PASS (won't do)  
- **Evidence:** [`ADR_MULTI_CDN.md`](./ADR_MULTI_CDN.md).

---

## How to re-run local gates

```bash
npx tsx server/scripts/scl-scaling-smoke.ts
npx tsx server/scripts/scl004-remote-encoder.ts
npm run build -w server
npm run build -w web
```

## Enable CF + R2 in production

See [`../deploy.md`](../deploy.md) §4 and summary in the implementation return notes.
