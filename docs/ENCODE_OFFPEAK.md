# Encode off-peak / worker profile (SCL-004 · SCL-013)

Keep **peak watch** free of ffmpeg CPU/IOPS on the same box that serves viewers.

## Day-1 (single VPS)

Default Compose: encode runs **in-process** on `api` (`ENCODE_IN_PROCESS` unset or `1`).

### Off-peak remote worker (same compose)

1. In `.env.production`:

```env
ENCODE_IN_PROCESS=0
ENABLE_AV1_LADDER=0
```

2. Start with worker profile (outside peak hours):

```bash
docker compose --env-file .env.production --profile worker up -d
curl -sS "https://$DOMAIN/api/health"
# expect: "encoder":"remote"
```

3. Upload → job stays `queued` until worker polls → `encoding` → `ready`.

4. Stop worker during peak:

```bash
docker compose --env-file .env.production stop worker
# New uploads remain queued; Watch still plays existing HLS
```

### Ops schedule (recommended)

| Window | Encode? | Notes |
|---|---|---|
| Peak watch (community evening) | **No** | Stop `worker`; do not admin-upload full ladder |
| Off-peak / night | **Yes** | `--profile worker`; NIC/CPU headroom |
| Any time | Never `ENABLE_AV1_LADDER=1` on origin peak | Extra rung burns CPU |

If NIC or CPU > ~70% during watch, defer encodes.

## Health

- `encoder: "inline"` — API pumps ffmpeg
- `encoder: "remote"` — API only queues; worker must run

## Related

- Separate encode VM: [`WORKER_VM.md`](./WORKER_VM.md)
- Capacity: [`VPS_CAPACITY.md`](./VPS_CAPACITY.md)
