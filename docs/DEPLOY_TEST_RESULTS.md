# Deploy verification results

Ngày: **2026-09-08**

## Đã xác nhận OK (máy Windows này)

| Check | Result |
|---|---|
| Docker Desktop restart after disk RO (`wsl --shutdown` + relaunch) | PASS |
| `docker compose … build` (api + web, no apt / static ffmpeg) | PASS |
| Entrypoint CRLF fix + `.gitattributes` `*.sh eol=lf` | PASS |
| Compose local overlay `ports: !override` → host `:8080` | PASS (Compose v5 `!reset` dropped ports) |
| Stack `up -d` — api / web / proxy **healthy** | PASS |
| `GET http://127.0.0.1:8080/api/health` | PASS |
| `scripts/docker-smoke.ps1` (health, `/`, home, login, admin) | PASS |

## Root cause đã xử lý trên host / repo

| Issue | Fix |
|---|---|
| Docker disk `read-only file system` / engine 500 | Restart Docker Desktop + `wsl --shutdown` |
| Apt/`deb.debian.org` → Fake-IP `198.18.0.61` | `server/Dockerfile` không dùng `apt-get`; ffmpeg từ `mwader/static-ffmpeg`; healthcheck Node `fetch` |
| `exec ./docker-entrypoint.sh: no such file` | LF endings + `sed` CRLF strip trong Dockerfile |
| Proxy không publish `:8080` | `ports: !override` trong `docker-compose.local.yml` / `.ci.yml` |
| Smoke PS `$home` reserved | Đổi tên biến trong `docker-smoke.ps1` |

## Cách chạy lại

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d --build
.\scripts\docker-smoke.ps1 -BaseUrl http://127.0.0.1:8080 -AdminPassword '<SEED_ADMIN_PASSWORD>'
```

Production VPS: `./scripts/vps-bootstrap.sh`
