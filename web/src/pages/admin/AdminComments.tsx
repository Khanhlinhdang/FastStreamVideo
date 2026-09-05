import { useEffect, useState } from 'react'
import { api } from '../../api'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'

type FlaggedComment = {
  id: number
  body: string
  flagCount: number
  hiddenAt: string | null
  episodeId: number
  createdAt: string
  displayName: string
  episodeNumber?: number
  seriesTitle?: string
}

export function AdminCommentsPage() {
  const [items, setItems] = useState<FlaggedComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await api.adminFlaggedComments()
      setItems(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được bình luận')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onHide(id: number) {
    setBusyId(id)
    try {
      await api.adminHideComment(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ẩn thất bại')
    } finally {
      setBusyId(null)
    }
  }

  async function onUnhide(id: number) {
    setBusyId(id)
    try {
      await api.adminUnhideComment(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bỏ ẩn thất bại')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(id: number) {
    if (!confirm('Xóa bình luận này? (soft-delete)')) return
    setBusyId(id)
    try {
      await api.adminDeleteComment(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa thất bại')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <LoadingBlock label="Đang tải bình luận bị gắn cờ..." />

  return (
    <div>
      <h2 className="admin-section-title">Bình luận bị báo cáo / đã ẩn</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Danh sách comment có flagCount &gt; 0 hoặc đã ẩn. Ẩn → không hiện public; Xóa → soft-delete.
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {items.length === 0 ? (
        <EmptyState title="Không có bình luận gắn cờ" message="Khi user báo cáo, chúng sẽ hiện ở đây." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Series / Tập</th>
                <th>Người gửi</th>
                <th>Nội dung</th>
                <th>Cờ</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.seriesTitle || '—'} · ep {c.episodeNumber ?? c.episodeId}
                  </td>
                  <td>{c.displayName}</td>
                  <td style={{ maxWidth: 320 }}>{c.body}</td>
                  <td>{c.flagCount}</td>
                  <td>{c.hiddenAt ? 'Đã ẩn' : 'Hiện'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.hiddenAt ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => void onUnhide(c.id)}
                      >
                        Bỏ ẩn
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => void onHide(c.id)}
                      >
                        Ẩn
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === c.id}
                      onClick={() => void onDelete(c.id)}
                    >
                      Xóa
                    </button>
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
