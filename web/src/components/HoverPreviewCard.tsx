import { Link } from 'react-router-dom'
import type { Series } from '../api/types'
import { formatViews, placeholderPoster, statusLabel } from '../lib/format'
import { EpisodeBadge } from './EpisodeBadge'
import { MutedPreviewPlayer } from './MutedPreviewPlayer'
import './HoverPreviewCard.css'

export type HoverPreviewMeta = {
  previewUrl: string | null
  episodeNumber: number | null
  qualityLabel?: string
  audioLabel?: string
  trailerUrl?: string | null
  isTrailer?: boolean
}

type Props = {
  series: Series
  meta: HoverPreviewMeta
  isFavorite?: boolean
  favBusy?: boolean
  showFavorite?: boolean
  onToggleFavorite?: () => void
  onPreviewFailed?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/**
 * 16:9 billboard chrome over a poster cell (positioned by PosterCard layer).
 * Video + compact meta/actions sit inside the landscape preview frame.
 */
export function HoverPreviewCard({
  series,
  meta,
  isFavorite,
  favBusy,
  showFavorite,
  onToggleFavorite,
  onPreviewFailed,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const poster = series.posterUrl || placeholderPoster(series.title)
  const isMovie = series.kind === 'movie'
  const watchEp = meta.episodeNumber ?? (isMovie ? 1 : series.latestEpisode)
  const watchTo =
    watchEp != null ? `/xem/${series.slug}/${watchEp}` : `/phim/${series.slug}`
  const detailTo = `/phim/${series.slug}`
  const genres = series.genres?.slice(0, 2) ?? []

  async function share() {
    const url = `${window.location.origin}${detailTo}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      prompt('Copy link:', url)
    }
  }

  return (
    <div
      className="hover-preview"
      role="dialog"
      aria-label={`Xem trước ${series.title}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Link
        to={watchTo}
        className="hover-preview__media"
        aria-label={`Xem ngay ${series.title}`}
        tabIndex={-1}
      >
        <img
          className="hover-preview__poster"
          src={poster}
          alt=""
          onError={(e) => {
            e.currentTarget.src = placeholderPoster(series.title)
          }}
        />
        {meta.previewUrl ? (
          <MutedPreviewPlayer
            key={meta.previewUrl}
            src={meta.previewUrl}
            poster={poster}
            className="hover-preview__video"
            onFailed={onPreviewFailed}
          />
        ) : null}
        <div className="hover-preview__media-fade" />
      </Link>

      <div className="hover-preview__chrome">
        <Link to={watchTo} className="hover-preview__title-link">
          <h3 className="hover-preview__title">{series.title}</h3>
        </Link>

        <div className="hover-preview__badges">
          <span className="badge badge-teal">{isMovie ? 'Phim lẻ' : 'Phim bộ'}</span>
          {!isMovie && meta.episodeNumber != null ? (
            <EpisodeBadge
              episode={meta.episodeNumber}
              quality={meta.qualityLabel || series.qualityLabel}
              audio={meta.audioLabel || series.audioLabel}
            />
          ) : null}
          <span className="badge badge-muted">{statusLabel(series.status)}</span>
          {series.year ? <span className="badge badge-muted">{series.year}</span> : null}
          {meta.isTrailer ? <span className="badge badge-warn">Trailer</span> : null}
          {meta.isTrailer && meta.trailerUrl && !meta.previewUrl ? (
            <span className="badge badge-muted">YouTube (mở link)</span>
          ) : null}
        </div>

        {(genres.length > 0 || series.viewCount > 0) && (
          <p className="hover-preview__meta">
            {genres.map((g) => g.name).join(' · ')}
            {genres.length > 0 && series.viewCount > 0 ? ' · ' : ''}
            {series.viewCount > 0 ? `${formatViews(series.viewCount)} xem` : ''}
          </p>
        )}

        <div className="hover-preview__actions">
          <Link to={watchTo} className="btn btn-primary btn-sm" tabIndex={0}>
            Xem ngay
          </Link>
          {meta.trailerUrl ? (
            <a
              href={meta.trailerUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Trailer
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void share()
            }}
          >
            Chia sẻ
          </button>
          {showFavorite ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={favBusy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleFavorite?.()
              }}
            >
              {isFavorite ? '✓ Yêu thích' : '+ Yêu thích'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
