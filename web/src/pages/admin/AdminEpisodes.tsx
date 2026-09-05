import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { EncodeJob, Episode, Series } from '../../api/types'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'
import { encodeStatusLabel } from '../../lib/format'

type SubRow = { id: number | string; label: string; lang: string; url: string }

export function AdminEpisodesPage() {
  const [params] = useSearchParams()
  const filterSeriesId = params.get('seriesId') || ''
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [seriesId, setSeriesId] = useState(filterSeriesId)
  const [number, setNumber] = useState(1)
  const [title, setTitle] = useState('')
  const [qualityLabel, setQualityLabel] = useState('1080p')
  const [audioLabel, setAudioLabel] = useState('SUB+TM')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState<Record<string, EncodeJob>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [manageId, setManageId] = useState<string | null>(null)
  const [subs, setSubs] = useState<SubRow[]>([])
  const [subLabel, setSubLabel] = useState('Tiếng Việt')
  const [subLang, setSubLang] = useState('vi')
  const [audioTrackLabel, setAudioTrackLabel] = useState('Audio phụ')
  const [audioTrackLang, setAudioTrackLang] = useState('en')
  const [hlsAudio, setHlsAudio] = useState<Array<{ label: string; lang: string }>>([])

  async function load() {
    const [series, eps, jobList] = await Promise.all([
      api.adminSeriesList(),
      api.adminEpisodes({
        seriesId: filterSeriesId || undefined,
        q: q || undefined,
      }),
      api.adminJobs(),
    ])
    setSeriesList(series)
    setEpisodes(
      eps.sort(
        (a, b) =>
          String(a.seriesId ?? '').localeCompare(String(b.seriesId ?? ''), undefined, {
            numeric: true,
          }) || a.number - b.number,
      ),
    )
    const map: Record<string, EncodeJob> = {}
    for (const j of jobList) {
      if (j) map[j.id] = j
    }
    setJobs(map)
    if (!seriesId && series[0]) setSeriesId(String(series[0].id))
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSeriesId])

  useEffect(() => {
    const encodingIds = Object.values(jobs).filter(
      (j) => j.status === 'encoding' || j.status === 'queued',
    )
    if (!encodingIds.length) return
    const timer = window.setInterval(async () => {
      for (const job of encodingIds) {
        const fresh = await api.adminJob(job.id)
        if (fresh) {
          setJobs((prev) => ({ ...prev, [fresh.id]: fresh }))
          if (fresh.status === 'ready' || fresh.status === 'failed') {
            await load()
          }
        }
      }
    }, 2500)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

  async function openManage(ep: Episode) {
    setManageId(ep.id)
    setError(null)
    try {
      const [subList, audio] = await Promise.all([
        api.adminListSubtitles(ep.id),
        api.adminListAudio(ep.id),
      ])
      setSubs(subList)
      setHlsAudio(
        (audio.hlsTracks || []).map((t) => ({
          label: String((t as { label?: string }).label || 'Audio'),
          lang: String((t as { lang?: string }).lang || ''),
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải phụ đề/audio')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!seriesId) return
    setBusy(true)
    setError(null)
    try {
      const ep = await api.adminCreateEpisode({
        seriesId,
        number,
        title: title || `Tập ${number}`,
        qualityLabel,
        audioLabel,
      })
      if (file) {
        const res = await api.adminUpload(String(ep.id), file)
        if (res.job) {
          setJobs((prev) => ({ ...prev, [res.job!.id]: res.job! }))
        } else if (res.jobId) {
          const job = await api.adminJob(res.jobId)
          if (job) setJobs((prev) => ({ ...prev, [job.id]: job }))
        }
        setFile(null)
      }
      setTitle('')
      setNumber((n) => n + 1)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo episode thất bại')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(episodeId: string, uploadFile: File | null) {
    if (!uploadFile) return
    setUploadingId(episodeId)
    setError(null)
    try {
      const res = await api.adminUpload(episodeId, uploadFile)
      if (res.job) {
        setJobs((prev) => ({ ...prev, [res.job!.id]: res.job! }))
      } else if (res.jobId) {
        const job = await api.adminJob(res.jobId)
        if (job) setJobs((prev) => ({ ...prev, [job.id]: job }))
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload thất bại')
    } finally {
      setUploadingId(null)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Xóa (soft-delete) tập này?')) return
    try {
      await api.adminDeleteEpisode(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  async function onRetryJob(jobId: string) {
    setError(null)
    try {
      const res = await api.adminRetryJob(jobId)
      if (res.job) setJobs((prev) => ({ ...prev, [res.job!.id]: res.job! }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry thất bại')
    }
  }

  async function onBulkFiles(fileList: FileList | null) {
    if (!fileList?.length || !seriesId) return
    setBusy(true)
    setError(null)
    try {
      const files = Array.from(fileList)
      let nextNum = number
      for (const f of files) {
        const m = f.name.match(/(\d+)/)
        const n = m ? Number(m[1]) : nextNum
        const ep = await api.adminCreateEpisode({
          seriesId,
          number: n,
          title: f.name.replace(/\.[^.]+$/, ''),
          qualityLabel,
          audioLabel,
        })
        const res = await api.adminUpload(String(ep.id), f)
        if (res.jobId) {
          const job = await api.adminJob(res.jobId)
          if (job) setJobs((prev) => ({ ...prev, [job.id]: job }))
        }
        nextNum = Math.max(nextNum, n) + 1
      }
      setNumber(nextNum)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk import thất bại')
    } finally {
      setBusy(false)
    }
  }

  async function onUploadSub(episodeId: string, f: File | null) {
    if (!f) return
    setError(null)
    try {
      await api.adminUploadSubtitle(episodeId, f, { label: subLabel, lang: subLang })
      setSubs(await api.adminListSubtitles(episodeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload phụ đề thất bại')
    }
  }

  async function onDeleteSub(episodeId: string, subId: string | number) {
    if (!confirm('Xóa phụ đề này?')) return
    try {
      await api.adminDeleteSubtitle(episodeId, subId)
      setSubs(await api.adminListSubtitles(episodeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa phụ đề thất bại')
    }
  }

  async function onUploadAudio(episodeId: string, f: File | null) {
    if (!f) return
    setError(null)
    try {
      const res = await api.adminUploadAudio(episodeId, f, {
        label: audioTrackLabel,
        lang: audioTrackLang,
      })
      setHlsAudio(
        (res.tracks || []).map((t) => ({
          label: String((t as { label?: string }).label || 'Audio'),
          lang: String((t as { lang?: string }).lang || ''),
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload audio thất bại')
    }
  }

  function seriesTitle(id: string | number) {
    const key = String(id)
    return seriesList.find((s) => String(s.id) === key)?.title || key
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <form className="admin-form admin-form--wide" onSubmit={onCreate}>
        <h2>Thêm / upload tập</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '-0.5rem' }}>
          Upload dùng ladder ABR đầy đủ (480/720/1080+). Có thể tạo tập rồi upload, hoặc tạo kèm
          file. Thay video = upload lại (re-encode). Bulk: chọn nhiều file — số tập lấy từ tên
          (`ep12.mp4` → 12).
        </p>
        <div className="form-group">
          <label className="label">Bulk import (nhiều file)</label>
          <input
            type="file"
            accept="video/*"
            multiple
            disabled={busy || !seriesId}
            onChange={(e) => void onBulkFiles(e.target.files)}
          />
        </div>
        <div className="form-group">
          <label className="label">Series</label>
          <select
            className="select"
            required
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {seriesList.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="label">Số tập</label>
            <input
              className="input"
              type="number"
              min={1}
              required
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="label">Tiêu đề</label>
            <input
              className="input"
              value={title}
              placeholder={`Tập ${number}`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="label">Nhãn chất lượng</label>
            <input
              className="input"
              value={qualityLabel}
              onChange={(e) => setQualityLabel(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">Nhãn audio</label>
            <input
              className="input"
              value={audioLabel}
              onChange={(e) => setAudioLabel(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">File video (tuỳ chọn)</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !seriesId}>
          {busy ? 'Đang xử lý...' : file ? 'Tạo + upload encode' : 'Tạo episode'}
        </button>
      </form>

      <div className="admin-toolbar">
        <div className="admin-filters">
          <input
            className="input"
            placeholder="Tìm tập / series..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load()
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Lọc
          </button>
        </div>
      </div>

      {manageId && (
        <div className="admin-form admin-form--wide" style={{ marginBottom: '1.25rem' }}>
          <h2>Phụ đề &amp; audio — tập #{manageId}</h2>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Nhãn phụ đề</label>
              <input className="input" value={subLabel} onChange={(e) => setSubLabel(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Mã ngôn ngữ</label>
              <input className="input" value={subLang} onChange={(e) => setSubLang(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Upload VTT / SRT</label>
              <input
                type="file"
                accept=".vtt,.srt,text/vtt"
                onChange={(e) => void onUploadSub(manageId, e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          {subs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có phụ đề.</p>
          ) : (
            <ul style={{ fontSize: '0.9rem' }}>
              {subs.map((s) => (
                <li key={s.id} style={{ marginBottom: 6 }}>
                  {s.label} ({s.lang}) —{' '}
                  <a href={s.url} target="_blank" rel="noreferrer">
                    xem
                  </a>{' '}
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void onDeleteSub(manageId, s.id)}
                  >
                    Xóa
                  </button>
                </li>
              ))}
            </ul>
          )}
          <hr style={{ borderColor: 'var(--border)', margin: '1rem 0' }} />
          <div className="form-row">
            <div className="form-group">
              <label className="label">Nhãn audio phụ</label>
              <input
                className="input"
                value={audioTrackLabel}
                onChange={(e) => setAudioTrackLabel(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Mã ngôn ngữ audio</label>
              <input
                className="input"
                value={audioTrackLang}
                onChange={(e) => setAudioTrackLang(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Upload audio (m4a/mp3/aac…)</label>
              <input
                type="file"
                accept="audio/*,.m4a,.aac,.mp3,.wav"
                onChange={(e) => void onUploadAudio(manageId, e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          {hlsAudio.length > 0 && (
            <p style={{ fontSize: '0.85rem' }}>
              Track HLS: {hlsAudio.map((t) => `${t.label} (${t.lang})`).join(' · ')}
            </p>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setManageId(null)}>
            Đóng
          </button>
        </div>
      )}

      {episodes.length === 0 ? (
        <EmptyState title="Chưa có episode" message="Tạo episode rồi upload video để encode." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Series</th>
                <th>Tập</th>
                <th>Encode</th>
                <th>Upload / thay</th>
                <th>Phụ đề / audio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => {
                const job = Object.values(jobs).find((j) => j.episodeId === ep.id)
                const status = job?.status || ep.statusEncode
                const subCount = ep.subtitles?.length ?? 0
                return (
                  <tr key={ep.id}>
                    <td>
                      {ep.seriesTitle || seriesTitle(ep.seriesId)}
                      {ep.seriesSlug ? (
                        <div style={{ fontSize: '0.75rem' }}>
                          <Link to={`/xem/${ep.seriesSlug}/${ep.number}`}>Xem</Link>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      #{ep.number} {ep.title}
                    </td>
                    <td>
                      <span className={`status-pill status-pill--${status || 'pending'}`}>
                        {encodeStatusLabel(status || 'pending')}
                      </span>
                      {job && (job.status === 'encoding' || job.status === 'queued') && (
                        <div className="job-status" style={{ marginTop: 6 }}>
                          <div className="job-status__bar">
                            <span style={{ width: `${Math.min(100, job.progress || 0)}%` }} />
                          </div>
                          <span>{Math.round(job.progress || 0)}%</span>
                        </div>
                      )}
                      {job?.error && (
                        <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
                          {job.error}
                        </div>
                      )}
                    </td>
                    <td>
                      <label className="btn btn-ghost btn-sm">
                        {uploadingId === ep.id
                          ? 'Đang upload...'
                          : ep.statusEncode === 'ready'
                            ? 'Thay video'
                            : 'Chọn file'}
                        <input
                          type="file"
                          accept="video/*"
                          hidden
                          disabled={uploadingId === ep.id}
                          onChange={(e) => onUpload(ep.id, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void openManage(ep)}
                      >
                        Quản lý{subCount ? ` (${subCount} sub)` : ''}
                      </button>
                    </td>
                    <td>
                      {status === 'failed' && job ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ marginRight: 6 }}
                          onClick={() => void onRetryJob(job.id)}
                        >
                          Retry
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => onDelete(ep.id)}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
