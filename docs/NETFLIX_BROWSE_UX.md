# Netflix Browse UX → LiveStream

Ngày: 2026-09-05  
Phạm vi: quan sát hành vi browse/row/hover của Netflix và ánh xạ an toàn sang UI catalog LiveStream (không đụng encode, ABR watch player, admin).

## Quan sát Netflix (browse)

**Truy cập trực tiếp:** `https://www.netflix.com/browse` yêu cầu đăng nhập (login wall + reCAPTCHA). Không capture được hàng poster thật trong phiên nghiên cứu này. Phân tích dưới đây dựa trên hành vi Netflix browse công khai đã biết + pattern row/billboard đã phổ biến.

### Pattern chính

1. **Hàng poster ngang (rows)**  
   Nhiều hàng theo chủ đề/cá nhân hóa; mỗi hàng cuộn ngang; poster tỉ lệ gần vuông/dọc, khoảng cách đều.

2. **Hover expand / preview card**  
   Khi con trỏ dừng trên poster (~0.4–0.6s), ô poster mở **khung preview 16:9** (billboard ngang) lớn hơn poster, nổi z-index, đổ bóng; video + meta nằm trong khung landscape — rời chuột đóng ngay.

3. **Muted autoplay preview**  
   Trong card mở rộng: video trailer/preview tự phát **tắt tiếng**, loop/cắt ngắn; rời hover → dừng, thu gọn.

4. **Metadata overlay**  
   Tiêu đề, maturity/rating, thể loại, năm/độ dài, badge tập/season; gradient tối phía dưới media.

5. **Quick actions**  
   Phát, thêm My List (+/−), thông tin chi tiết / expand; đôi khi thumbs / more like this trên panel lớn hơn.

6. **Billboard hero**  
   Banner lớn đầu trang với trailer nền, CTA Play / More Info — tách khỏi hover row.

7. **Mobile**  
   Không hover: tap mở chi tiết hoặc phát; không phụ thuộc pointer fine.

## Ánh xạ sang LiveStream

| Netflix | LiveStream (an toàn) |
|---|---|
| Row hover expand | `PosterCard` + `HoverPreviewCard` — preview **2W × 1.5H** (W/H = poster media) trên Home / Mới cập nhật / grid catalog |
| Muted trailer | HLS `playbackUrl` tập **ready** mới nhất, muted, `startLevel` thấp; component riêng `MutedPreviewPlayer` (không dùng `HlsPlayer`) |
| Metadata | Title, episode badge, genres, rating, views từ `Series` |
| Play / More Info / My List | Phát → `/xem/:slug/:ep`, Chi tiết → `/phim/:slug`, + Yêu thích nếu đã login |
| Một preview tại một thời điểm | Singleton `claimHoverPreview` |
| Mobile no-hover | `matchMedia('(hover: hover) and (pointer: fine)')` — touch giữ tap → chi tiết |

## Sẽ KHÔNG copy

- Hạ tầng cá nhân hóa nặng (row ranking ML, “Because you watched…”, A/B billboard).
- CDN Open Connect / predictive cache.
- Trailer encode riêng / artwork variants đa kích thước.
- Panel “More like this” / social proof phức tạp.
- Viết lại `HlsPlayer` (ABR, quality, phụ đề, theater, thumb scrub).
- Đụng `encodeQueue`, admin auth middleware.

## Đã triển khai

- `docs/NETFLIX_BROWSE_UX.md` (file này).
- **Hover preview size:** hover ~450ms → nâng `z-index`, mở khung **2W × 1.5H** từ poster media (`W`/`H`): ngang phủ full poster + nửa hàng xóm trái/phải; dọc +H/4 trên và dưới; video 16:9 `object-fit: cover` trong khung; căn giữa media, chỉ lệch offset khi gần mép viewport — nửa hàng xóm còn lộ vẫn hover được (5 cột).
- `.poster-grid`: **2 → 3 → 4 → 5** cột (`<480` / `≥480` / `≥768` / `≥1024`).
- `HoverPreviewCard` — overlay trong lớp preview (video muted `object-fit: cover` + chrome meta/CTA ở đáy).
- `MutedPreviewPlayer` — hls.js nhẹ, muted, buffer ngắn, destroy khi unmount.
- `hoverPreview.ts` — flag `VITE_HOVER_PREVIEW`, delay mở 450ms / **đóng tức thì (0ms)**, singleton `claimHoverPreview`, `computeHoverPreviewTransform(media, wrap)`.
- `resolveHoverPreview.ts` — tập `ready` mới nhất + `playbackUrl` (cache 60s); không ready → chỉ poster/meta.
- `PosterCard` + `.poster-grid` `overflow: visible` — leave hủy timer mở + tear-down ngay; scroll/Escape đóng sạch; một preview tại một thời điểm; mobile (`hover: none`) không expand.
- Fallback: HLS fatal → ẩn video, giữ poster+meta; `VITE_HOVER_PREVIEW=0` tắt hẳn.

### Cách kiểm tra nhanh

1. Desktop Home grid (5 cột): hover poster giữa ~0.45s → preview **2W × 1.5H** (phủ nửa hàng xóm mỗi bên); nửa còn lại vẫn hover được; video muted `cover`.
2. Poster cột đầu/cuối gần mép → preview vẫn trong viewport (offset lệch vào trong).
3. Rời chuột khỏi preview → đóng **ngay**; lướt nhanh qua nhiều poster → chỉ một active, không kẹt.
4. Touch / DevTools mobile → không expand; tap vẫn vào `/phim/...`.
5. `/xem/:slug/:ep` — `HlsPlayer` đầy đủ không đổi.
6. `cd web && npm run build`.
