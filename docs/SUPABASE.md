# Supabase (optional) for LiveStream

Default production path is **SQLite + local `/media` volumes** (see Docker in [`deploy.md`](../deploy.md)).  
Supabase is **opt-in** via env — local `npm run dev` stays on better-sqlite3.

## What works today (Phase A)

| Piece | Behavior |
|---|---|
| **SQLite** | Always used for app data unless you complete Phase B |
| **Supabase Storage** | If `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, admin **poster uploads** go to the Storage bucket (public URL saved in `series.posterUrl`) |
| **Else** | Posters stay on disk under `media/posters` (served as `/media/posters/...`) |
| **Auth** | Existing JWT + refresh cookie — **not** Supabase Auth yet |
| **HLS / uploads** | Remain on VPS disk (`livestream_media` volume) |

## Project checklist

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API**: copy
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only — never expose to the web bundle**)
   - `anon` key → `SUPABASE_ANON_KEY` (optional stub for future client use)
3. **Storage → New bucket**
   - Name: `posters` (or set `SUPABASE_POSTERS_BUCKET`)
   - **Public** bucket (or public-read policy) so `<img src="...">` works without signed URLs
4. Add to `.env.production`:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_POSTERS_BUCKET=posters
```

5. Restart API: `docker compose --env-file .env.production up -d api`

### Verify posters

1. Admin → Series → upload poster.
2. Response `posterUrl` should be an `https://....supabase.co/storage/v1/object/public/posters/...` URL.
3. Without Supabase env, `posterUrl` stays `/media/posters/...`.

## Env validation

On boot the API logs an `integrations` line:

- `supabaseStorage: true|false`
- `databaseUrlConfigured: true|false` (Phase B flag only)

Missing Supabase keys → local disk (no error).  
Partial config (URL without service role) → Storage disabled.

Code: `server/src/lib/supabase.ts`, `server/src/config.ts`, poster route in `server/src/routes/admin.ts`.

## Phase B — Postgres migration roadmap

`DATABASE_URL` may be set to the Supabase Postgres connection string; **the app still uses SQLite** until this work lands. Do not expect dual DB writes yet.

Suggested steps (do not leave SQLite broken mid-migration):

1. Export schema from `server/src/db/schema.ts` → Postgres DDL (types, FKs, indexes).
2. Introduce a thin query layer (`pg` pool) behind `getDb()` **or** a repository interface; feature-flag with `DATABASE_URL`.
3. Migrate tables in order: `users` → catalog → social → `encode_jobs` / tokens.
4. One-shot data copy script SQLite → Postgres; verify row counts.
5. Run dual-read shadow in staging; cut over; keep SQLite backup.
6. Optional later: **Supabase Auth** replacing custom JWT (session cookies / RLS) — separate project.

Until then, treat `DATABASE_URL` as reserved documentation in `.env.production.example`.

## Auth later (optional)

- Keep current JWT for day-1 production.
- Future: Supabase Auth (email magic link / OAuth) + map `auth.users` → app profile; RLS on Postgres tables.
- Do not mix service role into the browser.

## Related third-party stubs

Documented in `.env.production.example` (not required for launch):

| Service | Env | Status |
|---|---|---|
| Sentry | `SENTRY_DSN` | Documented; not wired in process yet |
| Resend / SMTP | `RESEND_API_KEY`, `SMTP_*`, `EMAIL_FROM` | Future email (password reset, encode-done) |
| Cloudflare R2 | `R2_*`, `R2_PUBLISH_MODE` | Optional HLS object store; posters remain Supabase-or-local. See [`deploy.md`](../deploy.md) §4 and SCL-007–012 |

## Security

- Never commit `SUPABASE_SERVICE_ROLE_KEY`.
- Prefer Storage policies that only allow service-role writes; public read for the posters bucket.
- Rotate keys if leaked; revoke old service role in Supabase dashboard.
