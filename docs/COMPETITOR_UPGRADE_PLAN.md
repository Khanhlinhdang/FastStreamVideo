# LiveStream — Kế hoạch nâng cấp từ phân tích đối thủ (COMP-*)

**Nguồn phân tích:** [`COMPETITOR_FEATURE_ANALYSIS.md`](./COMPETITOR_FEATURE_ANALYSIS.md)  
**Đối chiếu scorecard / FEAT nội bộ:** [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md), [`FEATURE_UPGRADE_PLAN.md`](./FEATURE_UPGRADE_PLAN.md)  
**Ngày:** 2026-09-06  

**Nguyên tắc:**
1. **Clone khái niệm + implement trên LiveStream** (vòng execute bắt đầu sau khi plan UI §Phase D được ghi).  
2. **Clone khái niệm** từ WeFlix / FilmP2P — **không** `npm install` / import package / copy asset / dán dump code từ repo đối thủ.  
3. Reimplement trên **Fastify + React + HLS** LiveStream.  
4. **Bỏ qua** pirate embed, Drive crowd piracy, BitTorrent/P2P.  
5. Khi trùng FEAT-xxx: **một lần làm**, tick cả hai checklist; ưu tiên acceptance của FEAT nếu đã chi tiết hơn.

---

## Narrative bắt buộc (gate)

> **Không bắt đầu hạng mục kế tiếp cho đến khi hạng mục hiện tại đạt Test bắt buộc = PASS.**  
> Mỗi COMP có acceptance + test riêng. Chỉ song song khi Depends = `—` và không conflict cùng file.  
> Sang phase mới chỉ khi **gate phase** xanh.

Regression tối thiểu mọi gate: `GET /api/health` ok; `npm run build` (server + web) OK; phát HLS episode `ready` vẫn xem được.

---

## Definition of Done (chương trình COMP)

1. Mọi COMP trong master checklist = **Done** hoặc **Won’t do** (có lý do; chỉ P2 tùy chọn).  
2. Mỗi Done đã **Test bắt buộc = PASS**.  
3. LiveStream có IA **phim lẻ vs series** rõ trên admin + public.  
4. Detail/search hiển thị metadata giàu hơn đối thủ ở mức self-host (cast/tags/runtime/trailer khi admin nhập).  
5. Search UI facet + sort usable; trailer không phụ thuộc tập full.  
6. Không có dependency / submodule / copy từ WeFlix_v2 hay Playing-FilmP2P.  
7. Scorecard mục tiêu đồng bộ FEAT: Admin ≥ 7.5; Overall ≥ 7.5 (sau khi kết hợp FEAT-001… và COMP P0).  
8. Home billboard + row carousel + detail cinematic đạt acceptance COMP-020…022 (Phase D).

---

## Master checklist

| ID | Name | Priority | Effort | Depends | Phase | Trùng FEAT |
|---|---|---|---|---|---|---|
| COMP-001 | Schema + API `kind` movie \| series | P0 | M | — | A | FEAT-006 |
| COMP-002 | Schema metadata giàu (cast, director, tags, ageRating, runtime, tagline, trailerUrl) | P0 | M | — | A | FEAT-007 |
| COMP-003 | Admin IA phim lẻ / series + form metadata | P0 | M | COMP-001, COMP-002 | A | FEAT-008 |
| COMP-004 | Public IA movie vs series (browse/detail/watch) | P0 | M | COMP-001, COMP-003 | A | FEAT-009 |
| COMP-005 | Faceted search + sort UI | P0 | M | — | A | FEAT-005, FEAT-010 |
| COMP-006 | Trailer metadata + hover/hero | P0 | M | COMP-002 | A | FEAT-011 |
| COMP-007 | Multi-season tabs + deep-link | P1 | L | COMP-001, COMP-004 | B | FEAT-021 |
| COMP-008 | Related + personalized rows | P1 | M | COMP-002 | B | FEAT-019 |
| COMP-009 | SEO meta / OG / JSON-LD / sitemap | P1 | M | COMP-004 | B | — |
| COMP-010 | Share link + `?t=` + autoplay scroll | P1 | S–M | — | B | FEAT-022 |
| COMP-011 | Quick-actions trên hover preview | P1 | M | COMP-006 | B | — |
| COMP-012 | Browse sort rows (mới / view / rating / năm) | P1 | S–M | COMP-005 | B | — |
| COMP-013 | Light / Dark theme | P2 | M | — | C | — |
| COMP-014 | Person / cast page | P2 | L | COMP-002 | C | — |
| COMP-015 | Special category presets | P2 | M | COMP-005 | C | — |
| COMP-016 | Auth reset + optional OAuth | P2 | L | — | C | — |
| COMP-017 | About / Contact pages | P2 | S | — | C | — |
| COMP-018 | Multi-origin HLS failover UI (hợp pháp) | P2 | M | — | C | — |
| COMP-019 | Player mobile landscape / slow-buffer UX | P2 | S | — | C | — |
| COMP-020 | Billboard hero (auto-rotate, dots, skeleton) | P0 UI | M | — | D | — |
| COMP-021 | Horizontal row carousels + chevron | P0 UI | M | — | D | — |
| COMP-022 | Detail cinematic layout | P0 UI | M | COMP-002 | D | — |
| COMP-023 | Skeleton system (Hero / Detail / Row) | P0 UI | S | — | D | — |
| COMP-024 | Mobile nav drawer polish | P1 UI | S | — | D | — |
| COMP-025 | Auth screens visual polish | P2 UI | S | — | D | — |

