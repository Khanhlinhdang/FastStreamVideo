import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Series } from '../api/types'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'

export function CompletedPage() {
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await api.completed()
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
      <h1 className="page-title">Đã hoàn thành</h1>
      {loading ? (
        <PosterGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có phim hoàn thành"
          message="Khi series chuyển sang trạng thái completed sẽ hiện tại đây."
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
