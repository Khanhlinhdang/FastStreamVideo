# Baseline metrics runbook (SCL-005)

Use this to gate Phase 0 → Phase 1 (R2). Fill one peak sample before enabling hot-title R2 publish.

## Formula

```text
concurrent ≈ (usable_egress_Mbps × 0.7) / avg_bitrate_Mbps
```

With Cloudflare caching segments, **usable egress** is edge capacity — origin NIC should stay far below `concurrent × bitrate`.

## Collect (15–30 min peak)

| Metric | Source | Sample |
|---|---|---|
| Concurrent viewers (est.) | Admin QoE / `playback_events` / analytics | |
| Origin egress Mbps | VPS NIC / `vnstat` / cloud graph | |
| CPU % | `top` / host metrics | |
| Disk util / IOPS | `iostat` / cloud disk | |
| CF cache hit ratio | Cloudflare → Caching analytics | |
| Avg bitrate | Player stats or `master.m3u8` BANDWIDTH + level | |

### Playlist bitrate check

```bash
curl -s "https://$DOMAIN/media/hls/<id>/master.m3u8" | findstr BANDWIDTH
# or: curl -s ... | grep BANDWIDTH
```

Top `BANDWIDTH` should match encode policy (`MAX_ENCODE_HEIGHT`, ladder maxrate).

### Health

```bash
curl -sS "https://$DOMAIN/api/health"
```

## Peak sample table (fill in)

| Window | Concurrent est. | Origin Mbps | CF HIT% | Avg Mbps | Comfortable? |
|---|---|---|---|---|---|
| _YYYY-MM-DD HH:MM_ | | | | | |

**Phase 0 exit:** comfortable **~100–500+** on a hot title with solid CF HIT; encode not overlapping peak; this table has ≥1 row.

## Gate to Phase 1 (R2)

| Observation | Action |
|---|---|
| HIT high + origin egress ≪ concurrent×bitrate | Optional R2 when targeting >500 or disk pain |
| HIT low | Fix Cache Rules / ensure `SIGNED_MEDIA=0` before R2 |
| Encode peaks with watch | SCL-004 off-peak / worker first |

See [`SCALING_IMPLEMENTATION_PLAN.md`](./SCALING_IMPLEMENTATION_PLAN.md) SCL-005.