**Ngoài COMP (bắt buộc song song từ scorecard, không lặp chi tiết ở đây):** FEAT-001 upload chunked, FEAT-002 episode edit, FEAT-003 wizard, FEAT-004 R2/worker ops — LiveStream thắng đối thủ nhờ CMS; phải làm trước hoặc song song Phase A.

---

## Phase A — P0 Discovery IA & search/trailer (tuần 1–4)

**Gate phase A:** Movie và series phân biệt trên admin + public; search lọc year/genre/country/kind/sort; trailer gắn được và dùng trên hover khi có; build+health+HLS PASS.

### COMP-001 — Schema + API `kind` movie | series

| | |
|---|---|
| **Goal** | Mọi title có `kind` rõ; movie = một playback unit không bắt user nghĩ “Tập 1”. |
| **Current** | `series` table không `kind`; mọi thứ là series+episodes (`server/src/db/schema.ts`). |
| **Steps** | 1) Migration SQLite: `kind TEXT CHECK IN ('movie','series') DEFAULT 'series'`. 2) Mapper DTO (`server/src/lib/mappers.ts`). 3) Filter `GET /api/series?kind=` + home sections. 4) Seed/demo gán kind. |
| **Files** | `server/src/db/schema.ts`, migrate script, `server/src/routes/catalog.ts`, `server/src/routes/admin.ts`, `web/src/api/types.ts` |
| **Deps** | — |
| **Acceptance** | API trả `kind`; filter `kind=movie` chỉ movie; backward-compat default series. |
| **Test bắt buộc** | Migrate DB trống + DB có data cũ; `GET /api/series?kind=movie` & `kind=series`; health OK. |
| **Effort / Priority** | M / P0 |

### COMP-002 — Schema metadata giàu

| | |
|---|---|
| **Goal** | Lưu cast, director, tags, ageRating, runtimeSec, tagline, trailerUrl (và optional trailerEpisodeId). |
| **Current** | title, synopsis, year, country, genres, labels — thiếu cast/tags/trailer (`FEATURE_SCORECARD` §1.4). |
| **Steps** | 1) Cột JSON/text phù hợp SQLite. 2) Admin PUT/POST validate. 3) Public detail expose fields. 4) Không gọi TMDB bắt buộc (optional import sau). |
| **Files** | `schema.ts`, `admin.ts`, `catalog.ts`, `mappers.ts`, `web/src/api/types.ts` |
| **Deps** | — (song song COMP-001 được) |
| **Acceptance** | CRUD metadata qua API; detail JSON có đủ field (null OK). |
| **Test bắt buộc** | Tạo series với cast/tags/trailerUrl → GET detail khớp; series cũ null-safe. |
| **Effort / Priority** | M / P0 |

### COMP-003 — Admin IA + forms metadata

