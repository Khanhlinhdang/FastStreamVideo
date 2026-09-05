# Upgrade plan test results (ABR / cache / encode)

Date: 2026-09-05  
Plan: [`UPGRADE_PLAN_ABR_CDN_ENCODE.md`](./UPGRADE_PLAN_ABR_CDN_ENCODE.md)

---

## P1 — ABR player tuning + forward buffer

| Field | Value |
|---|---|
| **Item** | HlsPlayer buffer 60/120, ABR estimate, fatal recover, slow-connection startLevel |
| **Commands** | `npm run build -w web`; inspect `media/hls/40/master.m3u8`; code review for recover paths |
| **Status** | **PASS** |
| **Notes** | `tsc`+vite build OK. Episode 40 master has 480/720/1080 STREAM-INF. Code: `maxBufferLength=60`, `maxMaxBufferLength=120`, `abrEwmaDefaultEstimate=1.8e6`, `recoverMediaError`/`startLoad` on fatal, slow-2g→lowest `startLevel`. Quality key `livestream.hls.quality` unchanged. Full Slow-3G throttle UI left for manual verify. |

---

## P2 — Cache-Control for `/media`

| Field | Value |
|---|---|
| **Item** | Branch Cache-Control by extension + deploy.md Caddy/nginx recipes |
| **Commands** | `curl.exe -sI http://localhost:4000/media/hls/40/master.m3u8`; `.../0/seg_000.m4s`; `.../0/init_0.mp4` |
| **Status** | **PASS** |
| **Notes** | master → `max-age=60`; seg + init → `max-age=31536000, immutable`; CORS origin `http://localhost:5173` preserved. Needed `cacheControl: false` on `@fastify/static` so `send` default `max-age=0` does not overwrite `setHeaders`. |

---

## P3 — CRF + simplified per-title ladder

| Field | Value |
|---|---|
| **Item** | `probeTitleMeta` + `selectLadderForTitle` CRF/maxrate; Windows init/master recovery preserved |
| **Commands** | `npm run build -w server`; `npx tsx server/scripts/smoke-crf-encode.ts 40 25`; ladder unit via `selectLadderForTitle` |
| **Status** | **PASS** |
| **Notes** | Master has 854x480 / 1280x720 / 1920x1080. `init_ok=true`. Fast ladder = 1 rung (480 CRF23). Full = 3 rungs. ffmpeg still exits 3221225477 on Windows after variants; recovery path OK. Short 25s output ~18MB (prior full CBR ~48MB — not apples-to-apples duration). |

---

## P4 — Optional AV1/VP9 ladder (`ENABLE_AV1_LADDER`)

| Field | Value |
|---|---|
| **Item** | Env flag + optional efficient 720p variant; ADMIN.md note |
| **Commands** | `ENABLE_AV1_LADDER=0` smoke encode → only avc1; `=1` smoke → `vp09` STREAM-INF + dir `3/` |
| **Status** | **PASS** (VP9 path) |
| **Notes** | Flag off: H.264-only master. Flag on: appended `CODECS="vp09…"` at `3/index.m3u8`. **libaom-av1** needs `-strict -2` and was **harmfully slow** (>5 min for 5s clip, killed) — implementation prefers **libvpx-vp9** on this Windows ffmpeg; AV1 kept as fallback if VP9 missing. Default remains off. |

---

## P5 — Rebuffer metrics + resume polish

| Field | Value |
|---|---|
| **Item** | `POST /api/playback/events` + `playback_events`; pause/pagehide history flush; continue filter >5s and <95% duration |
| **Commands** | `Invoke-RestMethod .../api/playback/events`; query SQLite; home continueWatching with mid vs near-end history; `npm run build` |
| **Status** | **PASS** |
| **Notes** | Event insert returned `{ok,id:1}` with `durationMs=1250`. `GET /api/health` unchanged. Continue: ep pos=90/dur=300 listed; near-end (9999/300) and soft-deleted series excluded. Client rebuffer hooks wired (`waiting`→`playing`). |

---

## Prefetch next episode (phase phụ)

| Field | Value |
|---|---|
| **Item** | Watch.tsx prefetch next `master.m3u8` when <60s remain; skip saveData/2g |
| **Commands** | Code review + `npm run build -w web` (Network tab manual) |
| **Status** | **PASS** (implemented; Network prefetch is manual UI verify) |
| **Notes** | Uses `link rel=prefetch` + `fetch(nextMaster)`. Guarded by `navigator.connection`. |

---

## Skipped / adjusted

| Item | Reason |
|---|---|
| libaom-av1 as primary optional rung | Feasibility: experimental (`-strict -2`) + >5 min encode for 5s source on bundled Windows ffmpeg — **harmful** for queue. Replaced with **VP9 primary** under same `ENABLE_AV1_LADDER` flag. |
| Full Slow-3G DevTools throttle / Chrome Auto binge timing | Automated environment lacks interactive DevTools throttle session; buffer/recovery code + web build verified. |

---

## Manual verify (main improvements)

1. `npm run dev` → open a ready episode → DevTools Network throttle Slow 3G → Auto quality 2–3 min; briefly offline then online → playback recovers or shows readable error.
2. `curl.exe -sI http://localhost:4000/media/hls/<id>/master.m3u8` vs `.../0/seg_000.m4s` → short vs immutable Cache-Control.
3. Quality selector 480/720/1080/Auto + F5 keeps preference.
4. Login → watch → pause → close tab → Home continue / re-open ≈ saved position.
5. Optional: `$env:ENABLE_AV1_LADDER=1; npx tsx server/scripts/reencode-episode.ts <id>` → master includes `vp09` (or `av01`).


