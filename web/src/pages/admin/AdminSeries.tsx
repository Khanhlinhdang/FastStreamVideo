import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { Genre, Series, SeriesStatus } from '../../api/types'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'
import { statusLabel } from '../../lib/format'

const WEEKDAYS = [
  { v: 0, label: 'CN' },
  { v: 1, label: 'T2' },
  { v: 2, label: 'T3' },
  { v: 3, label: 'T4' },
  { v: 4, label: 'T5' },
  { v: 5, label: 'T6' },
  { v: 6, label: 'T7' },
]

const emptyForm = {
  title: '',
  slug: '',
  synopsis: '',
  posterUrl: '',
  status: 'ongoing' as SeriesStatus,
  kind: 'series' as 'movie' | 'series',
  year: new Date().getFullYear(),
  country: '',
  qualityLabel: '1080p',
  audioLabel: 'SUB+TM',
  isHot: false,
  genreIds: [] as string[],
  scheduleWeekdays: [] as number[],
  scheduleNote: '',
  tagline: '',
  runtimeSec: '' as number | '',
  ageRating: '',
  director: '',
  castText: '',
  tagsText: '',
  trailerUrl: '',
}

export function AdminSeriesPage() {
  const [items, setItems] = useState<Series[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [posterError, setPosterError] = useState<string | null>(null)

  useEffect(() => {
    if (!posterFile) {
      setPosterPreview(null)
      return
    }
    const url = URL.createObjectURL(posterFile)
    setPosterPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [posterFile])

  function onPosterPick(file: File | null) {
    setPosterError(null)
    if (!file) {
      setPosterFile(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setPosterError('Chỉ chấp nhận file ảnh (JPEG/PNG/WebP/GIF).')
      setPosterFile(null)
      return
    }
    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      setPosterError('Poster quá lớn (tối đa 5MB).')
      setPosterFile(null)
      return
    }
    setPosterFile(file)
  }

  async function load(search = q, status = statusFilter) {
    const [list, g] = await Promise.all([
      api.adminSeriesList({
        q: search || undefined,
        status: status || undefined,
      }),
      api.genres(),
    ])
    setItems(list)
    setGenres(g)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredHint = useMemo(() => {
    if (!q && !statusFilter) return `${items.length} series`
    return `${items.length} kết quả`
  }, [items.length, q, statusFilter])

  function slugify(title: string) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setPosterFile(null)
    setShowForm(true)
    setError(null)
  }

  function startEdit(s: Series) {
    setEditingId(s.id)
    setForm({
      title: s.title,
      slug: s.slug,
      synopsis: s.synopsis || '',
      posterUrl: s.posterUrl || '',
      status: s.status,
      kind: s.kind === 'movie' ? 'movie' : 'series',
      year: s.year || new Date().getFullYear(),
      country: s.country || '',
      qualityLabel: s.qualityLabel || '1080p',
      audioLabel: s.audioLabel || 'SUB+TM',
      isHot: Boolean(s.isHot),
      genreIds: s.genres?.map((g) => g.id) ?? [],
      scheduleWeekdays: s.scheduleWeekdays ?? [],
      scheduleNote: '',
      tagline: s.tagline || '',
      runtimeSec: s.runtimeSec ?? '',
      ageRating: s.ageRating || '',
      director: s.director || '',
      castText: (s.cast ?? []).map((c) => c.name).join(', '),
      tagsText: (s.tags ?? []).join(', '),
      trailerUrl: s.trailerUrl || '',
    })
    setPosterFile(null)
    setShowForm(true)
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = {
        ...form,
        slug: form.slug || slugify(form.title),
        runtimeSec:
          form.runtimeSec === '' || form.runtimeSec == null
            ? null
            : Number(form.runtimeSec),
        cast: form.castText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        tags: form.tagsText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        trailerUrl: form.trailerUrl || null,
      }
      const { castText: _c, tagsText: _t, ...body } = payload as typeof payload & {
        castText?: string
        tagsText?: string
      }
      void _c
      void _t
      let id = editingId
      if (editingId) {
        await api.adminUpdateSeries(editingId, body)
      } else {
        const created = await api.adminCreateSeries(body)
        id = String(created.id)
      }
      if (id && posterFile) {
        await api.adminUploadPoster(id, posterFile)
      }
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
      setPosterFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Xóa (soft-delete) series này?')) return
    try {
      await api.adminDeleteSeries(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  function toggleGenre(id: string) {
    setForm((f) => ({
      ...f,
      genreIds: f.genreIds.includes(id)
        ? f.genreIds.filter((x) => x !== id)
        : [...f.genreIds, id],
    }))
  }

  function toggleWeekday(v: number) {
    setForm((f) => ({
      ...f,
      scheduleWeekdays: f.scheduleWeekdays.includes(v)
        ? f.scheduleWeekdays.filter((x) => x !== v)
        : [...f.scheduleWeekdays, v].sort(),
    }))
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <div className="admin-toolbar">
        <div className="admin-filters">
          <input
            className="input"
            placeholder="Tìm series / quốc gia..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load()
            }}
          />
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              void load(q, e.target.value)
            }}
          >
            <option value="">Mọi trạng thái</option>
            <option value="ongoing">Đang chiếu</option>
            <option value="completed">Hoàn thành</option>
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Lọc
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{filteredHint}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          + Thêm phim / series
        </button>
      </div>

      {showForm && (
        <form className="admin-form admin-form--wide" onSubmit={onSubmit}>
          <h2>{editingId ? 'Sửa nội dung' : 'Tạo nội dung'}</h2>
          <div className="form-group">
            <label className="label">Loại</label>
            <select
              className="select"
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({ ...f, kind: e.target.value as 'movie' | 'series' }))
              }
            >
              <option value="series">Phim bộ (Series)</option>
              <option value="movie">Phim lẻ (Movie)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Tiêu đề</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  title: e.target.value,
                  slug: editingId ? f.slug : slugify(e.target.value),
                }))
              }
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Slug</label>
              <input
                className="input"
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Quốc gia</label>
              <input
                className="input"
                value={form.country}
                placeholder="VD: Nhật Bản, Hàn Quốc, Demo"
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Mô tả / Synopsis</label>
            <textarea
              className="textarea"
              rows={4}
              value={form.synopsis}
              onChange={(e) => setForm((f) => ({ ...f, synopsis: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Tagline</label>
            <input
              className="input"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Runtime (giây)</label>
              <input
                className="input"
                type="number"
                value={form.runtimeSec}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    runtimeSec: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="form-group">
              <label className="label">Giới hạn tuổi</label>
              <input
                className="input"
                value={form.ageRating}
                placeholder="T13 / 16+"
                onChange={(e) => setForm((f) => ({ ...f, ageRating: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Đạo diễn</label>
            <input
              className="input"
              value={form.director}
              onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Diễn viên (phẩy)</label>
            <input
              className="input"
              value={form.castText}
              placeholder="A, B, C"
              onChange={(e) => setForm((f) => ({ ...f, castText: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Tags (phẩy)</label>
            <input
              className="input"
              value={form.tagsText}
              onChange={(e) => setForm((f) => ({ ...f, tagsText: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Trailer URL (YouTube hoặc HLS clip)</label>
            <input
              className="input"
              value={form.trailerUrl}
              onChange={(e) => setForm((f) => ({ ...f, trailerUrl: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Poster URL</label>
            <input
              className="input"
              value={form.posterUrl}
              onChange={(e) => setForm((f) => ({ ...f, posterUrl: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="label">Hoặc upload poster</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => onPosterPick(e.target.files?.[0] ?? null)}
            />
            {posterError && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{posterError}</p>
            )}
            {posterPreview && (
              <img
                src={posterPreview}
                alt="Poster preview"
                style={{
                  marginTop: 8,
                  maxWidth: 180,
                  maxHeight: 260,
                  objectFit: 'cover',
                  borderRadius: 8,
                }}
              />
            )}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Năm</label>
              <input
                className="input"
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Trạng thái</label>
              <select
                className="select"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as SeriesStatus }))
                }
              >
                <option value="ongoing">Đang chiếu</option>
                <option value="completed">Hoàn thành</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Chất lượng</label>
              <input
                className="input"
                value={form.qualityLabel}
                onChange={(e) => setForm((f) => ({ ...f, qualityLabel: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Audio</label>
              <input
                className="input"
                value={form.audioLabel}
                onChange={(e) => setForm((f) => ({ ...f, audioLabel: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">
              <input
                type="checkbox"
                checked={form.isHot}
                onChange={(e) => setForm((f) => ({ ...f, isHot: e.target.checked }))}
              />{' '}
              Đánh dấu Hot (hiện hero trang chủ)
            </label>
          </div>
          {genres.length > 0 && (
            <div className="form-group">
              <label className="label">Thể loại</label>
              <div className="chip-row">
                {genres.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`btn btn-sm ${form.genreIds.includes(g.id) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => toggleGenre(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="label">Lịch chiếu (thứ)</label>
            <div className="chip-row">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  className={`btn btn-sm ${form.scheduleWeekdays.includes(d.v) ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleWeekday(d.v)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ marginTop: '0.5rem' }}
              placeholder="Ghi chú lịch (VD: 21:00)"
              value={form.scheduleNote}
              onChange={(e) => setForm((f) => ({ ...f, scheduleNote: e.target.value }))}
            />
          </div>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Hủy
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState title="Chưa có series" message="Tạo series đầu tiên để bắt đầu." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Quốc gia</th>
                <th>Trạng thái</th>
                <th>Xem</th>
                <th>Đánh giá</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/phim/${s.slug}`}>{s.title}</Link>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {s.slug}
                      {s.qualityLabel ? ` · ${s.qualityLabel}` : ''}
                      {s.audioLabel ? ` · ${s.audioLabel}` : ''}
                    </div>
                  </td>
                  <td>{s.country || '—'}</td>
                  <td>{statusLabel(s.status)}</td>
                  <td>{s.viewCount ?? 0}</td>
                  <td>
                    {s.ratingAvg != null
                      ? `${s.ratingAvg} (${s.ratingCount})`
                      : '—'}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Link
                        to={`/admin/episodes?seriesId=${s.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Tập
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEdit(s)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => onDelete(s.id)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
