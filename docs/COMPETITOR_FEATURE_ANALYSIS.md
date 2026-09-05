# Phân tích đối thủ — WeFlix_v2 & Playing-FilmP2P vs LiveStream

**Ngày:** 2026-09-06  
**Phạm vi:** Deep-read README + source (routes, components, models, auth, player, catalog) từ clone tạm ngoài workspace LiveStream. **Không** merge code, **không** `npm install` vào LiveStream.  
**LiveStream tham chiếu:** [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md) (overall **6.7/10**) + code `server/`, `web/`.  
**Kế hoạch nâng cấp từ phân tích này:** [`COMPETITOR_UPGRADE_PLAN.md`](./COMPETITOR_UPGRADE_PLAN.md).

---

## Ràng buộc đạo đức & pháp lý (đọc trước)

| Repo | License code | Mô hình nội dung | Ghi chú LiveStream |
|---|---|---|---|
| **WeFlix_v2** | MIT (© 2026 Phyo Min Thein) | Catalog TMDB + **iframe embed** bên thứ ba (`vidlink.pro`, `vidnest.fun`, `vidsrc-embed.ru`, `multiembed.mov`) — discovery UI hợp pháp, playback thường gắn nội dung có bản quyền qua aggregator | Chỉ lấy ý tưởng **UX/catalog/auth/SEO**. **Không** tích hợp pirate embed / “multi server” kiểu scrape stream. |
| **Playing-FilmP2P** | MIT (© 2025 Hoang Manh) | Tên “P2P” nhưng **code hiện tại không có BitTorrent/WebTorrent/magnet**. Catalog JSON cộng đồng (`crytals-sc/json-link`) + phát **Google Drive preview / URL direct** (mp4/webm/m3u8). README còn nhắc Gemini chatbot nhưng **đã không còn trong code**. | Chỉ lấy ý tưởng **UX hợp pháp** (search facet, trailer YouTube, theme, preview, related). **Không** lên kế hoạch pipeline torrent / phân phối trái phép. Host Drive/JSON bên thứ ba có thể chứa nội dung không có quyền — không mô phỏng mô hình đó. |

**Nguyên tắc reimplement:** ý tưởng sản phẩm → viết lại trên stack LiveStream (Fastify + React + HLS tự host). Không copy asset thương mại, không dán dump code lớn từ repo đối thủ.

---

## 1. Feature catalog — WeFlix_v2

**Repo:** https://github.com/kweephyo-pmt/WeFlix_v2 · Demo: https://weflix.app  
**Stack:** React 18, Vite, Tailwind, React Router 6, Framer Motion, Firebase Auth/Firestore, TMDB API, Vercel Analytics/Speed Insights, react-helmet-async, TanStack Query/Virtual (deps), Cloudflare Turnstile trên auth.

### 1.1 Khám phá / Catalog

| # | Tính năng | Hiện trạng trong code |
|---|---|---|
| W01 | Trang chủ Netflix-style | `HomePage`: HeroBanner auto-advance + nhiều `TrendingRow` |
| W02 | Tách **Movies** vs **TV Shows** | Routes `/movies`, `/series` (+ legacy `/movie/:slug`, `/tv/:slug`) |
| W03 | Trending theo tuần (TMDB) | `fetchTrending`; Movies/Series mặc định trending |
| W04 | Browse theo genre | Sidebar + URL shareable (`/movies/:genreSlug`, query `genre`) |
| W05 | Sort browse | Most Popular, Top Rated, Newest, Oldest, Highest Grossing (movies); URL `:sortSlug` |
| W06 | Special categories | Anime, Thai/Korean/Chinese Movie; K-Drama, C-Drama, Donghua, Thai Drama (`SPECIAL_PARAMS`) |
| W07 | Infinite scroll grid | `ContentGrid` + skeleton + error handling |
| W08 | Search live | `/search` — kết quả movie+TV; genre chips nhảy category |
| W09 | Slug URL readable | `/movies/watch/{slug}-{id}`, `/series/watch/...` (`toSlug` / `toDetailPath`) |
| W10 | Ranking “Top 10” row | `TrendingRow` `showRank` + filter ngôn ngữ |
| W11 | Now Playing / curated rows | Variants `now_playing`, `popular`, filter `originalLanguage` / `sinceYear` |
| W12 | Asian / language curated rows | Home rows lọc ko/ja/zh… |
| W13 | Collapsible icon sidebar | Genre lists + special categories, hover-expand |
| W14 | Global content (no lang lock) | Discover không khóa 1 ngôn ngữ mặc định |

