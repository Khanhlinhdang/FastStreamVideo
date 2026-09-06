import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { AdminStats } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import { LoadingBlock } from '../../components/EmptyState'
import { encodeStatusLabel } from '../../lib/format'

export function AdminDashboardPage() {
  const { isFullAdmin } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState<number | null>(null)
  const [disk, setDisk] = useState<{ hlsBytes: number; uploadsBytes: number; totalBytes: number } | null>(null)
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null)

  async function refresh() {
    const s = await api.adminStats()
    setStats(s)
    setLoading(false)
    if (isFullAdmin) {
      try {
        setDisk(await api.adminDiskUsage())
      } catch {
        setDisk(null)
      }
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullAdmin])

  async function onRetry(jobId: number) {
    setActionBusy(jobId)
    try {
      await api.adminRetryJob(String(jobId))
      await refresh()
    } catch {
      /* ignore */
    } finally {
      setActionBusy(null)
    }
  }

  async function onClear(jobId: number) {
    if (!confirm('Xóa job này khỏi danh sách? (Không xóa file HLS nếu tập vẫn ready)')) return
    setActionBusy(jobId)
    try {
      await api.adminClearJob(String(jobId))
      await refresh()
    } catch {
      /* ignore */
    } finally {
      setActionBusy(null)
    }
  }

  async function onPurge() {
    if (!confirm('Xóa job ready/failed cũ hơn 30 ngày?')) return
    try {
      const r = await api.adminPurgeJobs(30)
      setPurgeMsg(`Đã xóa ${r.deleted} job cũ.`)
      await refresh()
    } catch (err) {
      setPurgeMsg(err instanceof Error ? err.message : 'Purge thất bại (cần admin)')
    }
  }

  if (loading || !stats) return <LoadingBlock label="Đang tải bảng điều khiển..." />

  const cards = [
    { label: 'Series', value: stats.series, to: '/admin/series' },
    { label: 'Episodes', value: stats.episodes, to: '/admin/episodes' },
    { label: 'Thể loại', value: stats.genres, to: '/admin/genres' },
    { label: 'Job đang chạy', value: stats.jobsQueued, to: '/admin/episodes' },
    { label: 'Encode sẵn sàng', value: stats.jobsReady, to: '/admin/episodes' },
    { label: 'Encode lỗi', value: stats.jobsFailed, to: '/admin/episodes' },
    { label: 'Tổng lượt xem', value: stats.totalViews, to: '/top' },
  ]

  function fmtBytes(n: number) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <div className="admin-dash">
      <p className="admin-dash__intro">
        Tổng quan LiveStream — quản lý phim, upload encode HLS đầy đủ chất lượng, theo dõi hàng đợi.
      </p>
      <div className="admin-dash__cards">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="admin-dash__card">
            <span className="admin-dash__card-value">{c.value}</span>
            <span className="admin-dash__card-label">{c.label}</span>
          </Link>
        ))}
      </div>

      <div className="admin-dash__actions">
        <Link to="/admin/series" className="btn btn-primary">
          + Tạo / sửa series
        </Link>
        <Link to="/admin/episodes" className="btn btn-ghost">
          Upload tập phim
        </Link>
        <Link to="/admin/comments" className="btn btn-ghost">
          Bình luận gắn cờ
        </Link>
        <Link to="/admin/schedule" className="btn btn-ghost">
          Lịch chiếu
        </Link>
      </div>

      {isFullAdmin && disk && (
        <>
          <h2 className="admin-section-title">Dung lượng media (admin)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            HLS: {fmtBytes(disk.hlsBytes)} · Uploads: {fmtBytes(disk.uploadsBytes)} · Tổng:{' '}
            {fmtBytes(disk.totalBytes)}
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => void onPurge()}>
            Dọn job cũ (&gt;30 ngày)
          </button>
          {purgeMsg && <p style={{ fontSize: '0.85rem' }}>{purgeMsg}</p>}
        </>
      )}

      <h2 className="admin-section-title">Encode gần đây</h2>
      {stats.recentJobs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Chưa có job encode.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Job</th>
                <th>Series / Tập</th>
                <th>Trạng thái</th>
                <th>Tiến độ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentJobs.map((j) => (
                <tr key={j.id}>
                  <td>#{j.id}</td>
                  <td>
                    {j.seriesTitle || '—'} · ep {j.episodeNumber ?? j.episodeId}
                  </td>
                  <td>
                    <span className={`status-pill status-pill--${j.status}`}>
                      {encodeStatusLabel(j.status as 'ready')}
                    </span>
                    {j.error ? (
                      <div style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{j.error}</div>
                    ) : null}
                  </td>
                  <td>{Math.round(j.progress || 0)}%</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {j.status === 'failed' ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        disabled={actionBusy === j.id}
                        onClick={() => void onRetry(j.id)}
                      >
                        Retry
                      </button>
                    ) : null}
                    {j.status === 'failed' || j.status === 'ready' ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        disabled={actionBusy === j.id}
                        onClick={() => void onClear(j.id)}
                      >
                        Xóa
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlaybackQoEBlock />
    </div>
  )
}

function PlaybackQoEBlock() {
  const [rows, setRows] = useState<
    Array<{
      episodeId: number
      episodeNumber?: number
      seriesTitle?: string
      type: string
      eventCount: number
      avgDurationMs: number | null
    }>
  >([])
  const [totals, setTotals] = useState<Array<{ type: string; c: number; avgMs: number | null }>>([])

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.adminPlaybackStats(24)
        setRows(s.items)
        setTotals(s.totals)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  return (
    <>
      <h2 className="admin-section-title">QoE 24h (playback_events)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {totals.map((t) => `${t.type}: ${t.c}`).join(' · ') || 'Chưa có sự kiện.'}
      </p>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Loại</th>
                <th>Số lần</th>
                <th>Avg ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={`${r.episodeId}-${r.type}`}>
                  <td>
                    {r.seriesTitle || '—'} · ep {r.episodeNumber ?? r.episodeId}
                  </td>
                  <td>{r.type}</td>
                  <td>{r.eventCount}</td>
                  <td>{r.avgDurationMs != null ? Math.round(r.avgDurationMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
