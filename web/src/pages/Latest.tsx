import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Series } from '../api/types'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'

export function LatestPage() {
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await api.seriesList({ sort: 'updated', pageSize: 48 })
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
      <h1 className="page-title">Mới cập nhật</h1>
      {loading ? (
        <PosterGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title="Chưa có series" message="Catalog trống hoặc API chưa sẵn sàng." />
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