### 1.2 Chi tiết nội dung

| # | Tính năng | Hiện trạng |
|---|---|---|
| W15 | Detail movie full-bleed backdrop | Poster, rating, genres, **tagline**, overview, runtime |
| W16 | Detail TV + seasons/episodes | Season tabs (kéo ngang), episode cards + thumbnails TMDB |
| W17 | Deep-link season/episode | Query `?season=&episode=` sync player |
| W18 | Cast row + Person page | `CastRow` → `/person/:id/:slug` (bio + filmography) |
| W19 | Related / recommendations | TMDB recommendations trên detail |
| W20 | Production / credits metadata | `append_to_response=credits` trên detail fetch |
| W21 | Detail loading skeleton | `DetailPageSkeleton` |
| W22 | Resume CW trên detail TV | Đọc continue_watching cache → chọn S/E |

### 1.3 Player

| # | Tính năng | Hiện trạng |
|---|---|---|
| W23 | In-browser player trên detail | Iframe embed, click-to-activate / delay render |
| W24 | Multi-source server switcher | Movie: VidNest / VidLink / VidSrc / Super; TV: tương tự |
| W25 | Hover trailer preview trên card | YouTube trailer iframe trên `ContentCard` (mute toggle) |
| W26 | PiP / fullscreen via embed | Phụ thuộc player bên thứ ba (không HLS tự host) |

### 1.4 User / Auth

| # | Tính năng | Hiện trạng |
|---|---|---|
| W27 | Auth modal login/signup | Email+password Firebase + Google popup |
| W28 | Account linking Google↔email | Xử lý credential collision |
| W29 | Password reset flow | Modal + `/reset-password` page |
| W30 | Email verification | `/verify-email`, `/auth-action` |
| W31 | Cloudflare Turnstile | Bot protection trên AuthModal |
| W32 | Watchlist cloud-synced | Firestore `users/{uid}/watchlist` + localStorage cache |
| W33 | Watchlist page | `/watchlist` |
| W34 | Continue Watching Firestore | `continue_watching` collection; row trên Home |
| W35 | Personalized “Because you watched” | `PersonalizedRow` — seed CW+watchlist → TMDB recommendations |
| W36 | Auth-gated watchlist buttons | Trên card/detail; mở AuthModal nếu chưa login |
| W37 | Cached auth user | `localStorage` `weflix_user` để hydrate UI nhanh |

### 1.5 SEO / Ops / Khác

| # | Tính năng | Hiện trạng |
|---|---|---|
| W38 | Dynamic SEO | Title, description, OG, Twitter, canonical, JSON-LD |
| W39 | Sitemap / robots | `public/sitemap.xml`, `robots.txt` |
| W40 | PWA manifest | `public/manifest.json` |
| W41 | Vercel Analytics + Speed Insights | Trong `App.jsx` |
| W42 | Framer Motion transitions | Home / detail / auth |
| W43 | Firebase Hosting config | `firebase.json`, Firestore rules/indexes |

### 1.6 Không có (so với LiveStream)

- Admin CMS / upload / encode / HLS ABR tự host  
- Comments, ratings nội bộ, lịch chiếu weekday  
- Multi-audio / equalizer / thumbs scrub / QoE telemetry  
- RBAC editor/admin, Docker/worker/R2  

---

## 2. Feature catalog — Playing-FilmP2P (XemPhim Online)

