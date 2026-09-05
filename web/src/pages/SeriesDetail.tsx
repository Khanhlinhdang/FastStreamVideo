import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Episode, Series } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { EmptyState, LoadingBlock } from '../components/EmptyState'
import { EpisodeBadge } from '../components/EpisodeBadge'
import { PosterRow } from '../components/PosterRow'
import { SeoHead } from '../components/SeoHead'
import {
  encodeStatusLabel,
  formatViews,
  placeholderPoster,
  statusLabel,
} from '../lib/format'
import './SeriesDetail.css'

function youtubeEmbed(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function SeriesDetailPage() {
  const { slug = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const [series, setSeries] = useState<Series | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [related, setRelated] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [fav, setFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)
  const [ratingBusy, setRatingBusy] = useState(false)
  const seasonParam = Number(searchParams.get('season') || '1')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [s, eps, favorites, rel] = await Promise.all([
        api.seriesBySlug(slug),
        api.episodes(slug),
        isAuthenticated ? api.favorites() : Promise.resolve([]),
        api.related(slug),
      ])
      if (!cancelled) {
        setSeries(s)
        setEpisodes(eps.sort((a, b) => {
          const sa = a.seasonNumber ?? 1
          const sb = b.seasonNumber ?? 1
          if (sa !== sb) return sa - sb
          return a.number - b.number
        }))
        setRelated(rel)
        if (s) setFav(favorites.some((f) => String(f.id) === String(s.id) || f.slug === s.slug))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, isAuthenticated])

  const seasons = useMemo(() => {
    const set = new Set(episodes.map((e) => e.seasonNumber ?? 1))
    return [...set].sort((a, b) => a - b)
  }, [episodes])

  const activeSeason = seasons.includes(seasonParam) ? seasonParam : (seasons[0] ?? 1)
  const seasonEps = episodes.filter((e) => (e.seasonNumber ?? 1) === activeSeason)
  const isMovie = series?.kind === 'movie'
  const yt = youtubeEmbed(series?.trailerUrl)

  async function toggleFavorite() {
    if (!series || !isAuthenticated || favBusy) return
    setFavBusy(true)
    try {
      if (fav) {
        await api.removeFavorite(series.id)
        setFav(false)
      } else {
        await api.addFavorite(series.id)
        setFav(true)
      }
    } catch {
      /* ignore */
    } finally {
      setFavBusy(false)
    }
  }

  async function rate(score: number) {
    if (!series || !isAuthenticated || ratingBusy) return
    setRatingBusy(true)
    try {
      const res = await api.rateSeries(series.id, score)
      setSeries((prev) =>
        prev
          ? {
              ...prev,
              ratingAvg: res.ratingAvg,
              ratingCount: res.ratingCount,
              userRating: res.userRating,
            }
          : prev,
      )
    } catch {
      /* ignore */
    } finally {
      setRatingBusy(false)
    }
  }

  async function shareLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      alert('Đã copy link!')
    } catch {
      prompt('Copy link:', url)
    }
  }

  if (loading) {
    return (
      <div className="series-detail series-detail--skel">
        <div className="series-detail__cinematic skeleton" style={{ minHeight: '50vh' }} />
        <div className="container" style={{ paddingTop: '1.5rem' }}>
          <LoadingBlock label="Đang tải chi tiết..." />
        </div>
      </div>
    )
  }

  if (!series) {
    return (
      <div className="container">
        <EmptyState
          title="Không tìm thấy"
          message="Series không tồn tại hoặc API chưa sẵn sàng."
          action={
            <Link to="/" className="btn btn-primary">
              Về trang chủ
            </Link>
          }
        />
      </div>
    )
  }

  const firstReady = seasonEps.find((e) => e.statusEncode === 'ready') ?? seasonEps[0]
  const watchTo = firstReady
    ? `/xem/${series.slug}/${firstReady.number}${activeSeason > 1 ? `?season=${activeSeason}` : ''}`
    : null
  const poster = series.posterUrl || placeholderPoster(series.title)

  return (
    <div className="series-detail fade-up">
      <SeoHead
        title={`${series.title} — LiveStream`}
        description={(series.tagline || series.synopsis || series.title).slice(0, 160)}
        image={poster}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': isMovie ? 'Movie' : 'TVSeries',
          name: series.title,
          description: series.synopsis,
          image: poster,
          dateCreated: series.year ? String(series.year) : undefined,
        }}
      />

      <div
        className="series-detail__cinematic"
        style={{ backgroundImage: `url(${poster})` }}
      >
        <div className="container series-detail__hero">
          <img
            className="series-detail__poster"
            src={poster}
            alt={series.title}
            onError={(e) => {
              e.currentTarget.src = placeholderPoster(series.title)
            }}
          />
          <div className="series-detail__info">
            <p className="series-detail__kind">{isMovie ? 'Phim lẻ' : 'Phim bộ'}</p>
            {series.tagline ? <p className="series-detail__tagline">{series.tagline}</p> : null}
            <h1>{series.title}</h1>
            <div className="series-detail__meta">
              <span className="badge badge-muted">{statusLabel(series.status)}</span>
              {series.ageRating ? <span className="badge badge-warn">{series.ageRating}</span> : null}
              {series.year ? <span>{series.year}</span> : null}
              {series.runtimeSec ? (
                <span>{Math.round(series.runtimeSec / 60)} phút</span>
              ) : null}
              {series.country ? <span>{series.country}</span> : null}
              <span>{formatViews(series.viewCount)} lượt xem</span>
              {series.ratingAvg != null ? (
                <span className="badge badge-warn">
                  ★ {series.ratingAvg}
                  {series.ratingCount ? ` (${series.ratingCount})` : ''}
                </span>
              ) : null}
            </div>
            {series.genres && series.genres.length > 0 && (
              <div className="series-detail__genres">
                {series.genres.map((g) => (
                  <Link key={g.id} to={`/the-loai/${g.slug}`} className="badge badge-teal">
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
            {series.director ? (
              <p className="series-detail__crew">Đạo diễn: {series.director}</p>
            ) : null}
            {series.cast && series.cast.length > 0 ? (
              <div className="series-detail__cast">
                {series.cast.slice(0, 8).map((c) => {
                  const personSlug =
                    c.slug ||
                    c.name
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')
                  return (
                    <Link key={c.name} to={`/dien-vien/${personSlug}`} className="chip">
                      {c.name}
                      {c.role ? ` (${c.role})` : ''}
                    </Link>
                  )
                })}
              </div>
            ) : null}
            <p className="series-detail__synopsis">{series.synopsis || 'Chưa có mô tả.'}</p>
            <div className="series-detail__actions">
              {watchTo ? (
                <Link to={watchTo} className="btn btn-primary">
                  {isMovie ? 'Xem phim' : `Xem tập ${firstReady?.number}`}
                </Link>
              ) : (
                <button type="button" className="btn btn-primary" disabled>
                  Chưa có tập
                </button>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  className={`btn ${fav ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={toggleFavorite}
                  disabled={favBusy}
                >
                  {fav ? '★ Đã thích' : '☆ Yêu thích'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => void shareLink()}>
                Chia sẻ
              </button>
            </div>
            {isAuthenticated && (
              <div className="series-detail__rating" style={{ marginTop: '0.75rem' }}>
                <span style={{ marginRight: '0.5rem', color: 'var(--text-muted)' }}>
                  Đánh giá của bạn:
                </span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${(series.userRating ?? 0) >= n ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={ratingBusy}
                    onClick={() => void rate(n)}
                    aria-label={`${n} sao`}
                  >
                    ★
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container">
        {yt ? (
          <section className="section">
            <h2 className="section-title">Trailer</h2>
            <div className="series-detail__trailer">
              <iframe
                title={`Trailer ${series.title}`}
                src={yt}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        ) : null}

        {!isMovie && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Danh sách tập</h2>
            </div>
            {seasons.length > 1 && (
              <div className="season-tabs">
                {seasons.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip${s === activeSeason ? ' is-active' : ''}`}
                    onClick={() => setSearchParams({ season: String(s) })}
                  >
                    Mùa {s}
                  </button>
                ))}
              </div>
            )}
            {seasonEps.length === 0 ? (
              <EmptyState title="Chưa có tập" message="Admin cần thêm episode cho series này." />
            ) : (
              <div className="episode-grid">
                {seasonEps.map((ep) => (
                  <Link
                    key={ep.id}
                    to={`/xem/${series.slug}/${ep.number}?season=${activeSeason}`}
                    className="episode-chip"
                  >
                    <span className="episode-chip__num">Tập {ep.number}</span>
                    <span className="episode-chip__title">{ep.title || `Tập ${ep.number}`}</span>
                    <EpisodeBadge quality={ep.qualityLabel} audio={ep.audioLabel} />
                    {ep.statusEncode && ep.statusEncode !== 'ready' && (
                      <span className="episode-chip__encode">
                        {encodeStatusLabel(ep.statusEncode)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {isMovie && seasonEps.length > 0 && (
          <section className="section">
            <p className="text-muted">
              Phim lẻ — phát qua nút <strong>Xem phim</strong> ở trên.
            </p>
          </section>
        )}

        {related.length > 0 && <PosterRow title="Cùng thể loại" items={related} />}
      </div>
    </div>
  )
}
