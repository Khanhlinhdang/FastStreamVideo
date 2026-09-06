import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, mediaUrl } from '../api'
import type { Episode, Series } from '../api/types'
import { getAccessToken } from '../api/client'
import { Comments } from '../components/Comments'
import { EmptyState, LoadingBlock } from '../components/EmptyState'
import { HlsPlayer } from '../components/HlsPlayer'
import { useAuth } from '../context/AuthContext'
import { encodeStatusLabel, placeholderPoster } from '../lib/format'
import './Watch.css'

type NetworkInformationLike = {
  effectiveType?: string
  saveData?: boolean
}

function shouldSkipPrefetch(): boolean {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike }
  const c = nav.connection
  if (!c) return false
  if (c.saveData) return true
  const t = c.effectiveType
  return t === '2g' || t === 'slow-2g'
}

function parseStartT(raw: string | null): number {
  if (!raw) return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

export function WatchPage() {
  const { slug = '', ep: epParam = '1' } = useParams()
  const [searchParams] = useSearchParams()
  const epNum = Number(epParam) || 1
  const tParam = parseStartT(searchParams.get('t'))
  const { isAuthenticated } = useAuth()
  const [series, setSeries] = useState<Series | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [startPosition, setStartPosition] = useState(0)
  const lastSaved = useRef(0)
  const lastPos = useRef({ positionSec: 0, durationSec: 0 })
  const episodeRef = useRef<Episode | null>(null)
  const prefetchedNext = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [s, eps, history] = await Promise.all([
        api.seriesBySlug(slug),
        api.episodes(slug),
        isAuthenticated ? api.history() : Promise.resolve([]),
      ])
      if (cancelled) return
      const sorted = eps.sort((a, b) => {
        const sa = a.seasonNumber ?? 1
        const sb = b.seasonNumber ?? 1
        if (sa !== sb) return sa - sb
        return a.number - b.number
      })
      setSeries(s)
      setEpisodes(sorted)
      const current = sorted.find((e) => e.number === epNum)
      if (tParam > 0) {
        setStartPosition(tParam)
      } else if (current && history.length) {
        const hit = history.find((h) => String(h.episodeId) === String(current.id))
        if (hit && hit.positionSec > 5) setStartPosition(hit.positionSec)
        else setStartPosition(0)
      } else {
        setStartPosition(0)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [slug, epNum, isAuthenticated, tParam])

  const episode = useMemo(
    () => episodes.find((e) => e.number === epNum) ?? null,
    [episodes, epNum],
  )
  episodeRef.current = episode

  const prev = episodes.find((e) => e.number === epNum - 1)
  const next = episodes.find((e) => e.number === epNum + 1)

  const streamSrc =
    episode?.playbackUrl ||
    (episode?.statusEncode === 'ready' || episode?.hlsPath
      ? mediaUrl(episode.id)
      : '')

  const flushHistory = useCallback(
    (positionSec: number) => {
      if (!isAuthenticated || !episodeRef.current) return
      const ep = episodeRef.current
      lastSaved.current = Date.now()
      void api.putHistory({ episodeId: ep.id, positionSec: Math.floor(positionSec) })
    },
    [isAuthenticated],
  )

  const onProgress = useCallback(
    (
      positionSec: number,
      durationSec: number,
      meta?: { reason: 'timeupdate' | 'pause' | 'ended' },
    ) => {
      lastPos.current = { positionSec, durationSec }

      // Prefetch next episode master near end (bandwidth-guarded)
      if (
        next &&
        durationSec > 0 &&
        durationSec - positionSec < 60 &&
        !shouldSkipPrefetch() &&
        prefetchedNext.current !== String(next.id)
      ) {
        const nextUrl =
          next.playbackUrl ||
          (next.statusEncode === 'ready' || next.hlsPath ? mediaUrl(next.id) : '')
        if (nextUrl) {
          prefetchedNext.current = String(next.id)
          const link = document.createElement('link')
          link.rel = 'prefetch'
          link.as = 'fetch'
          link.href = nextUrl
          link.crossOrigin = 'anonymous'
          document.head.appendChild(link)
          void fetch(nextUrl, { credentials: 'include' }).catch(() => {
            /* ignore */
          })
        }
      }

      if (!isAuthenticated || !episode) return
      const immediate = meta?.reason === 'pause' || meta?.reason === 'ended'
      const now = Date.now()
      if (!immediate && now - lastSaved.current < 8000) return
      flushHistory(positionSec)
    },
    [isAuthenticated, episode, flushHistory, next],
  )

  // Flush progress on tab close (PUT + keepalive; sendBeacon cannot PUT)
  useEffect(() => {
    if (!isAuthenticated) return
    const persist = () => {
      const pos = lastPos.current.positionSec
      const ep = episodeRef.current
      if (pos <= 0 || !ep) return
      const token = getAccessToken()
      void fetch('/api/me/history', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          episodeId: Number(ep.id),
          positionSec: Math.floor(pos),
        }),
        keepalive: true,
      }).catch(() => {
        /* ignore */
      })
    }
    window.addEventListener('pagehide', persist)
    window.addEventListener('beforeunload', persist)
    return () => {
      window.removeEventListener('pagehide', persist)
      window.removeEventListener('beforeunload', persist)
    }
  }, [isAuthenticated])

  const onPlayStart = useCallback(() => {
    if (!episode) return
    const key = `livestream.viewed.${episode.id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    void api.recordView(episode.id)
  }, [episode])

  // Reset prefetch marker when episode changes
  useEffect(() => {
    prefetchedNext.current = null
    lastPos.current = { positionSec: 0, durationSec: 0 }
  }, [episode?.id])

  if (loading) {
    return (
      <div className="container">
        <LoadingBlock label="Đang tải tập phim..." />
      </div>
    )
  }

  if (!series || !episode) {
    return (
      <div className="container">
        <EmptyState
          title="Không tìm thấy tập"
          message="Tập hoặc series không tồn tại."
          action={
            <Link to="/" className="btn btn-primary">
              Về trang chủ
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container watch fade-up">
      <div className="watch__player-wrap">
        {streamSrc ? (
          <HlsPlayer
            key={`${episode.id}-${startPosition}`}
            src={streamSrc}
            poster={series.posterUrl || placeholderPoster(series.title)}
            startPosition={startPosition}
            episodeId={episode.id}
            subtitles={episode.subtitles ?? []}
            audioTracks={episode.audioTracks ?? []}
            thumbsVttUrl={episode.thumbsVttUrl}
            onProgress={onProgress}
            onPlayStart={onPlayStart}
          />
        ) : (
          <div className="watch__unavailable">
            <p>
              Tập này chưa sẵn sàng phát
              {episode.statusEncode
                ? ` (${encodeStatusLabel(episode.statusEncode)})`
                : ''}
              .
            </p>
            <p>Admin cần upload và chờ encode xong.</p>
          </div>
        )}
      </div>

      <div className="watch__head">
        <div>
          <p className="watch__series">
            <Link to={`/phim/${series.slug}`}>{series.title}</Link>
          </p>
          <h1>
            {series.kind === 'movie'
              ? series.title
              : `Tập ${episode.number}${episode.title ? ` — ${episode.title}` : ''}`}
          </h1>
        </div>
        <div className="watch__nav">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const t = Math.floor(lastPos.current.positionSec || startPosition || 0)
              const url = `${window.location.origin}/xem/${slug}/${epNum}?t=${t}`
              void navigator.clipboard.writeText(url).then(
                () => alert('Đã copy link kèm thời gian'),
                () => prompt('Copy link:', url),
              )
            }}
          >
            Chia sẻ
          </button>
          {prev ? (
            <Link to={`/xem/${slug}/${prev.number}`} className="btn btn-ghost btn-sm">
              ← Tập trước
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled>
              ← Tập trước
            </button>
          )}
          {next ? (
            <Link to={`/xem/${slug}/${next.number}`} className="btn btn-primary btn-sm">
              Tập sau →
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled>
              Tập sau →
            </button>
          )}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Chọn tập</h2>
        <div className="watch__eps">
          {episodes.map((e) => (
            <Link
              key={e.id}
              to={`/xem/${slug}/${e.number}`}
              className={`watch__ep${e.number === epNum ? ' is-active' : ''}`}
            >
              {e.number}
            </Link>
          ))}
        </div>
      </section>

      <Comments episodeId={episode.id} />
    </div>
  )
}
