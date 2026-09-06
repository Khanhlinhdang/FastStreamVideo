import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { ScheduleItem, Series } from '../../api/types'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'
import { WEEKDAYS } from '../../lib/format'

export function AdminSchedulePage() {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [seriesId, setSeriesId] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [sched, series] = await Promise.all([
      api.adminSchedule(),
      api.adminSeriesList(),
    ])
    setItems(sched)
    setSeriesList(series)
    if (!seriesId && series[0]) setSeriesId(series[0].id)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.adminCreateSchedule({ seriesId, weekday, note: note || undefined })
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thêm lịch thất bại')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Xóa slot lịch?')) return
    try {
      await api.adminDeleteSchedule(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  function dayLabel(d: number) {
    return WEEKDAYS.find((w) => w.value === d)?.label || String(d)
  }

  function seriesTitle(id: string, item: ScheduleItem) {
    return item.series?.title || seriesList.find((s) => s.id === id)?.title || id
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <form className="admin-form" onSubmit={onCreate}>
        <h2>Thêm lịch chiếu</h2>
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
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Thứ</label>
          <select
            className="select"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Ghi chú</label>
          <input
            className="input"
            value={note}
            placeholder="VD: Tập mới mỗi tuần"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !seriesId}>
          Thêm
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="Chưa có lịch" message="Thêm slot lịch chiếu theo thứ trong tuần." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Thứ</th>
                <th>Series</th>
                <th>Ghi chú</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{dayLabel(item.weekday)}</td>
                  <td>{seriesTitle(item.seriesId, item)}</td>
                  <td>{item.note || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => onDelete(item.id)}
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