**Repo:** https://github.com/MaxxAlan/Playing-FilmP2P · Demo: https://xemphimonline.vercel.app/  
**Stack:** React 19, TypeScript, Vite 6, Tailwind 4, React Router 7 (HashRouter), Vitest. Catalog remote JSON; không backend riêng trong repo.

### 2.1 Catalog / Discover

| # | Tính năng | Hiện trạng trong code |
|---|---|---|
| F01 | Home hero xoay featured | `Hero` + interval ~4s; pause khi hover |
| F02 | Grid phim + pagination | `PAGE_SIZE=18`, `Pagination` |
| F03 | Search box trên Home | Submit → `/search?q=` |
| F04 | Search nâng cao | Text + year + genre + sort (relevance / title / year); URL sync |
| F05 | Genre chips nhanh | Top genres theo count trên Search |
| F06 | Categories page | `/categories` filter genre + infinite scroll |
| F07 | Badge **PHIM LẺ** vs **PHIM BỘ** | Dựa trên có `episodes[]` hay không |
| F08 | Metadata catalog | title, poster, summary, genre[], year, rating, duration, category, trailerUrl |
| F09 | Lazy image | `LazyImage` |
| F10 | Skeleton card | `MovieCardSkeleton` |
| F11 | Community catalog JSON | Fetch `raw.githubusercontent.com/.../movies.json` (ngoài repo) |
| F12 | Crowdsource update link | README trỏ form/site cập nhật phim cộng đồng |

### 2.2 Chi tiết / Social lite

| # | Tính năng | Hiện trạng |
|---|---|---|
| F13 | Movie detail | Poster, genres, summary, rating, duration |
| F14 | Episode list cho series | Chọn tập → đổi `playback` |
| F15 | Trailer YouTube nhúng | `TrailerPlayer` + `useTrailerSearch` |
| F16 | Trailer modal + search YT | Modal tìm trailer/OST; API key optional; fallback link YouTube |
| F17 | Recommended “Có thể bạn cũng thích” | Overlap genre, random 6 |
| F18 | Quick preview modal | Hover/popup: badge loại, rating, year, trailer, share, bookmark UI local |
| F19 | Share link clipboard | Copy hash route detail |
| F20 | Autoplay scroll-to-player | `?autoplay=1` / `state.autoplay` |
| F21 | About + Contact | `/about`, `/contact` (Formspree) |
| F22 | 404 gợi ý random movies | `NotFoundPage` |

### 2.3 Player

| # | Tính năng | Hiện trạng |
|---|---|---|
| F23 | Dual playback source | `drive` (Google Drive iframe) hoặc `direct` URL |
| F24 | Native `<video>` cho mp4/webm/ogg/m3u8 | Controls + `<track>` subtitles |
| F25 | Theater mode + Escape | Full viewport overlay |
| F26 | Fullscreen + iOS webkitEnterFullscreen | Fallback theater nếu iframe cross-origin |
| F27 | Landscape lock khi fullscreen | `screen.orientation.lock('landscape')` khi portrait |
| F28 | Slow-source reload | Timeout 12s → “Nguồn chậm — tải lại” |
| F29 | Loading overlay “Đang kết nối nguồn phát” | Spinner overlay |
| F30 | Subtitle status chrome | Label idle/loading/ready/error; Drive: gợi ý CC trong nguồn |

### 2.4 Theme / UX shell

| # | Tính năng | Hiện trạng |
|---|---|---|
| F31 | Light / Dark theme | `ThemeProvider` + CSS variables + `ThemeSwitcher` |
| F32 | Responsive header/footer | Mobile menu |
| F33 | Infinite scroll hook | Categories |
| F34 | Unit tests | movieMapper, youtube helpers (Vitest) |

### 2.5 README vs code (stale)

| README claim | Code hiện tại |
|---|---|
| Gemini AI Chatbot | **Không** còn dependency/file chatbot |
| `GEMINI_API_KEY` | Không dùng; trailer có thể dùng YouTube Data API key |
| “P2P” | **Không** torrent/P2P peer pipeline |

### 2.6 Không có

