import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Genre, Series } from '../api/types'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'

const SORTS = [
  { v: 'updated', label: 'Mới cập nhật' },
  { v: 'views', label: 'Lượt xem' },
  { v: 'rating', label: 'Đánh giá' },
  { v: 'year', label: 'Năm' },
  { v: 'title', label: 'Tên A–Z' },
]

export function GenrePage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const sort = params.get('sort') || 'updated'
  const [genre, setGenre] = useState<Genre | null>(null)
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [genres, list] = await Promise.all([
        api.genres(),
        api.seriesList({
          genre: slug,
          limit: 48,
          sort: sort as 'updated' | 'views' | 'title' | 'year' | 'rating',
        }),
      ])
      if (!cancelled) {
        setGenre(genres.find((g) => g.slug === slug) ?? null)
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, sort])

  return (
    <div className="container">
      <div className="section-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Thể loại: {genre?.name || slug || '—'}
        </h1>
        <label className="label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Sắp xếp
          <select
            className="input"
            style={{ width: 'auto' }}
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value })}
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <PosterGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="Không có phim"
          message="Thể loại này chưa có series hoặc API chưa trả dữ liệu."
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