| | |
|---|---|
| **Goal** | Admin chọn Phim lẻ / Series; form nhập metadata giàu; movie UX 1 file playback. |
| **Current** | `AdminSeries` / `AdminEpisodes` form-style; không kind (`web/src/pages/admin/*`). |
| **Steps** | 1) Nav “Phim lẻ” / “Series”. 2) Form fields COMP-002. 3) Movie: tạo kèm episode ẩn hoặc `number=1` ẩn trên UI. 4) Gắn wizard FEAT-003 nếu đã có. |
| **Files** | `AdminLayout.tsx`, `AdminSeries.tsx`, `AdminEpisodes.tsx`, `web/src/api/index.ts` |
| **Deps** | COMP-001, COMP-002 |
| **Acceptance** | Editor tạo movie + upload 1 nguồn &lt; 10 phút; series giữ multi-ep. |
| **Test bắt buộc** | Smoke UI + API: 1 movie, 1 series 2 tập; RBAC editor vẫn OK. |
| **Effort / Priority** | M / P0 |

### COMP-004 — Public IA movie vs series

| | |
|---|---|
| **Goal** | Browse/detail/watch không hiện “Tập 1” gây rối với phim lẻ; badge loại rõ. |
| **Current** | Routes `/phim/:slug`, `/xem/:slug/:ep` luôn tập. |
| **Steps** | 1) Badge PHIM LẺ / PHIM BỘ trên `PosterCard`. 2) Detail movie: CTA “Xem phim” → watch ep ẩn. 3) Copy UI ẩn số tập khi kind=movie. 4) Optional route alias `/phim-le` filter. |
| **Files** | `PosterCard.tsx`, `SeriesDetail.tsx`, `Watch.tsx`, `Home.tsx`, `Search.tsx` |
| **Deps** | COMP-001, COMP-003 |
| **Acceptance** | Movie không list “Tập 1” trên card; watch vẫn HLS. |
| **Test bắt buộc** | Manual: movie vs series trên home/detail/watch; deep-link cũ series còn chạy. |
| **Effort / Priority** | M / P0 |

### COMP-005 — Faceted search + sort UI

| | |
|---|---|
| **Goal** | Trang tìm kiếm lọc genre / year / country / status / kind + sort; URL sync. |
| **Current** | `Search.tsx` 1 ô; API `GET /api/series` đã hỗ trợ một phần filters. |
| **Steps** | 1) Expose filters trên UI. 2) Sort: updatedAt, viewCount, year, title, rating avg nếu có. 3) Querystring shareable. 4) Chips genre nhanh (ý FilmP2P). |
| **Files** | `web/src/pages/Search.tsx`, `server/src/routes/catalog.ts`, optional browse page mới |
| **Deps** | — (kind filter tốt hơn sau COMP-001) |
| **Acceptance** | User lọc năm+thể loại+kind không cần đoán tên; URL reload giữ filter. |
| **Test bắt buộc** | API filter matrix + UI smoke 3 combo; empty state OK. |
| **Effort / Priority** | M / P0 |

### COMP-006 — Trailer metadata + hover/hero

| | |
|---|---|
| **Goal** | Admin gắn `trailerUrl` (YouTube official hoặc HLS short clip **do mình encode**); hover/hero ưu tiên trailer thay full episode. |
| **Current** | Hover dùng tập ready mới nhất (`MutedPreviewPlayer`). |
| **Steps** | 1) Field trailerUrl (COMP-002). 2) `resolveHoverPreview` ưu tiên trailer. 3) Detail section trailer. 4) **Không** nhúng pirate stream; YouTube chỉ khi admin cung cấp URL hợp lệ. |
| **Files** | `resolveHoverPreview.ts`, `HoverPreviewCard.tsx`, `PosterCard.tsx`, `SeriesDetail.tsx`, `Home.tsx` hero |
| **Deps** | COMP-002 |
| **Acceptance** | Có trailer → hover/detail dùng trailer; không có → fallback hiện tại. |
| **Test bắt buộc** | Series có/không trailerUrl; không regression muted HLS fallback. |
| **Effort / Priority** | M / P0 |

**Gate A checklist:** COMP-001…006 PASS + FEAT-001/002 khuyến nghị PASS.

---

## Phase B — P1 Discover polish (tuần 5–8)

**Gate phase B:** Season UI (nếu series dài), related rows, SEO cơ bản, share `?t=`, sort browse, quick-actions preview.

### COMP-007 — Multi-season

