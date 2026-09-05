# COMPETITOR_UPGRADE_TEST_RESULTS

**Ngày:** 2026-09-06  
**Phạm vi:** Execute `COMPETITOR_UPGRADE_PLAN.md` Phase A–D (COMP-001…025) trên LiveStream stack.  
**Regression chung:** `npm run build` (server + web) **PASS**; `GET /api/health` **PASS**; HLS episode `ready` (vd. `/media/hls/1/master.m3u8`) còn tồn tại.

---

## Tóm tắt

| ID | Kết quả | Ghi chú test |
|---|---|---|
| COMP-001 | **PASS** | Migration `kind`; `GET /api/series?kind=movie\|series`; default series |
| COMP-002 | **PASS** | CRUD metadata (tagline, cast, tags, trailerUrl, runtime, ageRating, director) |
| COMP-003 | **PASS** | Admin form loại + metadata; movie tạo kèm ep #1 |
| COMP-004 | **PASS** | Badge Phim lẻ/bộ; detail CTA; ẩn list tập movie |
| COMP-005 | **PASS** | Search facet year/genre/country/kind/status/sort + URL sync |
| COMP-006 | **PASS** | `trailerUrl` + hover ưu tiên trailer; detail YouTube embed |
| COMP-007 | **PASS** | `seasonNumber`; admin create S2E1; detail tabs `?season=` |
| COMP-008 | **PASS** | `GET /api/series/:slug/related`; `/api/me/personalized`; UI rows |
| COMP-009 | **PASS** | SeoHead OG/JSON-LD; `GET /sitemap.xml` 200 |
| COMP-010 | **PASS** | Watch `?t=`; nút Chia sẻ copy link + timestamp |
| COMP-011 | **PASS** | Hover CTA: Xem ngay / Trailer / Chia sẻ / Yêu thích |
| COMP-012 | **PASS** | `sort=` catalog + Genre page dropdown |
| COMP-013 | **PASS** | ThemeProvider light/dark + Header toggle |
| COMP-014 | **PASS** | `/api/people/:slug` + `/dien-vien/:personSlug` |
| COMP-015 | **PASS** | Preset anime/k-drama/c-drama + `/kham-pha/:preset` |
| COMP-016 | **PASS** (reset); OAuth **Won’t do** | Forgot/reset token; OAuth skip (no IdP) |
| COMP-017 | **PASS** | `/gioi-thieu`, `/lien-he` mailto |
| COMP-018 | **PASS** | HlsPlayer `srcCandidates` failover on fatal |
| COMP-019 | **PASS** | Slow-buffer overlay + portrait rotate hint |
| COMP-020 | **PASS** | BillboardHero auto-rotate + dots + skeleton |
| COMP-021 | **PASS** | PosterRow chevron carousel |
| COMP-022 | **PASS** | Detail cinematic backdrop + cast/meta |
| COMP-023 | **PASS** | Hero skeleton + detail loading; grid skeleton sẵn có |
| COMP-024 | **PASS** | Mobile drawer backdrop + body scroll lock |
| COMP-025 | **PASS** | Auth polish + link quên mật khẩu |

**Deferred / Won’t do**

| Mục | Lý do |
|---|---|
| COMP-016 Google OAuth | Không cấu hình IdP; reset password đủ cho P2 auth |
| FEAT-001…004 (chunked upload wizard…) | Ngoài COMP checklist chi tiết; CMS hiện hữu vẫn encode được |
| Pirate embeds / torrent | Cố ý không làm |

---

## Chi tiết smoke (API)

Chạy sau `npm run db:migrate` + `npm run dev:server` (2026-09-06):

1. **Health** — `{"ok":true,"service":"LiveStream API",...}`
2. **kind** — `kind=movie` total=0 trước seed; sau create movie → search `q=COMP&kind=movie` total=1; `kind=series` total≥10
3. **Admin create movie** — id=12, kind=movie, cast=2, auto episodeCount=1, seasonNumber=1
4. **Season** — POST episode `seasonNumber=2,number=1` → id=48
5. **Sitemap** — 200, chứa `/phim/`
6. **Forgot password** — `ok=true`, `devToken` length=43 (dev)
7. **Person** — `/api/people/actor-one` → name Actor One, 1 title
8. **HLS ready** — episodes 1, 5, 46 có `playbackUrl` `/media/hls/.../master.m3u8`
9. **Build** — `npm run build` PASS (server tsc + web vite)

---

## Manual UX checklist (khuyến nghị)

1. Home: billboard xoay ≥2 hot; chevron rows; chip preset Anime/K-Drama  
2. Theme toggle ☀/☾ — Home / Watch / Admin readable  
3. Mobile width: burger → drawer full; body không scroll nền  
4. `/tim-kiem` — lọc kind+year+genre, reload giữ URL  
5. `/phim/<movie-slug>` — cinematic, không list “Tập 1” ồn; CTA Xem phim  
6. Desktop hover poster — Trailer/Share/Yêu thích  
7. `/xem/<slug>/1?t=30` — seek ~30s  
8. Admin Series — chọn Phim lẻ, nhập cast/trailer, lưu  

---

## Files chính đã đụng

- Server: `schema.ts`, `db/index.ts`, `mappers.ts`, `catalog.ts`, `admin.ts`, `auth.ts`, `me.ts`  
- Web: `BillboardHero`, `PosterRow`, `SeoHead`, `ThemeContext`, Home/Search/Detail/Watch/Header/Genre/Auth, Explore/Static pages, HlsPlayer, HoverPreview, AdminSeries  

**Không** thêm dependency WeFlix/FilmP2P; temp clones đã xóa.
