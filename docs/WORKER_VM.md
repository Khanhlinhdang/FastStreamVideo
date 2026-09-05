# Optional encode worker VM (SCL-011 · SCL-013)

Split encode off the watch/API VPS when daytime uploads regularly collide with peak viewing.

## Recommended topology (small team)

```text
[Watch VPS]  api + web + proxy (+ SQLite)   ENCODE_IN_PROCESS=0
[Worker VM]  worker + ffmpeg               shares media + DB mount OR publishes R2
```

### Option A — shared volumes (NFS / block share)

- Mount same `livestream_data` + `livestream_media` on both hosts.
- **Single-writer SQLite:** only `api` migrates/seeds; worker only reads/writes encode job rows + HLS files.
- Worker compose fragment:

```yaml
services:
  worker:
    build: { context: ., dockerfile: server/Dockerfile }
    command: ["node", "dist/src/worker.js"]
    environment:
      ENCODE_IN_PROCESS: "1"
      DATABASE_PATH: /data/livestream.db
      HLS_DIR: /media/hls
      UPLOADS_DIR: /media/uploads
      # R2_* if publishing from worker
    volumes:
      - /mnt/livestream_data:/data
      - /mnt/livestream_media:/media
```

API host keeps `ENCODE_IN_PROCESS=0` and does **not** run `--profile worker`.

### Option B — worker publishes straight to R2 (preferred after SCL-008)

- Worker encodes to local disk, then `r2HlsPublish` uploads; API serves `playbackUrl` from R2.
- Sync HLS back to origin only if you still need a local shield.

## Acceptance

- During a job: `ffmpeg` on **worker** host only; watch VPS CPU encode ≈ 0.
- `GET /api/health` → `encoder: "remote"`.
- Episode reaches `ready` + Watch plays.

## Do not

- Run multiple API writers against one SQLite file.
- Enable `ENABLE_AV1_LADDER` on peak watch host.
- Scale-out multiple APIs before Postgres (SCL-015).

Day-1 single Compose remains the default — this doc is the supplement when peak overlap demands it.
