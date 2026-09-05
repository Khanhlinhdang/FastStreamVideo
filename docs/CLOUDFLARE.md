# Cloudflare setup for LiveStream

Use this with the Docker + Caddy stack in [`deploy.md`](../deploy.md).  
Goal: custom domain → Cloudflare proxy → VPS (Caddy TLS) → `api` / `web`.

## 1. Add site

1. Cloudflare Dashboard → **Add a site** → enter your domain (e.g. `livestream.example.com` or apex).
2. Choose a plan (Free is enough to start).
3. Replace nameservers at your registrar with the two Cloudflare NS records shown.

## 2. DNS

| Type | Name | Content | Proxy |
|---|---|---|---|
| **A** | `@` or `livestream` | VPS public IPv4 | **Proxied** (orange cloud) |
| **AAAA** | same | VPS IPv6 (if any) | **Proxied** |

- Wait until DNS is active (often minutes; up to 24h at registrar).
- Confirm VPS firewall allows **80** and **443** from the internet (Cloudflare edge + ACME).

## 3. SSL / TLS

### Recommended: Full (strict) + Caddy Let's Encrypt

1. SSL/TLS → Overview → mode **Full (strict)**.
2. Caddy on the VPS obtains a public cert via HTTP-01/TLS-ALPN (ports 80/443 must reach the origin).
3. Cloudflare talks HTTPS to origin with a valid cert → no browser warnings.

**Note:** With orange-cloud proxy, Cloudflare terminates visitor TLS; origin still needs a valid cert for Full (strict).

### Alternative: Cloudflare Origin Certificate

If Let's Encrypt on the origin is awkward (or you want CF-only trust):

1. SSL/TLS → **Origin Server** → Create certificate (15 years OK).
2. Save `cert.pem` + `key.pem` on the VPS (e.g. `deploy/certs/`).
3. Point Caddy at those files (example):

```caddyfile
livestream.example.com {
  tls /certs/cert.pem /certs/key.pem
  # ... same handle blocks as deploy/Caddyfile
}
```

4. Mount `./deploy/certs:/certs:ro` on the `proxy` service in compose.
5. Keep SSL mode **Full (strict)**.

### Avoid

- **Flexible** — Cloudflare→origin is HTTP; cookies/`COOKIE_SECURE` and mixed assumptions break easily. Not recommended.

## 4. Cache Rules

Create rules under **Caching → Cache Rules** (or Configuration Rules). Order matters: put **Bypass API** first.

| # | Rule name | When (match) | Then |
|---|---|---|---|
| 1 | **Bypass API** | URI Path starts with `/api` | Cache eligibility: **Bypass cache** |
| 2 | **HLS segments** | URI Path contains `/media/hls/` **and** (File extension is `m4s` **or** `mp4`) | Eligible for cache; **Respect origin** Cache-Control; Edge TTL override optional **1 month**+ only if origin missing |
| 3 | **HLS playlists** | URI Path contains `/media/hls/` **and** File extension is `m3u8` | Eligible; Edge TTL **1–2 minutes** (or Respect origin `max-age=60`) — playlists change on re-encode |
| 4 | **Posters** | URI Path starts with `/media/posters/` | Cache ~1 day OK |

### Origin headers (already set)

**Caddy** (`deploy/Caddyfile` for `/media/hls/*`) and Fastify `@fastify/static` (non-HLS `/media` and local-dev HLS):

- `.m4s` / `init*.mp4` → `Cache-Control: public, max-age=31536000, immutable`
- `.m3u8` → `max-age=60`
- images → `max-age=86400`

Do **not** strip `Cache-Control` on `/media`. Prefer **Respect origin** for segments.

### Critical: keep `SIGNED_MEDIA=0`

Signed query strings (`?exp=&sig=`) make every URL unique → Cloudflare **MISS** forever and defeat SCL-003.

```env
SIGNED_MEDIA=0
```

Only enable signed media with a designed cache key (or cookie-only gate) — not with default CF Cache Rules.

### Warm / verify HIT

```bash
curl -sI "https://$DOMAIN/api/health"                    # should NOT be HIT for long
curl -sI "https://$DOMAIN/media/hls/<id>/0/seg_000.m4s" # 1st: MISS/EXPIRED OK
curl -sI "https://$DOMAIN/media/hls/<id>/0/seg_000.m4s" # 2nd: expect CF-Cache-Status: HIT
curl -sI "https://$DOMAIN/media/hls/<id>/master.m3u8"   # short TTL / DYNAMIC ok
```

If using **R2 custom domain** for HLS, configure similar Cache Rules (or R2 public bucket + CF) on that hostname.

## 5. WAF / Bot Fight (optional)

- **Security → WAF**: managed ruleset on Free/Pro; tighten later if abused.
- **Bot Fight Mode**: optional; watch for false positives on admin upload if enabled aggressively.
- Rate limiting (paid): protect `POST /api/auth/login` and upload routes if under attack.

## 6. Client IP (`CF-Connecting-IP`)

- Browser → Cloudflare → Caddy → API.
- Fastify runs with `TRUST_PROXY=true` and uses `X-Forwarded-For` for `req.ip` (playback telemetry rate limit).
- Cloudflare sends **`CF-Connecting-IP`** as the real visitor.
- Caddy normally appends the connecting peer (Cloudflare edge) to `X-Forwarded-For`. For stricter accuracy later, set Caddy to forward `CF-Connecting-IP` into `X-Forwarded-For` / `X-Real-IP` (only when that header is present), or use Cloudflare’s authenticated origin pulls.

Documented for future rate-limit / audit work; day-1 deploy works without custom IP rewriting.

## 7. Checklist (SCL-002 + SCL-003)

### DNS / SSL (SCL-002)

- [ ] A/AAAA proxied to VPS
- [ ] SSL mode **Full (strict)** — never Flexible
- [ ] `https://DOMAIN/` loads UI (200)
- [ ] `https://DOMAIN/api/health` → `{"ok":true,...}`
- [ ] `.env.production`: `DOMAIN`, `CORS_ORIGIN=https://...`, `TRUST_PROXY=true`, `COOKIE_SECURE=true`
- [ ] Admin login + refresh session over HTTPS (Secure cookie)

### Cache (SCL-003)

- [ ] Cache Rules: bypass `/api/*`
- [ ] HLS segment long cache + Respect origin; playlist short TTL
- [ ] HLS segment response includes long `Cache-Control` (origin or CF)
- [ ] Second request for same `.m4s` shows `CF-Cache-Status: HIT` (or equivalent)
- [ ] `SIGNED_MEDIA=0` in production when using CF cache
- [ ] Optional: posters `/media/posters/` ~1 day
