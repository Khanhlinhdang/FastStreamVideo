import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Series } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { placeholderPoster, statusLabel } from '../lib/format'
import {
  HOVER_PREVIEW_DELAY_MS,
  canUseHoverPreview,
  claimHoverPreview,
  computeHoverPreviewTransform,
  releaseHoverPreview,
  type HoverPreviewTransform,
} from '../lib/hoverPreview'
import { resolveHoverPreviewMeta } from '../lib/resolveHoverPreview'
import { EpisodeBadge } from './EpisodeBadge'
import { HoverPreviewCard, type HoverPreviewMeta } from './HoverPreviewCard'
import './PosterCard.css'

type Props = {
  series: Series
  showLatest?: boolean
  compact?: boolean
}

const DEFAULT_TRANSFORM: HoverPreviewTransform = {
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
}

export function PosterCard({ series, showLatest = true, compact }: Props) {
  const poster = series.posterUrl || placeholderPoster(series.title)
  const previewKey = useId()
  const { isAuthenticated } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openGenRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [transform, setTransform] = useState<HoverPreviewTransform>(DEFAULT_TRANSFORM)
  const [meta, setMeta] = useState<HoverPreviewMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [fav, setFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const closePreview = useCallback(() => {
    clearOpenTimer()
    openGenRef.current += 1
    setOpen(false)
    setMeta(null)
    setLoadingMeta(false)
    releaseHoverPreview(previewKey)
  }, [clearOpenTimer, previewKey])

  const openPreview = useCallback(async () => {
    if (!canUseHoverPreview()) return
    const gen = ++openGenRef.current
    claimHoverPreview(previewKey, () => {
      clearOpenTimer()
      openGenRef.current += 1
      setOpen(false)
      setMeta(null)
      setLoadingMeta(false)
    })

    const wrap = rootRef.current
    const media = wrap?.querySelector('.poster-card__media') as HTMLElement | null
    if (wrap && media) {
      setTransform(
        computeHoverPreviewTransform(
          media.getBoundingClientRect(),
          wrap.getBoundingClientRect(),
        ),
      )
    }

    setOpen(true)
    setLoadingMeta(true)
    try {
      const resolved = await resolveHoverPreviewMeta(series.slug)
      if (openGenRef.current !== gen) return
      setMeta(resolved)
      if (isAuthenticated) {
        try {
          const favorites = await api.favorites()
          if (openGenRef.current !== gen) return
          setFav(
            favorites.some(
              (f) => String(f.id) === String(series.id) || f.slug === series.slug,
            ),
          )
        } catch {
          /* ignore */
        }
      }
    } catch {
      if (openGenRef.current !== gen) return
      setMeta({ previewUrl: null, episodeNumber: null })
    } finally {
      if (openGenRef.current === gen) setLoadingMeta(false)
    }
  }, [clearOpenTimer, isAuthenticated, previewKey, series.id, series.slug])

  const scheduleOpen = useCallback(() => {
    if (!canUseHoverPreview()) return
    clearOpenTimer()
    openTimerRef.current = setTimeout(() => {
      void openPreview()
    }, HOVER_PREVIEW_DELAY_MS)
  }, [clearOpenTimer, openPreview])

  useEffect(() => {
    if (!open) return

    const onScroll = () => closePreview()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, closePreview])

  useEffect(() => {
    return () => {
      clearOpenTimer()
      releaseHoverPreview(previewKey)
    }
  }, [clearOpenTimer, previewKey])

  async function toggleFavorite() {
    if (!isAuthenticated || favBusy) return
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

  const showPreview = open && canUseHoverPreview()
  const previewMeta: HoverPreviewMeta = meta ?? {
    previewUrl: null,
    episodeNumber: series.latestEpisode ?? null,
  }

  const previewStyle = showPreview
    ? ({
        '--preview-w': `${transform.width}px`,
        '--preview-h': `${transform.height}px`,
        '--preview-x': `${transform.offsetX}px`,
        '--preview-y': `${transform.offsetY}px`,
      } as CSSProperties)
    : undefined

  return (
    <div
      ref={rootRef}
      className={`poster-card-wrap${showPreview ? ' poster-card-wrap--preview' : ''}${
        compact ? ' poster-card-wrap--compact' : ''
      }`}
      style={previewStyle}
      onMouseEnter={() => {
        if (canUseHoverPreview()) scheduleOpen()
      }}
      onMouseLeave={() => {
        clearOpenTimer()
        closePreview()
      }}
      onFocus={() => {
        if (canUseHoverPreview()) scheduleOpen()
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next && rootRef.current?.contains(next)) return
        clearOpenTimer()
        closePreview()
      }}
    >
      <Link
        to={`/phim/${series.slug}`}
        className={`poster-card fade-up${compact ? ' poster-card--compact' : ''}${
          showPreview ? ' poster-card--previewing' : ''
        }`}
        tabIndex={0}
      >
        <div className="poster-card__media">
          <img
            src={poster}
            alt={series.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = placeholderPoster(series.title)
            }}
          />
          <div className="poster-card__overlay">
            <span className="poster-card__play">▶</span>
          </div>
          <span className="poster-card__kind badge">
            {series.kind === 'movie' ? 'Phim lẻ' : 'Phim bộ'}
          </span>
          {showLatest && series.kind !== 'movie' && series.latestEpisode != null && (
            <div className="poster-card__badges">
              <EpisodeBadge
                episode={series.latestEpisode}
                quality={series.qualityLabel}
                audio={series.audioLabel}
              />
            </div>
          )}
          {series.status === 'completed' && (
            <span className="poster-card__status badge badge-teal">
              {statusLabel(series.status)}
            </span>
          )}
        </div>
        <h3 className="poster-card__title" title={series.title}>
          {series.title}
        </h3>
        {series.year ? <p className="poster-card__meta">{series.year}</p> : null}
      </Link>

      {showPreview ? (
        <div className="poster-card__preview-layer">
          <HoverPreviewCard
            series={series}
            meta={
              loadingMeta && !meta
                ? { previewUrl: null, episodeNumber: series.latestEpisode ?? null }
                : previewMeta
            }
            showFavorite={isAuthenticated}
            isFavorite={fav}
            favBusy={favBusy}
            onToggleFavorite={() => void toggleFavorite()}
            onPreviewFailed={() =>
              setMeta((prev) =>
                prev ? { ...prev, previewUrl: null } : { previewUrl: null, episodeNumber: null },
              )
            }
          />
        </div>
      ) : null}
    </div>
  )
}

export function PosterCardSkeleton() {
  return (
    <div className="poster-card">
      <div className="poster-card__media skeleton" />
      <div className="poster-card__title-skel skeleton" />
    </div>
  )
}