- Auth, watchlist cloud, continue watching position  
- Admin CMS / encode / ABR / R2  
- Comments, schedule, multi-audio, QoE  
- True BitTorrent distribution  

---

## 3. LiveStream — tóm tắt feature (tham chiếu scorecard)

**Overall scorecard: 6.7/10** — mạnh playback + browse series; yếu admin metadata & IA phim lẻ.

| Trụ | Điểm | Điểm mạnh | Điểm yếu |
|---|---|---|---|
| Admin CMS & metadata | 5.8 | CRUD series/tập, genres, schedule, soft-delete, RBAC, QoE 24h | Form thô; thiếu cast/tags/age/trailer; không edit episode UI; chunked client chưa wire; không movie IA |
| Discoverability | 6.2 | Home/hero/hot/latest/top/schedule/genre | Search đơn giản; facet UI thiếu |
| Player & high-res | 7.6 | HLS ABR, buffer, recover, resume, VTT/SRT, multi-audio, thumbs, EQ, theater/PiP | Trailer riêng thiếu; analytics sâu hạn chế |
| End-user UX | 7.4 | Continue watching, favorites, rating, comments, hover muted HLS | Profile mỏng; related/personalized thiếu; SEO mỏng |
| Scale / ops | 6.5 | Docker, Caddy HLS, worker, R2 publish, CF docs | SQLite; monitoring yếu |

**Routes chính:** `/`, `/lich-chieu`, `/moi-cap-nhat`, `/top`, `/hoan-thanh`, `/the-loai/:slug`, `/tim-kiem`, `/phim/:slug`, `/xem/:slug/:ep`, auth, `/yeu-thich`, `/lich-su`, `/admin/*`.

Chi tiết đầy đủ: [`FEATURE_SCORECARD.md`](./FEATURE_SCORECARD.md). Plan nội bộ đã có: [`FEATURE_UPGRADE_PLAN.md`](./FEATURE_UPGRADE_PLAN.md) (FEAT-001…).

---

## 4. Ma trận so sánh

Ký hiệu: **Có** / **Một phần** / **Không** / **Tốt hơn** (cột LiveStream = LiveStream so với đối thủ trên cùng hàng).

| Tính năng | WeFlix | FilmP2P | LiveStream |
|---|---|---|---|
| Tách phim lẻ / series (IA) | Có | Có (badge + model) | Không |
| Multi-season UI | Có | Không (list tập phẳng) | Không |
| Metadata cast / person page | Có | Không | Không |
| Tagline / runtime / rich TMDB-like fields | Có | Một phần (duration, rating) | Một phần (year/country/genres) |
| Faceted search (genre/year/sort) | Một phần (genre+sort browse; search kém facet) | Có | Một phần (API có; UI thiếu) |
| Curated special categories | Có | Không | Không |
| Infinite scroll / pagination | Có (infinite) | Có (cả hai) | Một phần (paginate API, UI list) |
| Hero + rows browse | Có | Có (hero + grid) | Có — **Tốt hơn** (schedule/hot/ranking VN) |
| Continue watching | Có | Không | Có — **Tốt hơn** (positionSec HLS) |
| Watchlist / favorites | Có | Một phần (bookmark UI local) | Có |
| Personalized / related rows | Có | Có (related genre) | Không |
| Hover preview | Có (trailer YT) | Có (quick modal + trailer) | Có — **Tốt hơn** (muted HLS thật) |
| Trailer riêng metadata | Có (YT) | Có | Không |
| Auth email + Google + reset/verify | Có | Không | Một phần (email JWT; không Google/reset sâu) |
| Comments / ratings nội bộ | Không | Không | Có — **Tốt hơn** |
| Admin CMS + upload encode | Không | Không | Có — **Tốt hơn** |
| HLS ABR tự host | Không | Một phần (direct m3u8 thô) | Có — **Tốt hơn** |
| Multi-audio / EQ / thumbs scrub | Không | Không | Có — **Tốt hơn** |
| Subtitles quản trị | Không | Có (JSON tracks) | Có — **Tốt hơn** (admin upload) |
| Theater / mobile fullscreen polish | Một phần | Có | Có |
| Light/Dark theme | Không (dark cố định) | Có | Không (theme app cố định) |
| SEO OG/JSON-LD | Có | Không | Không / yếu |
| Share deep link | Một phần (slug) | Có (clipboard + autoplay) | Một phần (`/xem/...`; thiếu `?t=`) |
| Contact / About | Không | Có | Không |
| Schedule / lịch chiếu | Không | Không | Có — **Tốt hơn** |
| Encode queue / R2 / Docker | Không | Không | Có — **Tốt hơn** |
| Pirate embed / Drive crowd catalog | Có (embed) | Có (Drive/JSON) | Không — **đúng hướng** (self-host) |

