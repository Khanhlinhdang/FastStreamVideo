import { api, mediaUrl } from '../api'
import type { Episode, Series } from '../api/types'
import type { HoverPreviewMeta } from '../components/HoverPreviewCard'

type CacheEntry = {
  meta: HoverPreviewMeta
  at: number
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<HoverPreviewMeta>>()

function pickLatestReady(episodes: Episode[]): Episode | null {
  const ready = episodes.filter((e) => e.statusEncode === 'ready')
  if (ready.length === 0) return null
  ready.sort((a, b) => {
    const sa = a.seasonNumber ?? 1
    const sb = b.seasonNumber ?? 1
    if (sa !== sb) return sb - sa
    return b.number - a.number
  })
  return ready[0] ?? null
}

function isYouTube(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')
  } catch {
    return false
  }
}

function toMeta(ep: Episode | null, trailerUrl?: string | null): HoverPreviewMeta {
  if (trailerUrl && !isYouTube(trailerUrl)) {
    return {
      previewUrl: trailerUrl,
      episodeNumber: null,
      qualityLabel: undefined,
      audioLabel: undefined,
      trailerUrl,
      isTrailer: true,
    }
  }
  if (trailerUrl && isYouTube(trailerUrl)) {
    return {
      previewUrl: null,
      episodeNumber: null,
      trailerUrl,
      isTrailer: true,
    }
  }
  if (!ep) {
    return { previewUrl: null, episodeNumber: null }
  }
  const url = ep.playbackUrl || mediaUrl(ep.id)
  return {
    previewUrl: url,
    episodeNumber: ep.number,
    qualityLabel: ep.qualityLabel,
    audioLabel: ep.audioLabel,
  }
}

/** Resolve muted preview — prefers admin trailerUrl, else latest ready HLS. */
export async function resolveHoverPreviewMeta(slug: string): Promise<HoverPreviewMeta> {
  const cached = cache.get(slug)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.meta
  }

  const pending = inflight.get(slug)
  if (pending) return pending

  const task = (async () => {
    try {
      const [detail, episodes] = await Promise.all([
        api.seriesBySlug(slug) as Promise<Series | null>,
        api.episodes(slug),
      ])
      const meta = toMeta(pickLatestReady(episodes), detail?.trailerUrl)
      cache.set(slug, { meta, at: Date.now() })
      return meta
    } catch {
      const fallback: HoverPreviewMeta = { previewUrl: null, episodeNumber: null }
      cache.set(slug, { meta: fallback, at: Date.now() })
      return fallback
    } finally {
      inflight.delete(slug)
    }
  })()

  inflight.set(slug, task)
  return task
}

export function invalidateHoverPreviewCache(slug?: string): void {
  if (slug) cache.delete(slug)
  else cache.clear()
}
