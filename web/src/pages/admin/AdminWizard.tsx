import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { Genre, Series } from '../../api/types'
import { AdminFilePreview } from '../../components/admin/AdminFilePreview'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'
import { parseEpisodeFilename } from '../../lib/parseEpisodeFilename'

type Step = 1 | 2 | 3 | 4

type EpDraft = {
  key: string
  number: number
  title: string
  file: File | null
}

export function AdminWizardPage() {
  const [step, setStep] = useState<Step>(1)
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneSeries, setDoneSeries] = useState<Series | null>(null)

  const [kind, setKind] = useState<'series' | 'movie'>('series')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [genreIds, setGenreIds] = useState<string[]>([])
  const [trailerUrl, setTrailerUrl] = useState('')

  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [seriesSlug, setSeriesSlug] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EpDraft[]>([
    { key: '1', number: 1, title: 'Tập 1', file: null },
  ])
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({})

  useEffect(() => {
    void api.adminGenres().then((g) => {
      setGenres(g)
      setLoading(false)
    })
  }, [])

  const canStep2 = title.trim().length > 0
  const canStep3 = drafts.every((d) => d.number > 0 && d.title.trim())
  const canStep4 = drafts.some((d) => d.file)

  const summary = useMemo(
    () => ({
      kind,
      title,
      episodes: drafts.length,
      withFiles: drafts.filter((d) => d.file).length,
    }),
    [kind, title, drafts],
  )

  async function createSeries() {
    setBusy(true)
    setError(null)
    try {
      const created = await api.adminCreateSeries({
        title: title.trim(),
        slug: (slug.trim() || title.trim())
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80),
        synopsis,
        posterUrl: '',
        status: 'ongoing',
        kind,
        year,
        genreIds,
        trailerUrl: trailerUrl.trim() || null,
      })
      setSeriesId(String(created.id))
      setSeriesSlug(created.slug)
      if (kind === 'movie') {
        setDrafts([{ key: '1', number: 1, title: created.title, file: null }])
      }
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo series thất bại')
    } finally {
      setBusy(false)
    }
  }

  function addDraft() {
    if (kind === 'movie') return
    const max = drafts.reduce((m, d) => Math.max(m, d.number), 0)
    setDrafts((prev) => [
      ...prev,
      { key: String(Date.now()), number: max + 1, title: `Tập ${max + 1}`, file: null },
    ])
  }

  function onPickFiles(files: FileList | null) {
    if (!files?.length || kind === 'movie') return
    const next: EpDraft[] = []
    let n = drafts.reduce((m, d) => Math.max(m, d.number), 0)
    for (const file of Array.from(files)) {
      const parsed = parseEpisodeFilename(file.name)
      n = parsed.number ?? n + 1
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        number: n,
        title: parsed.title || `Tập ${n}`,
        file,
      })
    }
    setDrafts(next.length ? next : drafts)
  }

  async function createEpisodesAndUpload() {
    if (!seriesId) return
    setBusy(true)
    setError(null)
    try {
      for (const d of drafts) {
        let epId: string
        try {
          const ep = await api.adminCreateEpisode({
            seriesId,
            number: d.number,
            title: d.title || `Tập ${d.number}`,
          })
          epId = String(ep.id)
        } catch (err) {
          // Movie / conflict: reuse existing episode list
          const eps = await api.adminEpisodes({ seriesId })
          const hit = eps.find((e) => e.number === d.number)
          if (!hit) throw err
          epId = String(hit.id)
        }
        if (d.file) {
          await api.adminUpload(epId, d.file, (p) => {
            setUploadPct((prev) => ({ ...prev, [d.key]: p.percent }))
          })
        }
      }
      const list = await api.adminSeriesList()
      setDoneSeries(list.find((s) => String(s.id) === seriesId) ?? null)
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload thất bại')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <LoadingBlock />
      </div>
    )
  }

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Wizard: Series → Tập → Upload</h2>
        <p style={{ opacity: 0.8, marginBottom: '0.75rem' }}>
          Một luồng tạo nội dung — bước {step}/4 · {summary.kind} · {summary.title || '(chưa đặt tên)'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <span
              key={s}
              className={`status-pill${step === s ? ' status-pill--ready' : ''}`}
            >
              {s === 1
                ? '1. Series'
                : s === 2
                  ? '2. Tập'
                  : s === 3
                    ? '3. Upload'
                    : '4. Xong'}
            </span>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {step === 1 && (
        <form
          className="admin-form admin-form--wide"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void createSeries()
          }}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="label">Loại</label>
              <select
                className="input"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'series' | 'movie')}
              >
                <option value="series">Series / bộ</option>
                <option value="movie">Phim lẻ</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="label">Tiêu đề *</label>
              <input
                className="input"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Slug (optional)</label>
              <input
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Năm</label>
              <input
                className="input"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Tóm tắt</label>
            <textarea
              className="input"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">Trailer URL (HLS hoặc YouTube)</label>
            <input
              className="input"
              value={trailerUrl}
              onChange={(e) => setTrailerUrl(e.target.value)}
              placeholder="https://…/master.m3u8 hoặc YouTube"
            />
          </div>
          <div className="form-group">
            <label className="label">Thể loại</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {genres.map((g) => {
                const on = genreIds.includes(String(g.id))
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() =>
                      setGenreIds((prev) =>
                        on
                          ? prev.filter((id) => id !== String(g.id))
                          : [...prev, String(g.id)],
                      )
                    }
                  >
                    {g.name}
                  </button>
                )
              })}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !canStep2}>
            {busy ? 'Đang tạo...' : 'Tạo series → tiếp'}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="admin-form admin-form--wide">
          <h3>Thêm tập {seriesSlug ? `(${seriesSlug})` : ''}</h3>
          {kind === 'series' && (
            <div className="form-group">
              <label className="label">Chọn nhiều file (parse tên → số tập)</label>
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>
          )}
          {drafts.map((d, idx) => (
            <div key={d.key} className="form-row" style={{ alignItems: 'end' }}>
              <div className="form-group">
                <label className="label">Số</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  disabled={kind === 'movie'}
                  value={d.number}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 1
                    setDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, number: n } : x)),
                    )
                  }}
                />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="label">Tiêu đề</label>
                <input
                  className="input"
                  value={d.title}
                  onChange={(e) => {
                    const t = e.target.value
                    setDrafts((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, title: t } : x)),
                    )
                  }}
                />
              </div>
              {kind === 'series' && drafts.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Xóa dòng
                </button>
              )}
            </div>
          ))}
          {kind === 'series' && (
            <button type="button" className="btn btn-ghost" onClick={addDraft}>
              + Thêm tập
            </button>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canStep3}
              onClick={() => setStep(3)}
            >
              Tiếp: gắn file video →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="admin-form admin-form--wide">
          <h3>Upload video + encode</h3>
          {drafts.map((d, idx) => (
            <div key={d.key} style={{ marginBottom: '1rem' }}>
              <p>
                #{d.number} — {d.title}
              </p>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setDrafts((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, file: f } : x)),
                  )
                }}
              />
              <AdminFilePreview file={d.file} />
              {uploadPct[d.key] != null && (
                <div className="job-status" style={{ marginTop: 6 }}>
                  <div className="job-status__bar">
                    <span style={{ width: `${uploadPct[d.key]}%` }} />
                  </div>
                  <span>{uploadPct[d.key]}%</span>
                </div>
              )}
            </div>
          ))}
          {!canStep4 && (
            <EmptyState
              title="Cần ít nhất 1 file"
              message="Gắn video cho một tập để bắt đầu encode."
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
              ← Quay lại
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !canStep4}
              onClick={() => void createEpisodesAndUpload()}
            >
              {busy ? 'Đang tạo + upload...' : 'Tạo tập + upload'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="admin-card">
          <h3>Hoàn tất</h3>
          <p>
            Đã tạo <strong>{doneSeries?.title || title}</strong>
            {seriesSlug ? ` (${seriesSlug})` : ''}. Encode chạy nền — theo dõi Jobs ở Episodes.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {seriesSlug && (
              <Link className="btn btn-primary" to={`/phim/${seriesSlug}`}>
                Xem trang public
              </Link>
            )}
            {seriesId && (
              <Link className="btn btn-ghost" to={`/admin/episodes?seriesId=${seriesId}`}>
                Mở Episodes
              </Link>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStep(1)
                setSeriesId(null)
                setSeriesSlug(null)
                setDoneSeries(null)
                setTitle('')
                setSlug('')
                setSynopsis('')
                setTrailerUrl('')
                setGenreIds([])
                setDrafts([{ key: '1', number: 1, title: 'Tập 1', file: null }])
                setUploadPct({})
              }}
            >
              Wizard mới
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