---

## 5. Nơi đối thủ **tốt hơn** LiveStream

1. **IA Movie vs Series rõ ràng** (cả hai) — LiveStream ép mọi thứ thành series+episodes.  
2. **Metadata giàu trên detail** (WeFlix: tagline, cast, person, runtime, backdrop cinematic).  
3. **Multi-season UX** (WeFlix) — tabs mùa + deep-link S/E.  
4. **Browse sort + special categories** (WeFlix) — shareable URL genre/sort.  
5. **Faceted search UI hoàn chỉnh** (FilmP2P) — year/genre/sort + chips + URL state.  
6. **Trailer YouTube / trailer modal** (cả hai) — LiveStream chưa có trailer metadata.  
7. **Personalized + related rows** (WeFlix mạnh; FilmP2P related đơn giản).  
8. **SEO động** (WeFlix) — title/OG/JSON-LD/sitemap.  
9. **Auth polish** (WeFlix) — Google, reset, verify, Turnstile.  
10. **Theme sáng/tối** (FilmP2P).  
11. **Quick preview + share** (FilmP2P) — CTA trailer/xem ngay/share trong một modal.  
12. **Player chrome mobile** (FilmP2P) — landscape lock, slow-reload messaging (ý tưởng UX; LiveStream đã có theater/PiP).

---

## 6. Tính năng đối thủ có mà LiveStream **thiếu** (gaps)

| Gap | Nguồn cảm hứng | Ghi chú |
|---|---|---|
| `kind=movie\|series` + nav tách | W02, F07 | Trùng mục tiêu scorecard P0 |
| Cast / director / person page | W18–W20 | Person page có thể phase sau |
| Tagline, runtime, age-like labels | W15 | Gắn schema metadata giàu |
| Seasons / `seasonNumber` | W16–W17 | Series dài |
| Search facets + sort trên UI | F04–F05, W05 | API series đã gần sẵn |
| Special curated filters | W06 | Optional; map country/genre rules |
| TrailerUrl + hover/hero trailer | W25, F15–F16 | Không dùng episode full làm trailer |
| Related / Because you watched | W35, F17 | Query genre overlap trước; ML sau |
| SEO Helmet + sitemap | W38–W39 | |
| OAuth Google / reset / verify | W27–W31 | Tuỳ chọn; Turnstile nếu spam |
| Light/Dark theme | F31 | |
| Share `?t=` / autoplay scroll | F19–F20 | |
| About / Contact | F21 | |
| Browse infinite scroll polish | W07, F06 | |
| Multi-mirror HLS failover UX | W24 (ý tưởng UI only) | Chỉ mirror CDN/R2 hợp pháp của mình |

**Cố ý không mang sang:** pirate iframe servers, Drive crowd piracy catalog, BitTorrent/P2P, Gemini chatbot (đã stale + ngoài scope VOD core).

---

## 7. Đề xuất nâng cấp LiveStream (ý tưởng, ưu tiên)

Gắn mục tiêu user: admin dễ, metadata giàu, phim lẻ vs series, UX hiện đại, playback mượt. Reimplement trên Fastify/React/HLS — chi tiết bước: [`COMPETITOR_UPGRADE_PLAN.md`](./COMPETITOR_UPGRADE_PLAN.md) (COMP-xxx). Trùng FEAT đã có trong [`FEATURE_UPGRADE_PLAN.md`](./FEATURE_UPGRADE_PLAN.md) được ghi rõ để tránh double-work.