| | |
|---|---|
| **Goal** | `seasonNumber` trên episodes; tabs mùa; `?season=` sync. |
| **Current** | `episodes.number` unique per series; không season. |
| **Steps** | Migration `seasonNumber DEFAULT 1`; unique (seriesId, seasonNumber, number); AdminEpisodes; SeriesDetail tabs; Watch prev/next trong season. |
| **Files** | `schema.ts`, `AdminEpisodes.tsx`, `SeriesDetail.tsx`, `Watch.tsx`, catalog routes |
| **Deps** | COMP-001, COMP-004; nên sau FEAT-002/014 |
| **Acceptance** | Series 2 mùa chọn đúng tập; URL shareable. |
| **Test bắt buộc** | Seed 2 seasons; deep-link; reorder không phá unique. |
| **Effort / Priority** | L / P1 |

### COMP-008 — Related + personalized

| | |
|---|---|
| **Goal** | Row “Cùng thể loại”; optional “Vì bạn đã xem” từ history/favorites (không TMDB bắt buộc). |
| **Current** | Không related rows. |
| **Steps** | 1) API `GET /api/series/:id/related?limit=12` genre overlap. 2) Home row từ top history genres nếu login. 3) UI `SeriesDetail` + `Home`. |
| **Files** | `catalog.ts`, `me.ts`, `Home.tsx`, `SeriesDetail.tsx`, component row mới |
| **Deps** | COMP-002 |
| **Acceptance** | Detail luôn có related nếu đủ catalog; personalized ẩn khi guest/empty. |
| **Test bắt buộc** | Related deterministic với fixture genres; empty OK. |
| **Effort / Priority** | M / P1 |

### COMP-009 — SEO

| | |
|---|---|
| **Goal** | Title/description/OG/Twitter + JSON-LD VideoObject/TVSeries; sitemap XML cơ bản. |
| **Current** | SEO mỏng / thiếu Helmet pattern. |
| **Steps** | 1) Chọn `react-helmet-async` hoặc meta Vite SSR-lite. 2) Hook per page Home/Detail/Watch. 3) `GET /sitemap.xml` từ catalog public. |
| **Files** | `web/src/main.tsx`, pages detail/home, `server` static hoặc route sitemap |
| **Deps** | COMP-004 (kind trong schema.org) |
| **Acceptance** | View-source có og:title; sitemap liệt kê slug public. |
| **Test bắt buộc** | Crawl 3 URL; không lộ admin routes. |
| **Effort / Priority** | M / P1 |

### COMP-010 — Share + `?t=`

| | |
|---|---|
| **Goal** | Copy link xem; `?t=seconds` seek; optional autoplay scroll-to-player. |
| **Current** | Resume từ history; thiếu share timestamp. |
| **Steps** | Watch đọc `t`; HlsPlayer `startPosition`; nút Copy link; SeriesDetail CTA. |
| **Files** | `Watch.tsx`, `HlsPlayer.tsx` |
| **Deps** | — |
| **Acceptance** | Mở `/xem/slug/1?t=120` bắt đầu ~120s (±2s). |
| **Test bắt buộc** | Manual + unit parse `t`; invalid `t` ignore. |
| **Effort / Priority** | S–M / P1 |

### COMP-011 — Quick-actions hover

| | |
|---|---|
| **Goal** | Trên expand hover: Trailer / Xem ngay / Share / Yêu thích (ý FilmP2P modal; giữ HLS preview LiveStream). |
| **Current** | Hover preview phát; ít CTA. |
| **Steps** | Mở rộng `HoverPreviewCard` / `PosterCard`; không phá pointer-fine gate. |
| **Files** | `HoverPreviewCard.tsx`, `PosterCard.tsx`, `Library` favorites API |
| **Deps** | COMP-006 |
| **Acceptance** | 4 CTA hoạt động trên desktop hover; mobile không vỡ tap. |
| **Test bắt buộc** | Manual desktop + mobile; a11y keyboard cơ bản. |
| **Effort / Priority** | M / P1 |

### COMP-012 — Browse sort

| | |
|---|---|
| **Goal** | Latest/Top/Completed + query sort thống nhất; optional dropdown trên genre page. |
| **Current** | Routes riêng sort cố định. |
| **Steps** | Param `sort=` trên catalog; UI Genre/Latest. |
| **Files** | `catalog.ts`, `Genre.tsx`, `Latest.tsx`, `Top.tsx` |
| **Deps** | COMP-005 |
| **Acceptance** | Đổi sort cập nhật list + URL. |
| **Test bắt buộc** | So khớp order SQL với UI 2 sort. |
| **Effort / Priority** | S–M / P1 |

**Gate B:** COMP-007…012 (COMP-007 có thể Won’t do nếu chưa cần series dài) + regression player.

