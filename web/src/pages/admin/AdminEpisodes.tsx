import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { EncodeJob, Episode, Series } from '../../api/types'
import { AdminFilePreview } from '../../components/admin/AdminFilePreview'
import { AdminImportPreview } from '../../components/admin/AdminImportPreview'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'
import { encodeStatusLabel } from '../../lib/format'
import {
  assignEpisodeNumbers,
  parseEpisodeFilename,
  type ParseConfidence,
} from '../../lib/parseEpisodeFilename'

type SubRow = { id: number | string; label: string; lang: string; url: string }

type BulkRow = {
  key: string
  file: File
  number: number
  title: string
  confidence: ParseConfidence
  conflict: boolean
  autoAssigned: boolean
}

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
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [manageId, setManageId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNumber, setEditNumber] = useState(1)
  const [editTitle, setEditTitle] = useState('')
  const [editQuality, setEditQuality] = useState('1080p')
  const [editAudio, setEditAudio] = useState('SUB+TM')
  const [editIntroEnd, setEditIntroEnd] = useState('')
  const [editCreditsStart, setEditCreditsStart] = useState('')
  const [subs, setSubs] = useState<SubRow[]>([])
  const [subLabel, setSubLabel] = useState('Tiếng Việt')
  const [subLang, setSubLang] = useState('vi')
  const [audioTrackLabel, setAudioTrackLabel] = useState('Audio phụ')
  const [audioTrackLang, setAudioTrackLang] = useState('en')
  const [hlsAudio, setHlsAudio] = useState<Array<{ label: string; lang: string }>>([])
  const [bulkPreview, setBulkPreview] = useState<BulkRow[]>([])

  const selectedSeries = useMemo(
    () => seriesList.find((s) => String(s.id) === String(seriesId)),
    [seriesList, seriesId],
  )
  const isMovie = selectedSeries?.kind === 'movie'

  const usedNumbers = useMemo(() => {
    const set = new Set<number>()
    for (const ep of episodes) {
      if (String(ep.seriesId) === String(seriesId)) set.add(ep.number)
    }
    return set
  }, [episodes, seriesId])

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
    const nextSeriesId = filterSeriesId || seriesId || (series[0] ? String(series[0].id) : '')
    if (nextSeriesId && nextSeriesId !== seriesId) setSeriesId(nextSeriesId)
    if (nextSeriesId) {
      const nums = eps
        .filter((ep) => String(ep.seriesId) === String(nextSeriesId))
        .map((ep) => ep.number)
      const max = nums.length ? Math.max(...nums) : 0
      setNumber(max + 1)
    }
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

  function applyFileParse(uploadFile: File | null) {
    setFile(uploadFile)
    if (!uploadFile || isMovie) return
    const parsed = parseEpisodeFilename(uploadFile.name, number)
    if (parsed.number != null) setNumber(parsed.number)
    setTitle(parsed.title)
  }

  function buildBulkPreview(fileList: FileList | null) {
    if (!fileList?.length || !seriesId) return
    const assigned = assignEpisodeNumbers(Array.from(fileList), usedNumbers, number)
    setBulkPreview(
      assigned.map((row, i) => ({
        key: `${row.file.name}-${i}-${row.file.size}`,
        file: row.file,
        number: row.number,
        title: row.title,
        confidence: row.confidence,
        conflict: row.conflict,
        autoAssigned: row.autoAssigned,
      })),
    )
    setError(null)
  }

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

  async function runUpload(episodeId: string, uploadFile: File) {
    setUploadingId(episodeId)
    setUploadPct((prev) => ({ ...prev, [episodeId]: 0 }))
    const res = await api.adminUpload(episodeId, uploadFile, (p) => {
      setUploadPct((prev) => ({ ...prev, [episodeId]: p.percent }))
    })
    if (res.job) setJobs((prev) => ({ ...prev, [res.job!.id]: res.job! }))
    else if (res.jobId) {
      const job = await api.adminJob(res.jobId)
      if (job) setJobs((prev) => ({ ...prev, [job.id]: job }))
    }
    setUploadPct((prev) => {
      const next = { ...prev }
      delete next[episodeId]
      return next
    })
    return res
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!seriesId) return
    setBusy(true)
    setError(null)
    try {
      if (isMovie) {
        const existing = episodes.find(
          (ep) => String(ep.seriesId) === String(seriesId) && ep.number === 1,
        )
        if (existing) {
          if (!file) {
            setError('Phim lẻ đã có tập #1 — chọn file để thay video / encode lại.')
            return
          }
          await runUpload(String(existing.id), file)
          setFile(null)
          await load()
          return
        }
      }

      const ep = await api.adminCreateEpisode({
        seriesId,
        number: isMovie ? 1 : number,
        title: title || (isMovie ? selectedSeries?.title || 'Phim' : `Tập ${number}`),
        qualityLabel,
        audioLabel,
      })
      if (file) {
        await runUpload(String(ep.id), file)
        setFile(null)
      }
      setTitle('')
      if (!isMovie) setNumber((n) => n + 1)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo episode thất bại')
    } finally {
      setBusy(false)
      setUploadingId(null)
    }
  }

  async function onUpload(episodeId: string, uploadFile: File | null) {
    if (!uploadFile) return
    setError(null)
    try {
      await runUpload(episodeId, uploadFile)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload thất bại')
    } finally {
      setUploadingId(null)
    }
  }

  function openEdit(ep: Episode) {
    setEditId(ep.id)
    setEditNumber(ep.number)
    setEditTitle(ep.title || '')
    setEditQuality(ep.qualityLabel || '1080p')
    setEditAudio(ep.audioLabel || 'SUB+TM')
    setEditIntroEnd(
      ep.introEndSec != null && ep.introEndSec > 0 ? String(ep.introEndSec) : '',
    )
    setEditCreditsStart(
      ep.creditsStartSec != null && ep.creditsStartSec > 0
        ? String(ep.creditsStartSec)
        : '',
    )
    setError(null)
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editId) return
    setBusy(true)
    setError(null)
    try {
      const introRaw = editIntroEnd.trim()
      const creditsRaw = editCreditsStart.trim()
      await api.adminUpdateEpisode(editId, {
        seriesId: episodes.find((x) => x.id === editId)?.seriesId || seriesId,
        number: editNumber,
        title: editTitle,
        qualityLabel: editQuality,
        audioLabel: editAudio,
        introEndSec: introRaw === '' ? null : Number(introRaw),
        creditsStartSec: creditsRaw === '' ? null : Number(creditsRaw),
      })
      setEditId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật tập thất bại')
    } finally {
      setBusy(false)
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

  async function confirmBulkImport() {
    if (!bulkPreview.length || !seriesId || isMovie) return
    setBusy(true)
    setError(null)
    try {
      const occupied = new Set(usedNumbers)
      for (const row of bulkPreview) {
        if (occupied.has(row.number)) {
          throw new Error(`Trùng số tập ${row.number} — sửa preview trước khi import`)
        }
        occupied.add(row.number)
      }
      let nextNum = number
      for (const row of bulkPreview) {
        const ep = await api.adminCreateEpisode({
          seriesId,
          number: row.number,
          title: row.title || `Tập ${row.number}`,
          qualityLabel,
          audioLabel,
        })
        await runUpload(String(ep.id), row.file)
        nextNum = Math.max(nextNum, row.number) + 1
      }
      setNumber(nextNum)
      setBulkPreview([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk import thất bại')
    } finally {
      setBusy(false)
      setUploadingId(null)
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
        <h2>{isMovie ? 'Upload / thay video phim lẻ' : 'Thêm / upload tập'}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '-0.5rem' }}>
          {isMovie ? (
            <>
              Phim lẻ chỉ có <strong>1 tập</strong>. Chọn file video → upload/encode. Không cần đổi tên
              file.
            </>
          ) : (
            <>
              Chọn file video sẽ <strong>tự đọc số tập + tên</strong> từ tên file (
              <code>S01E12</code>, <code>EP12</code>, <code>12 - Title</code>, <code>Tập 12</code>
              …). Bulk: chọn nhiều file → xem preview → xác nhận import.
            </>
          )}
        </p>

        {!isMovie && (
          <div className="form-group">
            <label className="label">Bulk import (nhiều file → preview)</label>
            <input
              type="file"
              accept="video/*"
              multiple
              disabled={busy || !seriesId}
              onChange={(e) => {
                buildBulkPreview(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        )}

        {bulkPreview.length > 0 && (
          <AdminImportPreview
            title={`Preview import (${bulkPreview.length} file)`}
            hint={
              <>
                Sửa số tập / tên nếu nhận diện sai, rồi bấm xác nhận. File gốc không cần đổi tên.
              </>
            }
            busy={busy}
            confirmLabel={`Xác nhận import ${bulkPreview.length} tập`}
            onConfirm={() => void confirmBulkImport()}
            onCancel={() => setBulkPreview([])}
          >
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Số tập</th>
                    <th>Tên tập</th>
                    <th>Độ tin cậy</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPreview.map((row) => (
                    <tr key={row.key}>
                      <td style={{ fontSize: '0.8rem', maxWidth: 220, wordBreak: 'break-word' }}>
                        {row.file.name}
                        {(row.conflict || row.autoAssigned) && (
                          <div style={{ color: 'var(--warning, #eab308)', fontSize: '0.75rem' }}>
                            {row.conflict
                              ? 'Trùng số — đã gán lại'
                              : 'Không parse được — gán tự động'}
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={row.number}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            setBulkPreview((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, number: n } : r)),
                            )
                          }}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={row.title}
                          onChange={(e) => {
                            const t = e.target.value
                            setBulkPreview((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, title: t } : r)),
                            )
                          }}
                        />
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{row.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminImportPreview>
        )}

        <div className="form-group">
          <label className="label">{isMovie ? 'Phim' : 'Series'}</label>
          <select
            className="select"
            required
            value={seriesId}
            onChange={(e) => {
              setSeriesId(e.target.value)
              setBulkPreview([])
              setFile(null)
              setTitle('')
            }}
          >
            <option value="">— Chọn —</option>
            {seriesList.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.kind === 'movie' ? '[Lẻ] ' : '[Bộ] '}
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {!isMovie && (
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
              <label className="label">Tiêu đề tập</label>
              <input
                className="input"
                value={title}
                placeholder={`Tập ${number}`}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
        )}

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
            <label className="label">File video</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => applyFileParse(e.target.files?.[0] ?? null)}
            />
            <AdminFilePreview
              file={file}
              caption={
                file && !isMovie
                  ? `Auto: tập ${number} — ${title || '(không tên)'}`
                  : undefined
              }
            />
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !seriesId || (isMovie && !file)}
        >
          {busy
            ? 'Đang xử lý...'
            : isMovie
              ? file
                ? 'Upload / thay video + encode'
                : 'Cần chọn file video'
              : file
                ? 'Tạo + upload encode'
                : 'Tạo episode'}
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

      {editId && (
        <form
          className="admin-form admin-form--wide"
          style={{ marginBottom: '1.25rem' }}
          onSubmit={onSaveEdit}
        >
          <h2>Sửa metadata tập #{editId}</h2>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Số tập</label>
              <input
                className="input"
                type="number"
                min={1}
                value={editNumber}
                onChange={(e) => setEditNumber(Number(e.target.value) || 1)}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="label">Tiêu đề</label>
              <input
                className="input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Chất lượng</label>
              <input
                className="input"
                value={editQuality}
                onChange={(e) => setEditQuality(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Audio label</label>
              <input
                className="input"
                value={editAudio}
                onChange={(e) => setEditAudio(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Intro kết thúc (giây)</label>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="vd. 90"
                value={editIntroEnd}
                onChange={(e) => setEditIntroEnd(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Credits bắt đầu (giây)</label>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="vd. 2400"
                value={editCreditsStart}
                onChange={(e) => setEditCreditsStart(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Lưu
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditId(null)}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

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
                          ? `Upload ${uploadPct[ep.id] ?? 0}%`
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
                      {uploadingId === ep.id && (
                        <div className="job-status" style={{ marginTop: 6 }}>
                          <div className="job-status__bar">
                            <span
                              style={{
                                width: `${Math.min(100, uploadPct[ep.id] ?? 0)}%`,
                              }}
                            />
                          </div>
                          <span>{uploadPct[ep.id] ?? 0}%</span>
                        </div>
                      )}
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
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ marginRight: 6 }}
                        onClick={() => openEdit(ep)}
                      >
                        Sửa
                      </button>
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