### P0 — cao

| ID gợi ý | Ý tưởng | Vì sao |
|---|---|---|
| COMP-001 / FEAT-006–009 | Content type movie vs series + public IA | Gap lớn nhất vs cả 2 đối thủ |
| COMP-002 / FEAT-007 | Schema metadata: cast, director, tags, ageRating, runtime, tagline, trailerUrl | WeFlix/FilmP2P detail giàu hơn |
| COMP-003 / FEAT-005+010 | Faceted search + sort UI | FilmP2P thắng rõ |
| COMP-004 / FEAT-011 | Trailer metadata + dùng cho hover/hero (clip ngắn hoặc YT official **do admin gắn**, không scrape pirate) | Cả 2 có; LiveStream hover đang dùng tập full |
| COMP-005 | Giữ ưu tiên FEAT upload/wizard/episode edit (scorecard) | Đối thủ không có CMS — LiveStream phải thắng ở đây |

### P1

| ID gợi ý | Ý tưởng |
|---|---|
| COMP-006 / FEAT-021 | Multi-season tabs + `?season=` |
| COMP-007 / FEAT-019 | Related row + optional personalized từ history/favorites |
| COMP-008 | SEO meta/OG/JSON-LD + sitemap cơ bản |
| COMP-009 | Share link + `?t=` resume timestamp |
| COMP-010 | Quick-actions trên preview (trailer / xem / share) — bổ sung hover HLS hiện có |
| COMP-011 | Browse sort: mới / top view / rating / năm |

### P2

| ID gợi ý | Ý tưởng |
|---|---|
| COMP-012 | Light/Dark theme (CSS variables) |
| COMP-013 | Person/cast page (nếu cast có id/slug) |
| COMP-014 | Special category presets (Anime/K-Drama…) map filter country/genre |
| COMP-015 | Auth: reset password + optional OAuth |
| COMP-016 | About/Contact |
| COMP-017 | Multi-origin HLS failover UI (R2 vs local) — **không** pirate servers |
| COMP-018 | Player mobile: landscape hint / slow-buffer messaging polish |

---

## 8. Kết luận ngắn

LiveStream **đã vượt** WeFlix/FilmP2P ở playback tự host, admin/encode, comments, lịch chiếu, ABR. Đối thủ thắng ở **product surface discovery**: tách movie/series, metadata/cast/season, search facet, trailer, SEO, personalization, theme. Chiến lược đúng: **không copy** pipeline nội dung trái phép; **clone khái niệm UX** và khóa P0 movie IA + metadata + search/trailer trên stack hiện có, đồng thời hoàn tất FEAT admin upload đã có trong scorecard.

---

## Phụ lục — Nguồn đọc

| Dự án | File / khu vực chính |
|---|---|
| WeFlix | `README.md`, `src/App.jsx`, `pages/Home/*`, `Fetcher.js`, `tmdb.js`, `WatchlistContext.jsx`, `utils/continueWatching.js`, `Movie|TV/VideoPlayer.jsx`, `AuthModal.jsx`, `SEO.jsx` |
| FilmP2P | `README.md`, `src/app/App.tsx`, `features/movies/**`, `features/trailers/**`, `features/contact/**`, `shared/**`, `tests/*` |
| LiveStream | `docs/FEATURE_SCORECARD.md`, `web/src/App.tsx`, `server/src/db/schema.ts`, admin/player/catalog routes |
## 9. UI/UX sâu (layout · nav · hero · rows · cards · detail · player chrome · search · auth · theme · empty/loading · motion · mobile · admin)

**Ngày bổ sung:** 2026-09-06  
**Phạm vi:** chỉ bề mặt UI/UX từ clone tạm WeFlix_v2 + Playing-FilmP2P; **không** phân tích pirate embed / BitTorrent.  
**LiveStream đối chiếu:** `web/src` (Header, Home, PosterCard/HoverPreview, SeriesDetail, Watch/HlsPlayer, Search, Auth*, EmptyState, Admin*).

