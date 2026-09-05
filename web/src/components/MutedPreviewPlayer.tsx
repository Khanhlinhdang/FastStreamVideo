import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

type Props = {
  src: string
  poster?: string
  /** Soft cap on how long the preview plays before freezing on last frame */
  maxSeconds?: number
  className?: string
  onFailed?: () => void
}

/**
 * Lightweight muted HLS preview for poster hover — intentionally separate from HlsPlayer
 * so watch-page ABR/quality/subs/theater stay untouched.
 */
export function MutedPreviewPlayer({
  src,
  poster,
  maxSeconds = 20,
  className,
  onFailed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const onFailedRef = useRef(onFailed)
  onFailedRef.current = onFailed

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let hls: Hls | null = null
    let cancelled = false
    let nativeCleanup: (() => void) | null = null

    const fail = () => {
      if (cancelled) return
      setFailed(true)
      onFailedRef.current?.()
    }

    const tryPlay = () => {
      if (cancelled) return
      video.muted = true
      video.defaultMuted = true
      video.volume = 0
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => fail())
    }

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')

    const onTimeUpdate = () => {
      if (maxSeconds > 0 && video.currentTime >= maxSeconds) {
        video.pause()
      }
    }
    video.addEventListener('timeupdate', onTimeUpdate)

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 8,
        maxMaxBufferLength: 12,
        abrEwmaDefaultEstimate: 500_000,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return
        try {
          if (hls && hls.levels.length > 0) {
            hls.currentLevel = 0
            hls.startLevel = 0
          }
        } catch {
          /* ignore */
        }
        tryPlay()
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || cancelled) return
        try {
          hls?.destroy()
        } catch {
          /* ignore */
        }
        hls = null
        fail()
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const onLoaded = () => tryPlay()
      const onError = () => fail()
      video.src = src
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
      nativeCleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
      }
    } else {
      fail()
    }

    return () => {
      cancelled = true
      video.removeEventListener('timeupdate', onTimeUpdate)
      nativeCleanup?.()
      try {
        video.pause()
      } catch {
        /* ignore */
      }
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        /* ignore */
      }
      if (hls) {
        try {
          hls.destroy()
        } catch {
          /* ignore */
        }
        hls = null
      }
    }
  }, [src, maxSeconds])

  if (failed) return null

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster}
      muted
      playsInline
      autoPlay
      preload="auto"
      controls={false}
      aria-hidden
    />
  )
}
