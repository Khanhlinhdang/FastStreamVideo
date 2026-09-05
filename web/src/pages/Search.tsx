import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { ContentKind, Genre, Series, SeriesStatus } from '../api/types'
import { useDebounce } from '../hooks/useDebounce'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'
import './Search.css'

const SORTS = [
  { v: 'relevance', label: 'Liên quan' },
  { v: 'updated', label: 'Mới cập nhật' },
  { v: 'views', label: 'Lượt xem' },
  { v: 'year', label: 'Năm' },
  { v: 'title', label: 'Tên A–Z' },
  { v: 'rating', label: 'Đánh giá' },
]

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [kind, setKind] = useState<ContentKind | ''>(
    (params.get('kind') as ContentKind) || '',
  )
  const [genre, setGenre] = useState(params.get('genre') ?? '')
  const [year, setYear] = useState(params.get('year') ?? '')
  const [country, setCountry] = useState(params.get('country') ?? '')
  const [status, setStatus] = useState<SeriesStatus | ''>(
    (params.get('status') as SeriesStatus) || '',
  )
  const [sort, setSort] = useState(params.get('sort') ?? 'relevance')
  const [showFilters, setShowFilters] = useState(true)
  const debounced = useDebounce(q, 350)
  const [items, setItems] = useState<Series[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.genres().then(setGenres)
  }, [])

  useEffect(() => {
    setQ(params.get('q') ?? '')
    setKind((params.get('kind') as ContentKind) || '')
    setGenre(params.get('genre') ?? '')
    setYear(params.get('year') ?? '')
    setCountry(params.get('country') ?? '')
    setStatus((params.get('status') as SeriesStatus) || '')
    setSort(params.get('sort') ?? 'relevance')
  }, [params])

  const hasFacet = Boolean(kind || genre || year || country || status)

  useEffect(() => {
    const next: Record<string, string> = {}
    if (debounced.trim()) next.q = debounced.trim()
    if (kind) next.kind = kind
    if (genre) next.genre = genre
    if (year) next.year = year
    if (country) next.country = country
    if (status) next.status = status
    if (sort && sort !== 'relevance') next.sort = sort
    setParams(next, { replace: true })

    if (!debounced.trim() && !hasFacet) {
      setItems([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    ;(async () => {
      const list = await api.search({
        q: debounced.trim() || undefined,
        kind: kind || undefined,
        genre: genre || undefined,
        year: year || undefined,
        country: country || undefined,
        status: status || undefined,
        sort,
      })
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, kind, genre, year, country, status, sort, hasFacet, setParams])

  const quickGenres = useMemo(() => genres.slice(0, 10), [genres])

  return (
    <div className="container search-page">
      <h1 className="page-title">Tìm kiếm</h1>

      <div className="search-chrome">
        <input
          className="input search-chrome__q"
          type="search"
          placeholder="Nhập tên phim, tagline..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? 'Ẩn bộ lọc' : 'Bộ lọc'}
        </button>
      </div>

      {quickGenres.length > 0 && (
        <div className="search-chips">
          {quickGenres.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`chip${genre === g.slug ? ' is-active' : ''}`}
              onClick={() => setGenre(genre === g.slug ? '' : g.slug)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="search-filters">
          <label>
            Loại
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as ContentKind | '')}
            >
              <option value="">Tất cả</option>
              <option value="movie">Phim lẻ</option>
              <option value="series">Phim bộ</option>
            </select>
          </label>
          <label>
            Năm
            <input
              className="input"
              type="number"
              placeholder="2024"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label>
            Quốc gia
            <input
              className="input"
              placeholder="Nhật, Hàn..."
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </label>
          <label>
            Trạng thái
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as SeriesStatus | '')}
            >
              <option value="">Tất cả</option>
              <option value="ongoing">Đang chiếu</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </label>
          <label>
            Sắp xếp
            <select
              className="input"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!debounced.trim() && !hasFacet ? (
        <EmptyState title="Nhập từ khóa hoặc chọn bộ lọc" message="Tìm theo tên, thể loại, năm, loại phim." />
      ) : loading ? (
        <PosterGridSkeleton count={8} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Không tìm thấy"
          message="Thử đổi từ khóa hoặc bỏ bớt bộ lọc."
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