---

## Phase C — P2 Polish (tuần 9–12+)

**Gate phase C:** Theme hoặc auth/SEO extras theo ưu tiên product; không phá P0.

### COMP-013 — Light / Dark theme

| | |
|---|---|
| **Goal** | CSS variables + toggle; persist `localStorage`. |
| **Current** | Theme app tương đối cố định. |
| **Steps** | Token màu; `ThemeProvider`; Header switch; admin readable cả 2 mode. |
| **Files** | `web/src` global CSS, `Header.tsx`, `main.tsx` |
| **Deps** | — |
| **Acceptance** | Toggle không FOUC nặng; contrast đủ. |
| **Test bắt buộc** | Manual light/dark trên Home/Watch/Admin. |
| **Effort / Priority** | M / P2 |

### COMP-014 — Person / cast page

| | |
|---|---|
| **Goal** | `/dien-vien/:slug` liệt kê titles có cast chứa person (data admin nhập). |
| **Current** | Không. |
| **Steps** | Normalize cast entries `{name, slug?, role?}`; page + link từ detail. |
| **Files** | schema optional `people` table hoặc derive từ JSON; `App.tsx` route; page mới |
| **Deps** | COMP-002 |
| **Acceptance** | Click cast → danh sách phim liên quan. |
| **Test bắt buộc** | Fixture 1 person 2 titles; 404 unknown slug. |
| **Effort / Priority** | L / P2 |

### COMP-015 — Special category presets

| | |
|---|---|
| **Goal** | Preset filter (Anime, K-Drama…) = country/genre/tag rules trong config admin hoặc constant. |
| **Current** | Chỉ genre slug. |
| **Steps** | Config map; routes `/kham-pha/:preset` hoặc chips Home. |
| **Files** | catalog filter helper, `Home.tsx` / Sidebar optional |
| **Deps** | COMP-005 |
| **Acceptance** | Preset trả đúng subset. |
| **Test bắt buộc** | Unit map preset → query; empty OK. |
| **Effort / Priority** | M / P2 |

### COMP-016 — Auth reset + optional OAuth

| | |
|---|---|
| **Goal** | Forgot-password email flow; optional Google OAuth nếu có IdP. |
| **Current** | Register/login JWT (`server/src/routes/auth.ts`). |
| **Steps** | Token reset bảng; SMTP/env; UI pages; OAuth chỉ khi secret cấu hình. |
| **Files** | `auth.ts`, `Auth.tsx`, `AuthModal` nếu có |
| **Deps** | — |
| **Acceptance** | Reset đổi mật khẩu thành công; OAuth skip nếu unset. |
| **Test bắt buộc** | Unit token expiry; rate-limit reset. |
| **Effort / Priority** | L / P2 |

### COMP-017 — About / Contact

| | |
|---|---|
| **Goal** | Trang giới thiệu + form liên hệ (Formspree/email API self). |
| **Files** | pages mới, `App.tsx`, Footer/Header links |
| **Deps** | — |
| **Acceptance** | Submit contact không 500; không commit secrets. |
| **Test bắt buộc** | Build + route 200. |
| **Effort / Priority** | S / P2 |

### COMP-018 — Multi-origin HLS failover UI

| | |
|---|---|
| **Goal** | Nếu có `playbackUrl` local + R2, UI “Nguồn 1/2” failover khi error (ý multi-server WeFlix, **chỉ origin hợp pháp**). |
| **Current** | R2 publish / playbackUrl đã có hướng scaling. |
| **Steps** | HlsPlayer nhận candidates[]; on fatal → next; telemetry. |
| **Files** | `HlsPlayer.tsx`, `Watch.tsx`, playback route |
| **Deps** | FEAT-004 / R2 ops khuyến nghị |
| **Acceptance** | Giả lập URL1 fail → tự hoặc tay chuyển URL2. |
| **Test bắt buộc** | Mock fatal MEDIA_ERROR; không dùng domain pirate. |
| **Effort / Priority** | M / P2 |

### COMP-019 — Mobile landscape / slow-buffer UX

| | |
|---|---|
| **Goal** | Gợi ý xoay ngang theater; message khi buffer lâu (ý FilmP2P). |
| **Files** | `HlsPlayer.tsx`, `Watch.tsx` |
| **Deps** | — |
| **Acceptance** | Sau N giây waiting hiện “Mạng chậm…” + nút reload nguồn. |
| **Test bắt buộc** | Manual throttle network. |
| **Effort / Priority** | S / P2 |

