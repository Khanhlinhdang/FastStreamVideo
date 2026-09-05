import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import type { Series, WatchHistoryItem } from '../api/types'
import { EmptyState, LoadingBlock, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'
import { useAuth } from '../context/AuthContext'
import { formatRelativeTime, placeholderPoster } from '../lib/format'
import './Library.css'

export function FavoritesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      const list = await api.favorites()
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/dang-nhap?redirect=/yeu-thich" replace />
  }

  return (
    <div className="container">
      <h1 className="page-title">Phim yêu thích</h1>
      {loading || authLoading ? (
        <PosterGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có yêu thích"
          message="Thêm phim từ trang chi tiết bằng nút Yêu thích."
          action={
            <Link to="/" className="btn btn-primary">
              Khám phá
            </Link>
          }
        />
      ) : (
        <div className="poster-grid">
          {items.map((s) => (
            <PosterCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  )
}

export function HistoryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [items, setItems] = useState<WatchHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      const list = await api.history()
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/dang-nhap?redirect=/lich-su" replace />
  }

  return (
    <div className="container">
      <h1 className="page-title">Lịch sử xem</h1>
      {loading || authLoading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có lịch sử"
          message="Tiến độ xem sẽ được lưu khi bạn đăng nhập và phát video."
        />
      ) : (
        <ul className="history-list">
          {items.map((item) => {
            const title = item.seriesTitle || 'Phim'
            const to = item.seriesSlug
              ? `/xem/${item.seriesSlug}/${item.episodeNumber}`
              : '#'
            return (
              <li key={`${item.episodeId}-${item.updatedAt}`} className="history-list__item">
                <Link to={to} className="history-list__link">
                  <img
                    src={item.posterUrl || placeholderPoster(title)}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.src = placeholderPoster(title)
                    }}
                  />
                  <div>
                    <h2>{title}</h2>
                    <p>
                      Tập {item.episodeNumber}
                      {item.episodeTitle ? ` — ${item.episodeTitle}` : ''}
                    </p>
                    <p className="history-list__time">{formatRelativeTime(item.updatedAt)}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
