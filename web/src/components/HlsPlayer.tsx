import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  EQ_BANDS,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_Q_DEFAULT,
  EQ_Q_MAX,
  EQ_Q_MIN,
  EQ_SPECTRUM_BARS,
  FLAT_GAINS,
  type EqBandId,
  type EqGains,
  type EqPresetId,
  PRESET_OPTIONS,
  VideoEqualizer,
  gainsForPreset,
  isWebAudioSupported,
  readEqState,
  spectrumLevelsFromAnalyser,
  writeEqState,
} from '../lib/audioEqualizer'
import './HlsPlayer.css'

const QUALITY_STORAGE_KEY = 'livestream.hls.quality'

type SubtitleTrack = {
  id?: number | string
  label: string
  lang: string
  url: string
}

type AudioTrackInfo = {
  index: number
  label: string
  lang: string
  uri?: string
}

type ThumbCue = {
  start: number
  end: number
  src: string
  x: number
  y: number
  w: number
  h: number
}

type Props = {
  src: string
  /** Optional failover origins (local + R2) — tried on fatal MEDIA/NETWORK error */
  srcCandidates?: string[]
  poster?: string
  startPosition?: number
  /** When set, rebuffer/error events are POSTed to /api/playback/events */
  episodeId?: string | number
  subtitles?: SubtitleTrack[]
  audioTracks?: AudioTrackInfo[]
  thumbsVttUrl?: string | null
  onProgress?: (
    positionSec: number,
    durationSec: number,
    meta?: { reason: 'timeupdate' | 'pause' | 'ended' },
  ) => void
  onEnded?: () => void
  /** Fired once when playback actually starts (first playing event) */
  onPlayStart?: () => void
  theater?: boolean
  onTheaterChange?: (on: boolean) => void
}

type QualityOption = {
  value: string
  label: string
  levelIndex: number | null
  nativeUrl?: string
}

function levelHeight(level: { height?: number; attrs?: { RESOLUTION?: string } }): number {
  if (level.height && level.height > 0) return level.height
  const res = level.attrs?.RESOLUTION
  if (res) {
    const h = Number(res.split('x')[1])
    if (Number.isFinite(h)) return h
  }
  return 0
}

function labelForHeight(h: number): string {
  if (h >= 2000) return '2160p'
  if (h >= 1400) return '1440p'
  if (h >= 1000) return '1080p'
  if (h >= 700) return '720p'
  if (h >= 450) return '480p'
  if (h >= 300) return '360p'
  return h > 0 ? `${h}p` : 'SD'
}

function readStoredQuality(): string {
  try {
    return localStorage.getItem(QUALITY_STORAGE_KEY) || 'auto'
  } catch {
    return 'auto'
  }
}

function writeStoredQuality(value: string): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}

type NetworkInformationLike = {
  effectiveType?: string
  saveData?: boolean
  downlink?: number
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

function getConnection(): NetworkInformationLike | undefined {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike }
  return nav.connection
}

function isSlowConnection(): boolean {
  const c = getConnection()
  if (!c) return false
  if (c.saveData) return true
  const t = c.effectiveType
  return t === '2g' || t === 'slow-2g' || t === '3g'
}

/** Cap Auto ABR bitrate on weak networks (manual quality still unrestricted). */
function abrMaxBitrateForConnection(): number | undefined {
  const c = getConnection()
  if (!c) return undefined
  if (c.saveData) return 800_000
  const t = c.effectiveType
  if (t === 'slow-2g' || t === '2g') return 600_000
  if (t === '3g') return 1_800_000
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 1.5) return 2_500_000
  return undefined
}

/** Cap Auto level height on save-data / slow nets (manual quality still unrestricted). */
function autoLevelCapHeight(): number | undefined {
  const c = getConnection()
  if (!c) return undefined
  if (c.saveData) return 480
  const t = c.effectiveType
  if (t === 'slow-2g' || t === '2g') return 480
  if (t === '3g') return 720
  return undefined
}

/** Prefer starting near 720p+ so Auto is not stuck on the blurriest rung. */
function pickStartLevel(levels: { height?: number }[]): number {
  if (!levels.length) return -1
  const withH = levels.map((l, i) => ({ i, h: levelHeight(l) }))
  // Slow / save-data networks: start on the lowest rung to avoid first-play stall
  if (isSlowConnection()) {
    const lowest = withH.reduce((a, b) => (b.h < a.h ? b : a), withH[0]!)
    return lowest.i
  }
  const prefer = withH.find((x) => x.h >= 720) ?? withH[withH.length - 1]
  return prefer?.i ?? levels.length - 1
}