---

## Phases tóm tắt

| Phase | IDs | DoD phase |
|---|---|---|
| **A** | COMP-001…006 (+ FEAT-001…004 khuyến nghị) | Movie/series IA; metadata API; search facet; trailer hover |
| **B** | COMP-007…012 | Season (or defer); related; SEO; share; preview CTA; sort |
| **C** | COMP-013…019 | Theme/auth/person/presets/contact/failover/mobile UX theo nhu cầu |

---

## Quy tắc test-after-each

1. Chạy **Test bắt buộc** của COMP vừa xong trước khi mở COMP phụ thuộc.  
2. Ghi kết quả ngắn vào `docs/COMPETITOR_UPGRADE_TEST_RESULTS.md` (tạo khi bắt đầu implement).  
3. Fail → fix cùng COMP; **không** amend plan bằng cách nhảy cóc.  
4. Không thêm dependency WeFlix/FilmP2P vào `package.json` LiveStream.

---

## Won’t do (có chủ đích)

| Ý tưởng đối thủ | Lý do |
|---|---|
| VidLink / VidSrc / multiembed pirate | Vi phạm bản quyền; ngoài mô hình self-host |
| Google Drive crowd JSON catalog | Phân phối nội dung không kiểm soát quyền |
| BitTorrent / WebTorrent / magnet | Ethics + legal; tên FilmP2P gây hiểu nhầm — **không** implement |
| Gemini chatbot (README stale) | Ngoài core VOD; chi phí/API key; không có trong code FilmP2P hiện tại |
| Copy Firebase/Firestore schema WeFlix | LiveStream đã có JWT+SQLite; chỉ học UX |

---

## Thứ tự thực thi đề xuất (5 ID đầu khi bắt đầu code)

1. **COMP-001** — `kind` movie \| series  
2. **COMP-002** — metadata schema giàu  
3. **COMP-003** — admin IA + forms  
4. **COMP-005** — faceted search UI (có thể song song sau khi API kind sẵn)  
5. **COMP-006** — trailer + hover/hero  

*(COMP-004 ngay sau COMP-003. FEAT-001/002 nên chạy song song Phase A để CMS không tụt lại.)*

---

## Liên kết

- Phân tích đầy đủ: [`COMPETITOR_FEATURE_ANALYSIS.md`](./COMPETITOR_FEATURE_ANALYSIS.md)  
- Scorecard: [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md)  
- Plan FEAT nội bộ: [`FEATURE_UPGRADE_PLAN.md`](./FEATURE_UPGRADE_PLAN.md)

---

## Phase D — UI/UX surface (bổ sung 2026-09-06)

**Nguồn:** §9 [`COMPETITOR_FEATURE_ANALYSIS.md`](./COMPETITOR_FEATURE_ANALYSIS.md)  
**Nguyên tắc:** clone khái niệm layout/nav/hero/rows/detail/search/theme/skeleton/mobile — **không** copy Tailwind dump / Framer / asset từ WeFlix hoặc FilmP2P. Giữ HLS ABR, EQ, hover preview, admin encode.

**Gate phase D:** Home có billboard rotate + ít nhất 1 row carousel; detail có backdrop cinematic + skeleton; mobile drawer usable; theme toggle nếu COMP-013 Done; build+health+HLS PASS.

### Master checklist — bổ sung

| ID | Name | Priority | Effort | Depends | Phase | Trùng |
|---|---|---|---|---|---|---|
| COMP-020 | Billboard hero (auto-rotate, dots, skeleton, taller) | P0 UI | M | — | D | NETFLIX_BROWSE / Home |
| COMP-021 | Horizontal row carousels + chevron | P0 UI | M | — | D | — |
| COMP-022 | Detail cinematic layout (full-bleed backdrop, meta chrome, cast) | P0 UI | M | COMP-002 | D | — |
| COMP-023 | Skeleton system (Hero / Detail / Row) | P0 UI | S | — | D | EmptyState |
| COMP-024 | Mobile nav drawer polish | P1 UI | S | — | D | Header |
| COMP-025 | Auth screens visual polish | P2 UI | S | — | D | Auth* |

### COMP-020 — Billboard hero

