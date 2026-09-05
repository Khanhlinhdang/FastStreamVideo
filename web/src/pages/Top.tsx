import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Series } from '../api/types'
import { EmptyState, LoadingBlock } from '../components/EmptyState'
import { formatViews, placeholderPoster } from '../lib/format'
import './Top.css'

export function TopPage() {
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await api.ranking()
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="container">
      <h1 className="page-title">Bảng xếp hạng</h1>
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title="Chưa có xếp hạng" message="Dữ liệu ranking trống." />
      ) : (
        <ol className="top-list">
          {items.map((s, i) => (
            <li key={s.id} className="top-list__item fade-up">
              <span className={`top-list__rank${i < 3 ? ' is-top' : ''}`}>{i + 1}</span>
              <Link to={`/phim/${s.slug}`} className="top-list__card">
                <img
                  src={s.posterUrl || placeholderPoster(s.title)}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = placeholderPoster(s.title)
                  }}
                />
                <div>
                  <h2>{s.title}</h2>
                  <p>
                    {s.year} · {formatViews(s.viewCount)} lượt xem
                    {s.latestEpisode != null ? ` · Tập ${s.latestEpisode}` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