### 9.1 WeFlix_v2 — pattern UI

| Vùng | Pattern quan sát | File / tín hiệu |
|---|---|---|
| **Shell / Nav** | Sidebar cố định trái, icon-rail ~84px **hover-expand** ~260px; blur + border; nav Search/Home/Movies/TV/Watchlist; genre list khi browse Movies/TV | `Sidebar.jsx` |
| **Mobile** | Sidebar `hidden md:flex` — mobile dựa route riêng / overlay (desktop-first) | Sidebar classes |
| **Hero / Billboard** | Full-bleed ~72vh→100vh; backdrop TMDB; auto-advance **7s** + fade; progress bar; skeleton shimmer full-viewport; CTA Play + More Info; meta year/rating/genres | `HeroBanner.jsx` |
| **Rows** | Hàng ngang Netflix: chevron L/R, “See all”, drag/scroll; variant Top 10 `showRank`; nhiều row curated | `TrendingRow.jsx`, `HomePage.jsx` |
| **Cards** | Poster + rating màu; hover **800ms** → popout trailer YT iframe; mute toggle; watchlist +/-; edge-aware transform origin | `ContentCard.jsx` |
| **Grid browse** | Infinite scroll + skeleton cards + error retry | `ContentGrid.jsx` |
| **Detail** | Full-bleed backdrop; poster nổi; tagline; runtime/calendar; genre chips; CastRow ngang; related row; skeleton cinematic (`DetailPageSkeleton`); TV: season tabs ngang + episode cards thumb | `MovieDetails.jsx`, `TvDetails.jsx`, `DetailPageSkeleton.jsx` |
| **Player chrome** | Player nhúng trong detail (không route `/watch` riêng kiểu LiveStream); server switcher UI (bỏ qua nội dung) | `VideoPlayer.jsx` |
| **Search** | Trang `/search` live results movie+TV; genre chips nhảy category | `SearchPage.jsx` |
| **Auth** | Modal login/signup; Google; reset/verify pages; motion | `AuthModal.jsx`, auth pages |
| **Theme** | Dark cố định (`#0a0c12` / gray-900) — không light mode | `index.css`, Tailwind |
| **Empty / Loading** | Hero skeleton, detail skeleton, grid pulse; label “Loading Highlights” | Hero + ContentGrid |
| **Motion** | Framer Motion card/page; hero fade 300ms; sidebar width 300ms | deps + components |
| **Admin** | Không có CMS UI | — |

### 9.2 Playing-FilmP2P (XemPhim Online) — pattern UI

| Vùng | Pattern quan sát | File / tín hiệu |
|---|---|---|
| **Shell / Nav** | Sticky header blur; desktop links; **mobile full-screen drawer** (body overflow lock); search icon shortcut; ThemeSwitcher | `Header.tsx` |
| **Hero** | Card-inset `rounded-2xl` ~60–70vh (không full-bleed edge); Ken Burns; pause rotate khi hover; CTA Xem + Trailer modal; genre pills | `Hero.tsx` |
| **Catalog** | Grid + pagination 18; Categories infinite scroll | Home / Categories |
| **Cards** | Poster + badge PHIM LẺ/BỘ; skeleton `MovieCardSkeleton`; QuickPreviewModal (trailer/share/bookmark) | `MovieCard.tsx`, `QuickPreviewModal.tsx` |
| **Detail** | Poster + meta; episode list phẳng; trailer section; Recommended overlap genre | `MovieDetailPage.tsx` |
| **Player chrome** | Theater overlay; Escape; landscape lock fullscreen; “Đang kết nối nguồn”; slow-source reload 12s; subtitle status label | `MoviePlayer.tsx` |
| **Search** | Facet year/genre/sort + URL sync; quick genre chips; filter panel toggle; skeleton grid | `SearchPage.tsx` |
| **Auth** | Không | — |
| **Theme** | **Light/Dark** CSS variables + `html.dark`; persist | `ThemeProvider.tsx`, `main.css` |
| **Empty / Loading** | Hero pulse; card skeleton; Spinner shared | shared UI |
| **Motion** | CSS keyframes fade-up / ken-burns / scale-up (không Framer) | `main.css` |
| **Footer / static** | About, Contact Formspree | Footer + pages |
| **Admin** | Không | — |

