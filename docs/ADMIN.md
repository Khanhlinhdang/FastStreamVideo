# LiveStream — Admin & ops (local/dev)

> **Cảnh báo:** Tài khoản và secret dưới đây là **mặc định local/dev**.  
> **Đổi mật khẩu admin, JWT secrets, và CORS trước mọi deploy thật.**  
> Không dùng các giá trị này trên internet công khai.

## Tài khoản seed

Sau `npm run db:seed` / `db:seed-if-empty` / Docker first boot:

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| **Admin** | `admin@livestream.local` | `admin123` | Full — đổi qua `SEED_ADMIN_*` trước seed |
| **Editor** | `editor@livestream.local` | `editor123` | Catalog/upload — `SEED_EDITOR_*` |
| **Viewer** | `viewer@livestream.local` | `viewer123` | User thường |

Production Docker: dùng email/password trong `.env.production` (`SEED_ADMIN_*`).

Đăng nhập UI: `/dang-nhap` → **Admin** (role `admin` hoặc `editor`).

### Catalog seed (playable)

Chỉ **2 series** + **1 tập** mỗi series (có nguồn open-movie):

| Series | Tập | Sau `demo:encode` / `AUTO_DEMO_ENCODE` |
|---|---|---|
| Neon Harbor Chronicles | #1 Harbor Lights | HLS ready |
| Skyforge Academy | #1 First Gust | HLS ready |

Không còn series metadata-only trong seed — tránh catalog “không xem được”.

### RBAC

| | `editor` | `admin` |
|---|---|---|
| Series / episodes / upload / schedule / genres / phụ đề / audio / comments | ✅ | ✅ |
| Disk usage / jobs purge | ❌ | ✅ |

## Route Admin (web)

| Path | Chức năng |
|---|---|
| `/admin` | Tổng quan — jobs, QoE; disk/purge chỉ admin |
| `/admin/wizard` | Luồng Series → Tập → Upload |
| `/admin/series` | Tạo/sửa series |
| `/admin/episodes` | Upload / sửa metadata / phụ đề / audio |
| `/admin/comments` | Moderation bình luận |
| `/admin/schedule` | Lịch chiếu |
| `/admin/genres` | CRUD thể loại |

## Upload → encode

### Wizard (khuyến nghị)

**Admin → Wizard**: tạo series → thêm tập → gắn file → upload chunked + progress.

### Phim lẻ

**Admin → Series** → *Phim lẻ* + file video → tạo tập #1 + encode.

### Phim bộ

**Admin → Episodes** (hoặc Wizard): parse filename `S01E12` / `EP12` / `Tập 12` → bulk preview → upload.

Chunked upload (≥2 MB): `upload/init` → `PUT` parts → `complete` → job encode.

## Demo encode

- Local: `npm run demo:encode` (có **reseed** DB — destructive)
- Docker: `AUTO_DEMO_ENCODE=1` → `bootstrap-demo-hls` (**không** wipe DB)
- Full ladder: `DEMO_FULL=1`

## Persistence

- DB: `data/livestream.db` (local) hoặc volume `livestream_data` (Docker)
- Media: `media/uploads`, `media/hls`
- `npm run db:seed` / `db:reset` **xóa** liên kết catalog — tránh trên VPS đang chạy trial

Xem thêm deploy: [`deploy.md`](../deploy.md).
