/**
 * Prefetch HLS master + first media segment so watch/hover start faster.
 * Best-effort — never throws to callers.
 */

const prefetched = new Set<string>()

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href
  } catch {
    if (relative.startsWith('/')) return relative
    const dir = base.replace(/[^/]+$/, '')
    return `${dir}${relative}`
  }
}

function firstPlaylistUri(masterText: string): string | null {
  for (const line of masterText.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    return t
  }
  return null
}

function firstSegmentUri(mediaText: string): string | null {
  for (const line of mediaText.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    return t
  }
  return null
}

/** Fetch master.m3u8, then first variant playlist, then first .m4s / .ts segment. */
export async function prefetchHlsWarm(masterUrl: string): Promise<void> {
  if (!masterUrl || prefetched.has(masterUrl)) return
  prefetched.add(masterUrl)
  try {
    const masterRes = await fetch(masterUrl, { credentials: 'include', mode: 'cors' })
    if (!masterRes.ok) return
    const masterText = await masterRes.text()
    const playlistRel = firstPlaylistUri(masterText)
    if (!playlistRel) return
    const playlistUrl = resolveUrl(masterUrl, playlistRel)
    // Master that is already a media playlist (single-variant)
    const looksLikeMaster = /#EXT-X-STREAM-INF/i.test(masterText)
    let mediaText = masterText
    let mediaBase = masterUrl
    if (looksLikeMaster) {
      const plRes = await fetch(playlistUrl, { credentials: 'include', mode: 'cors' })
      if (!plRes.ok) return
      mediaText = await plRes.text()
      mediaBase = playlistUrl
    }
    const segRel = firstSegmentUri(mediaText)
    if (!segRel) return
    const segUrl = resolveUrl(mediaBase, segRel)
    // Also warm init segment if referenced
    const initMatch = mediaText.match(/URI="([^"]+)"/)
    if (initMatch?.[1]) {
      void fetch(resolveUrl(mediaBase, initMatch[1]), {
        credentials: 'include',
        mode: 'cors',
      }).catch(() => undefined)
    }
    await fetch(segUrl, { credentials: 'include', mode: 'cors' }).catch(() => undefined)
  } catch {
    prefetched.delete(masterUrl)
  }
}

export function shouldSkipHeavyPrefetch(): boolean {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }
  const c = nav.connection
  if (!c) return false
  if (c.saveData) return true
  return c.effectiveType === '2g' || c.effectiveType === 'slow-2g'
}