| | |
|---|---|
| **Goal** | Hero Home xoay 3–6 title hot; fade; progress dots; skeleton khi loading; chiều cao ~50–70vh desktop. |
| **Current** | Một `hot[0]`, ~280px (`Home.tsx` / `Home.css`). |
| **Steps** | 1) Lấy `hot` slice. 2) Interval ~6–7s pause on hover. 3) Dots + CTA Xem / Chi tiết. 4) Dùng `HeroSkeleton` (COMP-023). |
| **Files** | `Home.tsx`, `Home.css`, optional `BillboardHero.tsx` |
| **Acceptance** | ≥2 hot → auto-advance; 1 hot → tĩnh; empty → welcome. |
| **Test bắt buộc** | Manual rotate; `prefers-reduced-motion` không spam animation; build OK. |
| **Effort / Priority** | M / P0 UI |

### COMP-021 — Row carousels

| | |
|---|---|
| **Goal** | Hàng ngang cuộn + nút prev/next; dùng cho Đang hot / Mới / Related / Personalized. |
| **Current** | CSS grid cố định cột. |
| **Steps** | Component `PosterRow` overflow-x + chevron; giữ PosterCard/hover; mobile swipe. |
| **Files** | `PosterRow.tsx` + css; `Home.tsx`; `SeriesDetail.tsx` |
| **Acceptance** | Chevron cuộn được khi overflow; hover preview không bị `overflow:hidden` cắt (overflow visible trên trục cần thiết). |
| **Test bắt buộc** | Manual desktop+mobile; không regression hover singleton. |
| **Effort / Priority** | M / P0 UI |

### COMP-022 — Detail cinematic

| | |
|---|---|
| **Goal** | Backdrop full-bleed + gradient; poster; tagline/runtime/cast khi có metadata; CTA rõ movie vs series. |
| **Current** | `SeriesDetail` layout thông tin phẳng. |
| **Steps** | Restyle header detail; cast chips link (COMP-014 optional); trailer embed nếu URL. |
| **Files** | `SeriesDetail.tsx`, `SeriesDetail.css` |
| **Acceptance** | Có poster → backdrop; thiếu metadata → không vỡ layout. |
| **Test bắt buộc** | Movie + series detail smoke; build OK. |
| **Effort / Priority** | M / P0 UI |

### COMP-023 — Skeleton system

| | |
|---|---|
| **Goal** | `HeroSkeleton`, `DetailSkeleton`, `RowSkeleton` thống nhất token `--bg-*`. |
| **Current** | Chỉ `PosterGridSkeleton`. |
| **Steps** | Mở rộng `EmptyState.tsx` + CSS; gắn Home/Detail/Search. |
| **Acceptance** | Loading không flash layout jump lớn. |
| **Test bắt buộc** | Visual smoke; build OK. |
| **Effort / Priority** | S / P0 UI |

### COMP-024 — Mobile nav drawer

| | |
|---|---|
| **Goal** | Menu mobile full-panel; lock body scroll; touch targets ≥44px; đóng sau navigate. |
| **Current** | Burger mở nav inline. |
| **Steps** | Overlay drawer trong `Header.tsx` / `Header.css`. |
| **Acceptance** | iPhone-width: mở/đóng ổn; không scroll nền. |
| **Test bắt buộc** | Manual DevTools mobile; a11y `aria-expanded`. |
| **Effort / Priority** | S / P1 UI |

### COMP-025 — Auth visual polish

| | |
|---|---|
| **Goal** | Auth page/modal hierarchy rõ, spacing, Vietnamese copy nhất quán (login/đăng ký). |
| **Current** | `Auth.tsx` / `AuthModal` usable nhưng thô. |
| **Steps** | CSS polish; không bắt buộc OAuth (COMP-016). |
| **Acceptance** | Form readable light+dark nếu theme bật. |
| **Test bắt buộc** | Login/register smoke; build OK. |
| **Effort / Priority** | S / P2 UI |

**Thứ tự UI đề xuất:** COMP-023 → COMP-020 → COMP-021 → COMP-022 → COMP-024 → COMP-013 → COMP-025 (có thể xen kẽ sau Phase A schema).

**Cập nhật DoD chương trình:** thêm “Home billboard + row carousel + detail cinematic đạt acceptance COMP-020…022”.

**Ghi chú triển khai:** từ vòng này trở đi plan được **execute** (không còn “chỉ lập kế hoạch”); vẫn bắt buộc test-after-each + ghi `COMPETITOR_UPGRADE_TEST_RESULTS.md`.