### 9.3 LiveStream — hiện trạng UI (điểm neo)

| Vùng | Hiện trạng | So với đối thủ |
|---|---|---|
| **Nav** | Top header + burger; genre dropdown; search form | FilmP2P gần hơn (top nav VN); thiếu sidebar WeFlix; mobile menu cơ bản |
| **Hero** | Một poster hot, ~280px+, gradient; **không** auto-rotate / progress / skeleton hero riêng | Yếu hơn cả hai (WeFlix billboard mạnh nhất) |
| **Rows** | `poster-grid` cố định cột; ranking list riêng; Continue Watching | Thiếu **carousel ngang + chevron** kiểu WeFlix |
| **Cards / hover** | PosterCard + HoverPreview HLS muted (2W×1.5H) — **tốt hơn** trailer YT giả | Thiếu quick-action strip đủ (trailer/share) |
| **Detail** | Layout thông tin + list tập; chưa full-bleed cinematic + cast row + detail skeleton riêng | WeFlix detail giàu hơn rõ |
| **Player** | `HlsPlayer` ABR/EQ/theater/PiP/thumbs — **vượt** đối thủ kỹ thuật | Có thể học messaging buffer chậm / landscape hint (FilmP2P) |
| **Search** | Một ô `q` | FilmP2P facet UI thắng |
| **Auth** | Page + modal JWT | WeFlix polish hơn (OAuth/reset visuals) |
| **Theme** | Dark tokens cố định (`index.css`) | FilmP2P có light/dark |
| **Empty/Loading** | `EmptyState` + `PosterGridSkeleton` | Thiếu hero/detail skeleton cinematic |
| **Motion** | `fade-up` nhẹ | Ít hơn WeFlix Framer / FilmP2P Ken Burns |
| **Admin** | Có AdminLayout/CRUD — **vượt** (đối thủ không có) | Form còn thô vs polish consumer UI |

### 9.4 Gaps UI ưu tiên (hợp pháp, stack LiveStream)

1. **Billboard hero** — multi-item rotate, progress dots, skeleton, chiều cao gần viewport (ý WeFlix; giữ brand LiveStream).  
2. **Row carousels** — hàng ngang cuộn + chevron “Đang hot / Mới cập nhật / Cùng thể loại”.  
3. **Detail cinematic** — backdrop full-bleed, meta chrome, cast row, skeleton detail.  
4. **Search chrome** — filter bar + chips + sort (đã có COMP-005; bổ sung visual density).  
5. **Theme light/dark** — COMP-013.  
6. **Skeleton hệ thống** — HeroSkeleton, DetailSkeleton, RowSkeleton.  
7. **Mobile nav** — drawer full-height + lock scroll (ý FilmP2P).  
8. **Hover quick-actions** — COMP-011.  
9. **Player mobile UX copy** — COMP-019.  
10. **Auth visual polish** — spacing/hierarchy modal (không bắt buộc OAuth để đạt UI gate).

### 9.5 Recommendations (map kế hoạch)

| Ưu tiên | Hành động LiveStream | COMP gợi ý |
|---|---|---|
| P0 UI | Billboard hero + row carousel trên Home | COMP-020, COMP-021 |
| P0 UI | Detail cinematic + skeleton | COMP-022, COMP-023 |
| P0 product | kind/metadata/search/trailer (đã có) | COMP-001…006 |
| P1 UI | Mobile drawer, search chrome densify, hover CTA | COMP-024, COMP-005/011 |
| P2 UI | Theme, auth polish, player buffer/landscape | COMP-013, COMP-025, COMP-019 |

**Không làm từ UI đối thủ:** iframe multi-server pirate; Drive crowd player; torrent UX.

---