function postPlaybackEvent(body: {
  episodeId: number
  type: 'rebuffer' | 'error'
  durationMs?: number
  level?: number
}): void {
  void fetch('/api/playback/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).catch(() => {
    /* ignore telemetry failures */
  })
}

function parseVttTime(raw: string): number {
  const parts = raw.trim().split(':')
  if (parts.length === 3) {
    const [h, m, s] = parts
    return Number(h) * 3600 + Number(m) * 60 + Number(s)
  }
  if (parts.length === 2) {
    const [m, s] = parts
    return Number(m) * 60 + Number(s)
  }
  return Number(raw) || 0
}

async function loadThumbCues(vttUrl: string): Promise<ThumbCue[]> {
  const res = await fetch(vttUrl)
  if (!res.ok) return []
  const text = await res.text()
  const base = new URL(vttUrl, window.location.href)
  const cues: ThumbCue[] = []
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim())
    const payload = lines[lines.indexOf(timeLine) + 1]
    if (!payload) continue
    const m = payload.match(/^(.*?)#xywh=(\d+),(\d+),(\d+),(\d+)$/)
    if (!m) continue
    const srcRel = m[1]!
    cues.push({
      start: parseVttTime(startRaw!),
      end: parseVttTime(endRaw!.split(/\s/)[0]!),
      src: new URL(srcRel, base).toString(),
      x: Number(m[2]),
      y: Number(m[3]),
      w: Number(m[4]),
      h: Number(m[5]),
    })
  }
  return cues
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function HlsPlayer({
  src,
  srcCandidates,
  poster,
  startPosition = 0,
  episodeId,
  subtitles = [],
  audioTracks: audioTracksProp = [],
  thumbsVttUrl,
  onProgress,
  onEnded,
  onPlayStart,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  const candidateIdxRef = useRef(0)
  const [activeSrc, setActiveSrc] = useState(src)
  const [slowBuffer, setSlowBuffer] = useState(false)
  const [rotateHint, setRotateHint] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [levels, setLevels] = useState<QualityOption[]>([])
  const [quality, setQuality] = useState<string>(() => readStoredQuality())
  const [subOn, setSubOn] = useState(true)
  const [subIndex, setSubIndex] = useState(0)
  const [theater, setTheater] = useState(false)
  const [audioIndex, setAudioIndex] = useState(0)
  const [hlsAudioTracks, setHlsAudioTracks] = useState<Array<{ id: number; name: string }>>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [thumbCues, setThumbCues] = useState<ThumbCue[]>([])
  const [hoverPreview, setHoverPreview] = useState<{
    sec: number
    cue: ThumbCue
    leftPct: number
  } | null>(null)
  const [pipSupported] = useState(
    () => typeof document !== 'undefined' && 'pictureInPictureEnabled' in document,
  )
  const [eqSupported] = useState(() => isWebAudioSupported())
  const [eqOpen, setEqOpen] = useState(false)
  const [eqPreset, setEqPreset] = useState<EqPresetId>(() => readEqState().preset)
  const [eqCustom, setEqCustom] = useState<EqGains>(() => readEqState().customGains)
  const [eqMasterDb, setEqMasterDb] = useState(() => readEqState().masterGainDb)
  const [eqPeakingQ, setEqPeakingQ] = useState(() => readEqState().peakingQ)
  const [eqSpectrumOn, setEqSpectrumOn] = useState(() => readEqState().spectrumEnabled)
  const eqRef = useRef<VideoEqualizer | null>(null)
  const eqSpectrumCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const eqSpectrumLevelsRef = useRef(new Float32Array(EQ_SPECTRUM_BARS))
  const eqSpectrumRafRef = useRef(0)
  const nativeVariantsRef = useRef<Array<QualityOption & { nativeUrl?: string }>>([])
  const startedRef = useRef(false)
  const playCountedRef = useRef(false)
  const waitingSinceRef = useRef<number | null>(null)
  const episodeIdNum = episodeId != null ? Number(episodeId) : NaN

  const persistEq = useCallback(
    (next: {
      preset?: EqPresetId
      customGains?: EqGains
      masterGainDb?: number
      peakingQ?: number
      spectrumEnabled?: boolean
    }) => {
      writeEqState({
        preset: next.preset ?? eqPreset,
        customGains: next.customGains ?? eqCustom,
        masterGainDb: next.masterGainDb ?? eqMasterDb,
        peakingQ: next.peakingQ ?? eqPeakingQ,
        spectrumEnabled: next.spectrumEnabled ?? eqSpectrumOn,
      })
    },
    [eqPreset, eqCustom, eqMasterDb, eqPeakingQ, eqSpectrumOn],
  )

  const ensureEq = useCallback(async (): Promise<VideoEqualizer | null> => {
    if (!eqSupported) return null
    const video = videoRef.current
    if (!video) return null
    if (!eqRef.current) eqRef.current = new VideoEqualizer()
    const eq = eqRef.current
    const ok = await eq.ensureStarted(video)
    if (!ok) return null
    eq.setMasterGainDb(eqMasterDb)
    eq.setPeakingQ(eqPeakingQ)
    eq.applyPreset(eqPreset, eqCustom)
    return eq
  }, [eqSupported, eqPreset, eqCustom, eqMasterDb, eqPeakingQ])

  const qualityOptions = useMemo<QualityOption[]>(() => {
    return [{ value: 'auto', label: 'Tự động', levelIndex: null }, ...levels]
  }, [levels])

  const selectableAudio = useMemo(() => {
    if (hlsAudioTracks.length >= 2) {
      return hlsAudioTracks.map((t) => ({
        value: String(t.id),
        label: t.name || `Audio ${t.id + 1}`,
      }))
    }
    if (audioTracksProp.length >= 2) {
      return audioTracksProp.map((t, i) => ({
        value: String(i),
        label: t.label || `Audio ${i + 1}`,
      }))
    }
    return []
  }, [hlsAudioTracks, audioTracksProp])

  useEffect(() => {
    if (!thumbsVttUrl) {
      setThumbCues([])
      return
    }
    let cancelled = false
    void loadThumbCues(thumbsVttUrl).then((cues) => {
      if (!cancelled) setThumbCues(cues)
    })
    return () => {
      cancelled = true
    }
  }, [thumbsVttUrl])

  useEffect(() => {
    setActiveSrc(src)
    candidateIdxRef.current = 0
  }, [src])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 900px)')
    const sync = () => setRotateHint(mq.matches && theater)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [theater])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeSrc) return

    setError(null)
    setReady(false)
    setSlowBuffer(false)
    setLevels([])
    setHlsAudioTracks([])
    setAudioIndex(0)
    startedRef.current = false
    playCountedRef.current = false
    waitingSinceRef.current = null

    let hls: Hls | null = null
    let conn: NetworkInformationLike | undefined
    let onConnChange: (() => void) | undefined
    const stored = readStoredQuality()
    setQuality(stored)

    const tryNextCandidate = () => {
      const list = [src, ...(srcCandidates ?? [])].filter(
        (u, i, arr) => u && arr.indexOf(u) === i,
      )
      const next = candidateIdxRef.current + 1
      if (next < list.length) {
        candidateIdxRef.current = next
        setActiveSrc(list[next]!)
        return true
      }
      return false
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Larger forward buffer (~Netflix-style reservoir) for VOD stall resilience
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        // Slightly conservative default so Auto does not overshoot on weak links
        abrEwmaDefaultEstimate: 1_800_000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        ...(abrMaxBitrateForConnection() != null
          ? { abrMaxBitrate: abrMaxBitrateForConnection() }
          : {}),
      })
      hlsRef.current = hls
      hls.loadSource(activeSrc)
      hls.attachMedia(video)

      onConnChange = () => {
        const instance = hlsRef.current as (Hls & { abrMaxBitrate?: number }) | null
        if (!instance || readStoredQuality() !== 'auto') return
        const cap = abrMaxBitrateForConnection()
        instance.abrMaxBitrate = cap ?? 999_999_999
        const hCap = autoLevelCapHeight()
        if (hCap != null && instance.levels?.length) {
          let maxIdx = -1
          instance.levels.forEach((lvl, i) => {
            if ((lvl.height ?? 0) <= hCap) maxIdx = i
          })
          instance.autoLevelCapping = maxIdx >= 0 ? maxIdx : -1
        } else {
          instance.autoLevelCapping = -1
        }
      }
      conn = getConnection()
      conn?.addEventListener?.('change', onConnChange)
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setReady(true)
        const opts: QualityOption[] = (data.levels ?? []).map((lvl, i) => {
          const h = levelHeight(lvl)
          return {
            value: String(h || i),
            label: labelForHeight(h),
            levelIndex: i,
          }
        })
        // Deduplicate by label keeping highest index (best bitrate for same height)
        const seen = new Map<string, QualityOption>()
        for (const o of opts) {
          const prev = seen.get(o.label)
          if (!prev || (o.levelIndex ?? 0) > (prev.levelIndex ?? 0)) seen.set(o.label, o)
        }
        const unique = Array.from(seen.values())
        setLevels(unique)

        const audios = (hls!.audioTracks ?? []).map((t, i) => ({
          id: i,
          name: t.name || t.lang || `Audio ${i + 1}`,
        }))
        setHlsAudioTracks(audios)
        if (audios.length > 0) {
          hls!.audioTrack = 0
          setAudioIndex(0)
        }

        if (startPosition > 0 && !startedRef.current) {
          video.currentTime = startPosition
          startedRef.current = true
        }

        // Apply quality preference
        if (stored === 'auto') {
          hls!.currentLevel = -1
          hls!.startLevel = pickStartLevel(data.levels ?? [])
          const hCap = autoLevelCapHeight()
          if (hCap != null) {
            let maxIdx = -1
            ;(data.levels ?? []).forEach((lvl, i) => {
              if ((lvl.height ?? 0) <= hCap) maxIdx = i
            })
            hls!.autoLevelCapping = maxIdx >= 0 ? maxIdx : -1
          }
        } else {
          const match = unique.find((o) => o.value === stored || o.label === stored)
          if (match?.levelIndex != null) {
            hls!.currentLevel = match.levelIndex
            hls!.startLevel = match.levelIndex
          } else {
            hls!.currentLevel = -1
            hls!.startLevel = pickStartLevel(data.levels ?? [])
          }
        }
      })
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        const audios = (hls!.audioTracks ?? []).map((t, i) => ({
          id: i,
          name: t.name || t.lang || `Audio ${i + 1}`,
        }))
        setHlsAudioTracks(audios)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        const instance = hlsRef.current
        if (Number.isFinite(episodeIdNum) && episodeIdNum > 0) {
          postPlaybackEvent({
            episodeId: episodeIdNum,
            type: 'error',
            level: instance?.currentLevel,
          })
        }
        if (!instance) {
          if (tryNextCandidate()) return
          setError('Không phát được video. Kiểm tra encode hoặc đường dẫn media.')
          return
        }
        // Try recover before surfacing a hard UI error (segment / media glitches)
        try {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError()
            return
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad()
            return
          }
        } catch {
          /* fall through */
        }
        if (tryNextCandidate()) return
        setError('Không phát được video. Kiểm tra encode hoặc đường dẫn media.')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeSrc
      void loadNativeVariants(activeSrc)
      const onLoaded = () => {
        setReady(true)
        if (startPosition > 0 && !startedRef.current) {
          video.currentTime = startPosition
          startedRef.current = true
        }
      }
      video.addEventListener('loadedmetadata', onLoaded)
      return () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeAttribute('src')
        video.load()
      }
    } else {
      setError('Trình duyệt không hỗ trợ HLS.')
    }

    return () => {
      if (onConnChange) conn?.removeEventListener?.('change', onConnChange)
      if (hls) {
        hls.destroy()
        hlsRef.current = null
      }
    }
  }, [activeSrc, src, srcCandidates, startPosition, episodeIdNum])

  useEffect(() => {
    return () => {
      eqRef.current?.dispose()
      eqRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!eqOpen || !eqSpectrumOn || !eqSupported) {
      if (eqSpectrumRafRef.current) {
        cancelAnimationFrame(eqSpectrumRafRef.current)
        eqSpectrumRafRef.current = 0
      }
      return
    }

    let alive = true
    const levels = eqSpectrumLevelsRef.current

    const draw = () => {
      if (!alive) return
      const canvas = eqSpectrumCanvasRef.current
      const analyser = eqRef.current?.getAnalyser()
      if (canvas && analyser) {
        spectrumLevelsFromAnalyser(analyser, levels)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const cssW = canvas.clientWidth || 280
        const cssH = canvas.clientHeight || 48
        const w = Math.floor(cssW * dpr)
        const h = Math.floor(cssH * dpr)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, w, h)
          const n = levels.length
          const gap = 1.5 * dpr
          const barW = Math.max(1, (w - gap * (n - 1)) / n)
          for (let i = 0; i < n; i++) {
            const v = levels[i]!
            const barH = Math.max(dpr, v * h * 0.92)
            const x = i * (barW + gap)
            const y = h - barH
            const t = i / Math.max(1, n - 1)
            ctx.fillStyle = `rgba(${Math.round(180 + 52 * t)}, ${Math.round(150 - 40 * t)}, ${Math.round(80 + 40 * t)}, ${0.35 + v * 0.65})`
            ctx.fillRect(x, y, barW, barH)
          }
        }
      }
      eqSpectrumRafRef.current = requestAnimationFrame(draw)
    }

    eqSpectrumRafRef.current = requestAnimationFrame(draw)
    return () => {
      alive = false
      if (eqSpectrumRafRef.current) {
        cancelAnimationFrame(eqSpectrumRafRef.current)
        eqSpectrumRafRef.current = 0
      }
    }
  }, [eqOpen, eqSpectrumOn, eqSupported])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTime = () => {
      setCurrentTime(video.currentTime)
      if (Number.isFinite(video.duration)) setDuration(video.duration)
      if (!onProgress || !Number.isFinite(video.duration)) return
      onProgress(video.currentTime, video.duration, { reason: 'timeupdate' })
    }
    const onPauseProgress = () => {
      if (!onProgress || !Number.isFinite(video.duration)) return
      onProgress(video.currentTime, video.duration, { reason: 'pause' })
    }
    const onEnd = () => {
      if (onProgress && Number.isFinite(video.duration)) {
        onProgress(video.currentTime, video.duration, { reason: 'ended' })
      }
      onEnded?.()
    }
    const onPlaying = () => {
      // User gesture / playback start → unlock AudioContext if EQ preset is on
      if (eqSupported && eqPreset !== 'off') {
        void ensureEq()
      }
      if (playCountedRef.current) return
      playCountedRef.current = true
      onPlayStart?.()
    }
    const flushRebuffer = () => {
      const started = waitingSinceRef.current
      if (started == null) return
      waitingSinceRef.current = null
      const durationMs = Date.now() - started
      if (durationMs < 200) return
      if (!Number.isFinite(episodeIdNum) || episodeIdNum <= 0) return
      postPlaybackEvent({
        episodeId: episodeIdNum,
        type: 'rebuffer',
        durationMs,
        level: hlsRef.current?.currentLevel,
      })
    }
    const onWaiting = () => {
      if (waitingSinceRef.current == null) waitingSinceRef.current = Date.now()
      window.setTimeout(() => {
        if (waitingSinceRef.current != null && Date.now() - waitingSinceRef.current >= 8000) {
          setSlowBuffer(true)
        }
      }, 8200)
    }
    const onPlayingOrCanPlay = () => {
      flushRebuffer()
      setSlowBuffer(false)
    }
    const onMeta = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration)
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPauseProgress)
    video.addEventListener('ended', onEnd)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlayingOrCanPlay)
    video.addEventListener('canplay', onPlayingOrCanPlay)
    video.addEventListener('loadedmetadata', onMeta)
    return () => {
      flushRebuffer()
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPauseProgress)
      video.removeEventListener('ended', onEnd)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlayingOrCanPlay)
      video.removeEventListener('canplay', onPlayingOrCanPlay)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [onProgress, onEnded, onPlayStart, episodeIdNum, eqSupported, eqPreset, ensureEq])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Shortcuts when player is on screen (Watch page)
      const root = video.closest('.hls-player')
      if (!root) return
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (video.paused) void video.play()
          else video.pause()
          break
        case 'j':
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case 'l':
          video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10)
          break
        case 'arrowleft':
          video.currentTime = Math.max(0, video.currentTime - 5)
          break
        case 'arrowright':
          video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5)
          break
        case 'f':
          e.preventDefault()
          if (document.fullscreenElement) void document.exitFullscreen()
          else void video.requestFullscreen?.()
          break
        case 't':
          setTheater((v) => !v)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function togglePiP() {
    const video = videoRef.current
    if (!video || !pipSupported) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      /* ignore */
    }
  }

  // ——— Safari / native HLS: parse master for quality variants ———
  async function loadNativeVariants(masterUrl: string) {
    try {
      const res = await fetch(masterUrl)
      const text = await res.text()
      const lines = text.split(/\r?\n/)
      const opts: QualityOption[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/)
        const h = resMatch ? Number(resMatch[1]) : 0
        const uri = lines[i + 1]?.trim()
        if (!uri || uri.startsWith('#')) continue
        const abs = new URL(uri, masterUrl).toString()
        opts.push({
          value: String(h || opts.length),
          label: labelForHeight(h),
          levelIndex: opts.length,
          // stash URL on label via map — use custom field through value encoding
          nativeUrl: abs,
        } as QualityOption & { nativeUrl: string })
      }
      const withUrls = opts as Array<QualityOption & { nativeUrl?: string }>
      nativeVariantsRef.current = withUrls
      setLevels(
        withUrls.map(({ value, label, levelIndex }) => ({ value, label, levelIndex })),
      )
    } catch {
      /* ignore */
    }
  }

  function onQualityChange(value: string) {
    setQuality(value)
    writeStoredQuality(value)
    const hls = hlsRef.current as (Hls & { abrMaxBitrate?: number }) | null
    const video = videoRef.current
    if (hls) {
      if (value === 'auto') {
        hls.currentLevel = -1
        const cap = abrMaxBitrateForConnection()
        hls.abrMaxBitrate = cap ?? 999_999_999
        return
      }
      hls.abrMaxBitrate = 999_999_999
      const opt = qualityOptions.find((o) => o.value === value)
      if (opt?.levelIndex != null) hls.currentLevel = opt.levelIndex
      return
    }
    // Native Safari path: swap variant playlist
    if (!video) return
    if (value === 'auto') {
      video.src = src
      return
    }
    const native = nativeVariantsRef.current.find((o) => o.value === value)
    if (native?.nativeUrl) {
      const t = video.currentTime
      video.src = native.nativeUrl
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = t
          void video.play().catch(() => undefined)
        },
        { once: true },
      )
    }
  }

  function onAudioChange(value: string) {
    const idx = Number(value)
    setAudioIndex(idx)
    const hls = hlsRef.current
    if (hls && hls.audioTracks.length > 0) {
      hls.audioTrack = idx
    }
    // Same <video> element — EQ graph stays connected after track switch
    if (eqSupported && eqPreset !== 'off' && eqRef.current?.active) {
      eqRef.current.applyPreset(eqPreset, eqCustom)
    }
  }

  async function openEqPanel() {
    const next = !eqOpen
    setEqOpen(next)
    if (next) await ensureEq()
  }

  async function onEqPresetChange(preset: EqPresetId) {
    setEqPreset(preset)
    persistEq({ preset })
    const eq = await ensureEq()
    eq?.applyPreset(preset, eqCustom)
  }

  async function onEqBandChange(band: EqBandId, value: number) {
    const base = gainsForPreset(eqPreset, eqCustom)
    const next: EqGains = { ...base, [band]: value }
    setEqCustom(next)
    setEqPreset('custom')
    persistEq({ preset: 'custom', customGains: next })
    const eq = await ensureEq()
    eq?.applyPreset('custom', next)
  }

  async function onEqBandReset(band: EqBandId) {
    await onEqBandChange(band, 0)
  }

  async function onEqMasterChange(db: number) {
    setEqMasterDb(db)
    persistEq({ masterGainDb: db })
    const eq = await ensureEq()
    eq?.setMasterGainDb(db)
  }

  async function onEqQChange(q: number) {
    setEqPeakingQ(q)
    persistEq({ peakingQ: q })
    const eq = await ensureEq()
    eq?.setPeakingQ(q)
  }

  function onEqSpectrumToggle() {
    const next = !eqSpectrumOn
    setEqSpectrumOn(next)
    persistEq({ spectrumEnabled: next })
  }

  async function onEqFlatCustom() {
    const flat = { ...FLAT_GAINS }
    setEqCustom(flat)
    setEqPreset('custom')
    persistEq({ preset: 'custom', customGains: flat })
    const eq = await ensureEq()
    eq?.applyPreset('custom', flat)
  }

  function seekFromClientX(clientX: number) {
    const el = seekRef.current
    const video = videoRef.current
    if (!el || !video || !duration) return
    const rect = el.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    video.currentTime = pct * duration
    setCurrentTime(video.currentTime)
  }

  function onSeekHover(clientX: number) {
    const el = seekRef.current
    if (!el || !duration || thumbCues.length === 0) {
      setHoverPreview(null)
      return
    }
    const rect = el.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const sec = pct * duration
    const cue =
      thumbCues.find((c) => sec >= c.start && sec < c.end) ??
      thumbCues.reduce((a, b) =>
        Math.abs(b.start - sec) < Math.abs(a.start - sec) ? b : a,
      )
    setHoverPreview({ sec, cue, leftPct: pct * 100 })
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const displayGains = gainsForPreset(eqPreset, eqCustom)

  return (
    <div className={`hls-player${theater ? ' hls-player--theater' : ''}`} tabIndex={0}>
      <video
        ref={videoRef}
        className="hls-player__video"
        controls
        playsInline
        crossOrigin="anonymous"
        poster={poster}
        preload="metadata"
      >
        {subtitles.map((t, i) => (
          <track
            key={t.id ?? t.url}
            kind="subtitles"
            src={t.url}
            srcLang={t.lang}
            label={t.label}
            default={subOn && i === subIndex}
          />
        ))}
      </video>

      {slowBuffer ? (
        <div className="hls-player__slow">
          <p>Mạng chậm — đang đệm…</p>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              const v = videoRef.current
              const h = hlsRef.current
              if (h) h.startLoad()
              else if (v) {
                v.load()
                void v.play()
              }
              setSlowBuffer(false)
            }}
          >
            Tải lại nguồn
          </button>
        </div>
      ) : null}

      {rotateHint ? (
        <div className="hls-player__rotate">Xoay ngang để xem theater tốt hơn</div>
      ) : null}

      <div className="hls-player__scrub">
        <div
          ref={seekRef}
          className="hls-player__seek"
          role="slider"
          aria-label="Tua video"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration) || 0}
          aria-valuenow={Math.floor(currentTime)}
          tabIndex={0}
          onClick={(e) => seekFromClientX(e.clientX)}
          onMouseMove={(e) => onSeekHover(e.clientX)}
          onMouseLeave={() => setHoverPreview(null)}
          onKeyDown={(e) => {
            const video = videoRef.current
            if (!video) return
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              video.currentTime = Math.max(0, video.currentTime - 5)
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5)
            }
          }}
        >
          <div className="hls-player__seek-track">
            <div className="hls-player__seek-fill" style={{ width: `${progressPct}%` }} />
          </div>
          {hoverPreview && (
            <div
              className="hls-player__thumb-preview"
              style={{ left: `${hoverPreview.leftPct}%` }}
            >
              <div
                className="hls-player__thumb-sprite"
                style={{
                  width: hoverPreview.cue.w,
                  height: hoverPreview.cue.h,
                  backgroundImage: `url(${hoverPreview.cue.src})`,
                  backgroundPosition: `-${hoverPreview.cue.x}px -${hoverPreview.cue.y}px`,
                }}
              />
              <span>{formatClock(hoverPreview.sec)}</span>
            </div>
          )}
        </div>
        <div className="hls-player__time">
          {formatClock(currentTime)} / {formatClock(duration)}
        </div>
      </div>

      <div className="hls-player__toolbar">
        {levels.length > 0 && (
          <div className="hls-player__quality">
            <label htmlFor="hls-quality">Chất lượng</label>
            <select
              id="hls-quality"
              className="hls-player__quality-select"
              value={
                qualityOptions.some((o) => o.value === quality) ? quality : 'auto'
              }
              onChange={(e) => onQualityChange(e.target.value)}
            >
              {qualityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {selectableAudio.length > 0 && (
          <div className="hls-player__quality">
            <label htmlFor="hls-audio">Âm thanh</label>
            <select
              id="hls-audio"
              className="hls-player__quality-select"
              value={String(audioIndex)}
              onChange={(e) => onAudioChange(e.target.value)}
            >
              {selectableAudio.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {subtitles.length > 0 && (
          <div className="hls-player__quality">
            <label htmlFor="hls-sub">Phụ đề</label>
            <select
              id="hls-sub"
              className="hls-player__quality-select"
              value={subOn ? String(subIndex) : 'off'}
              onChange={(e) => {
                const v = e.target.value
                const vid = videoRef.current
                if (v === 'off') {
                  setSubOn(false)
                  if (vid) {
                    for (let i = 0; i < vid.textTracks.length; i++) {
                      vid.textTracks[i]!.mode = 'disabled'
                    }
                  }
                  return
                }
                const idx = Number(v)
                setSubOn(true)
                setSubIndex(idx)
                if (vid) {
                  for (let i = 0; i < vid.textTracks.length; i++) {
                    vid.textTracks[i]!.mode = i === idx ? 'showing' : 'disabled'
                  }
                }
              }}
            >
              <option value="off">Tắt</option>
              {subtitles.map((t, i) => (
                <option key={t.id ?? t.url} value={String(i)}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="hls-player__chip" onClick={() => setTheater((t) => !t)}>
          {theater ? 'Thoát theater' : 'Theater'}
        </button>
        {pipSupported ? (
          <button type="button" className="hls-player__chip" onClick={() => void togglePiP()}>
            PiP
          </button>
        ) : null}
        {eqSupported ? (
          <button
            type="button"
            className={`hls-player__chip${eqOpen || eqPreset !== 'off' ? ' hls-player__chip--active' : ''}`}
            onClick={() => void openEqPanel()}
            aria-expanded={eqOpen}
            aria-controls="hls-eq-panel"
          >
            Equalizer
          </button>
        ) : (
          <span className="hls-player__eq-unsupported" title="Trình duyệt không hỗ trợ Web Audio API">
            EQ không hỗ trợ
          </span>
        )}
      </div>

      {eqSupported && eqOpen && (
        <div id="hls-eq-panel" className="hls-player__eq" role="dialog" aria-label="Âm thanh / Equalizer">
          <div className="hls-player__eq-head">
            <strong>Âm thanh / Equalizer</strong>
            <div className="hls-player__eq-head-actions">
              <button
                type="button"
                className={`hls-player__eq-tool${eqSpectrumOn ? ' is-active' : ''}`}
                onClick={onEqSpectrumToggle}
                aria-pressed={eqSpectrumOn}
                title="Spectrum"
              >
                Spectrum
              </button>
              <button type="button" className="hls-player__eq-close" onClick={() => setEqOpen(false)}>
                Đóng
              </button>
            </div>
          </div>

          {eqSpectrumOn ? (
            <canvas
              ref={eqSpectrumCanvasRef}
              className="hls-player__eq-spectrum"
              width={280}
              height={48}
              aria-hidden="true"
            />
          ) : null}

          <div className="hls-player__eq-presets" role="group" aria-label="Preset EQ">
            {PRESET_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`hls-player__eq-preset${eqPreset === p.id ? ' is-active' : ''}`}
                onClick={() => void onEqPresetChange(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={`hls-player__eq-graphic${eqPreset === 'off' ? ' is-disabled' : ''}`}>
            {EQ_BANDS.map((b) => {
              const value = displayGains[b.id]
              return (
                <label
                  key={b.id}
                  className="hls-player__eq-fader"
                  title={`${b.label}: ${value > 0 ? `+${value}` : value} dB — double-click để về 0`}
                >
                  <em aria-hidden="true">{value > 0 ? `+${value}` : value}</em>
                  <input
                    type="range"
                    min={EQ_GAIN_MIN}
                    max={EQ_GAIN_MAX}
                    step={0.5}
                    value={value}
                    disabled={eqPreset === 'off'}
                    aria-label={b.label}
                    onChange={(e) => void onEqBandChange(b.id, Number(e.target.value))}
                    onDoubleClick={() => {
                      if (eqPreset !== 'off') void onEqBandReset(b.id)
                    }}
                  />
                  <span>{b.shortLabel}</span>
                </label>
              )
            })}
          </div>

          <div className="hls-player__eq-controls">
            <label className="hls-player__eq-row">
              <span>Preamp</span>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={eqMasterDb}
                onChange={(e) => void onEqMasterChange(Number(e.target.value))}
              />
              <em>{eqMasterDb > 0 ? `+${eqMasterDb}` : eqMasterDb} dB</em>
            </label>
            <label className={`hls-player__eq-row${eqPreset === 'off' ? ' is-disabled' : ''}`}>
              <span>Q</span>
              <input
                type="range"
                min={EQ_Q_MIN}
                max={EQ_Q_MAX}
                step={0.1}
                value={eqPeakingQ}
                disabled={eqPreset === 'off'}
                onChange={(e) => void onEqQChange(Number(e.target.value))}
                title="Độ hẹp peaking bands"
              />
              <em>{eqPeakingQ.toFixed(1)}</em>
            </label>
          </div>

          <div className="hls-player__eq-footer">
            <button
              type="button"
              className="hls-player__eq-tool"
              disabled={eqPreset === 'off'}
              onClick={() => void onEqFlatCustom()}
            >
              Flat custom
            </button>
            <button
              type="button"
              className="hls-player__eq-tool"
              disabled={eqPreset === 'off'}
              onClick={() => void onEqQChange(EQ_Q_DEFAULT)}
              title="Reset Q"
            >
              Q mặc định
            </button>
          </div>

          <p className="hls-player__eq-note">
            10-band stereo EQ trên thiết bị của bạn — không thay thế Atmos/LFE rạp chiếu. Double-click
            fader để về 0 dB.
          </p>
        </div>
      )}

      {!ready && !error && <div className="hls-player__loading">Đang tải stream...</div>}
      {error && <div className="hls-player__error">{error}</div>}
    </div>
  )
}
