/** In-player audio EQ via Web Audio API (BiquadFilterNode chain on <video>). */

export type EqPresetId = 'off' | 'cinema' | 'bass' | 'voice' | 'custom'

/** 10-band graphic EQ (octave-ish), inspired by ReEQ band spacing — reimplemented. */
export type EqBandId =
  | 'b31'
  | 'b62'
  | 'b125'
  | 'b250'
  | 'b500'
  | 'b1k'
  | 'b2k'
  | 'b4k'
  | 'b8k'
  | 'b16k'

export type EqGains = Record<EqBandId, number>

export type EqBandDef = {
  id: EqBandId
  label: string
  shortLabel: string
  type: BiquadFilterType
  frequency: number
  Q?: number
}

export const EQ_STORAGE_KEY = 'livestream.audio.eq'
export const EQ_GAIN_MIN = -12
export const EQ_GAIN_MAX = 12
export const EQ_Q_MIN = 0.5
export const EQ_Q_MAX = 4
export const EQ_Q_DEFAULT = 1.0
export const EQ_SPECTRUM_BARS = 32

export const EQ_BANDS: EqBandDef[] = [
  { id: 'b31', label: '31 Hz', shortLabel: '31', type: 'lowshelf', frequency: 31 },
  { id: 'b62', label: '62 Hz', shortLabel: '62', type: 'peaking', frequency: 62, Q: 1.0 },
  { id: 'b125', label: '125 Hz', shortLabel: '125', type: 'peaking', frequency: 125, Q: 1.0 },
  { id: 'b250', label: '250 Hz', shortLabel: '250', type: 'peaking', frequency: 250, Q: 1.0 },
  { id: 'b500', label: '500 Hz', shortLabel: '500', type: 'peaking', frequency: 500, Q: 1.0 },
  { id: 'b1k', label: '1 kHz', shortLabel: '1k', type: 'peaking', frequency: 1000, Q: 1.0 },
  { id: 'b2k', label: '2 kHz', shortLabel: '2k', type: 'peaking', frequency: 2000, Q: 1.0 },
  { id: 'b4k', label: '4 kHz', shortLabel: '4k', type: 'peaking', frequency: 4000, Q: 1.0 },
  { id: 'b8k', label: '8 kHz', shortLabel: '8k', type: 'peaking', frequency: 8000, Q: 1.0 },
  { id: 'b16k', label: '16 kHz', shortLabel: '16k', type: 'highshelf', frequency: 16000 },
]

export const FLAT_GAINS: EqGains = {
  b31: 0,
  b62: 0,
  b125: 0,
  b250: 0,
  b500: 0,
  b1k: 0,
  b2k: 0,
  b4k: 0,
  b8k: 0,
  b16k: 0,
}

/** Cinema / bass / voice curves tuned for 10 bands (not Atmos/LFE). */
export const PRESET_GAINS: Record<Exclude<EqPresetId, 'custom' | 'off'>, EqGains> = {
  cinema: {
    b31: 3.5,
    b62: 5,
    b125: 3,
    b250: 1,
    b500: 0.5,
    b1k: 0.5,
    b2k: 1.5,
    b4k: 2.5,
    b8k: 1.5,
    b16k: 0.5,
  },
  bass: {
    b31: 7,
    b62: 9,
    b125: 6,
    b250: 3,
    b500: 0.5,
    b1k: 0,
    b2k: -0.5,
    b4k: -1,
    b8k: -1.5,
    b16k: -2,
  },
  voice: {
    b31: -4,
    b62: -3.5,
    b125: -2,
    b250: -1,
    b500: 1,
    b1k: 3,
    b2k: 4,
    b4k: 3.5,
    b8k: 1.5,
    b16k: 0.5,
  },
}

export const PRESET_OPTIONS: Array<{ id: EqPresetId; label: string }> = [
  { id: 'off', label: 'Tắt' },
  { id: 'cinema', label: 'Rạp chiếu' },
  { id: 'bass', label: 'Bass mạnh' },
  { id: 'voice', label: 'Thoại rõ' },
  { id: 'custom', label: 'Custom' },
]

export type EqPersistedState = {
  preset: EqPresetId
  customGains: EqGains
  /** Extra output trim in dB (−6…+6). Soft limiter sits after this. */
  masterGainDb: number
  /** Global Q for peaking bands (shelves keep fixed Q). */
  peakingQ: number
  /** Show AnalyserNode spectrum bars while panel is open. */
  spectrumEnabled: boolean
}

const DEFAULT_STATE: EqPersistedState = {
  preset: 'off',
  customGains: { ...FLAT_GAINS },
  masterGainDb: 0,
  peakingQ: EQ_Q_DEFAULT,
  spectrumEnabled: true,
}

/** Legacy 5-band keys → approximate 10-band mapping. */
const LEGACY_BAND_MAP: Record<string, EqBandId[]> = {
  bass: ['b62', 'b125'],
  lowMid: ['b250'],
  mid: ['b1k'],
  highMid: ['b4k'],
  treble: ['b8k', 'b16k'],
}

function clampGain(db: number): number {
  return Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, db))
}

function clampMaster(db: number): number {
  return Math.min(6, Math.max(-6, db))
}

function clampQ(q: number): number {
  return Math.min(EQ_Q_MAX, Math.max(EQ_Q_MIN, q))
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

function normalizeGains(raw: unknown): EqGains {
  const out: EqGains = { ...FLAT_GAINS }
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>

  // New 10-band shape
  let hasNew = false
  for (const b of EQ_BANDS) {
    if (b.id in obj) {
      hasNew = true
      out[b.id] = clampGain(Number(obj[b.id]) || 0)
    }
  }
  if (hasNew) return out

  // Migrate legacy 5-band
  for (const [legacy, targets] of Object.entries(LEGACY_BAND_MAP)) {
    if (!(legacy in obj)) continue
    const v = clampGain(Number(obj[legacy]) || 0)
    for (const id of targets) out[id] = v
  }
  return out
}

export function isWebAudioSupported(): boolean {
  if (typeof window === 'undefined') return false
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return typeof AC === 'function'
}

export function readEqState(): EqPersistedState {
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE, customGains: { ...FLAT_GAINS } }
    const parsed = JSON.parse(raw) as Partial<EqPersistedState> & { customGains?: unknown }
    const customGains = normalizeGains(parsed.customGains)
    const preset = PRESET_OPTIONS.some((p) => p.id === parsed.preset)
      ? (parsed.preset as EqPresetId)
      : 'off'
    return {
      preset,
      customGains,
      masterGainDb: clampMaster(Number(parsed.masterGainDb) || 0),
      peakingQ: clampQ(Number(parsed.peakingQ) || EQ_Q_DEFAULT),
      spectrumEnabled: parsed.spectrumEnabled !== false,
    }
  } catch {
    return { ...DEFAULT_STATE, customGains: { ...FLAT_GAINS } }
  }
}

export function writeEqState(state: EqPersistedState): void {
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}

export function gainsForPreset(preset: EqPresetId, custom: EqGains): EqGains {
  if (preset === 'off') return { ...FLAT_GAINS }
  if (preset === 'custom') return { ...custom }
  return { ...PRESET_GAINS[preset] }
}

/** Map AnalyserNode bins into EQ_SPECTRUM_BARS levels 0…1 (log-ish frequency groups). */
export function spectrumLevelsFromAnalyser(analyser: AnalyserNode, out: Float32Array): void {
  const bins = analyser.frequencyBinCount
  const data = new Uint8Array(bins)
  analyser.getByteFrequencyData(data)
  const barCount = out.length
  for (let i = 0; i < barCount; i++) {
    const t0 = i / barCount
    const t1 = (i + 1) / barCount
    // Log-ish span so bass/mid get more weight than linear Nyquist slice
    const start = Math.floor(Math.pow(t0, 1.6) * bins)
    const end = Math.max(start + 1, Math.floor(Math.pow(t1, 1.6) * bins))
    let sum = 0
    for (let j = start; j < end && j < bins; j++) sum += data[j]!
    out[i] = sum / ((end - start) * 255)
  }
}

type SharedMediaGraph = {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
}

/**
 * createMediaElementSource may only be called once per element.
 * Keep the binding for the lifetime of the <video> (survives React Strict Mode).
 */
const mediaGraphs = new WeakMap<HTMLVideoElement, SharedMediaGraph>()

function getOrCreateMediaGraph(video: HTMLVideoElement): SharedMediaGraph | null {
  const existing = mediaGraphs.get(video)
  if (existing) return existing

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  try {
    const source = ctx.createMediaElementSource(video)
    const graph = { ctx, source }
    mediaGraphs.set(video, graph)
    return graph
  } catch (err) {
    void ctx.close().catch(() => undefined)
    console.warn('[EQ] createMediaElementSource failed:', err)
    return null
  }
}

/**
 * Owns filter/limiter/master/analyser for one player instance.
 * Graph: source → [filters] → softLimiter → masterGain → destination
 *         masterGain → analyser (tap for spectrum)
 * Bypass (Tắt): source → masterGain → destination (+ analyser tap)
 *
 * HTMLMediaElement.volume / muted still affect MediaElementSource output.
 * hls.js audioTrack switches keep using the same <video> → EQ stays applied.
 */
export class VideoEqualizer {
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private filters: BiquadFilterNode[] = []
  private limiter: DynamicsCompressorNode | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private bypass = true
  private currentGains: EqGains = { ...FLAT_GAINS }
  private masterGainDb = 0
  private peakingQ = EQ_Q_DEFAULT
  private built = false

  get active(): boolean {
    return this.built && this.source != null
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  /** Call from a user gesture (play / unmute / open EQ). Idempotent. */
  async ensureStarted(video: HTMLVideoElement): Promise<boolean> {
    if (!isWebAudioSupported()) return false

    const shared = getOrCreateMediaGraph(video)
    if (!shared) return false

    this.ctx = shared.ctx
    this.source = shared.source

    if (!this.built) {
      const { ctx } = shared
      this.filters = EQ_BANDS.map((def) => {
        const f = ctx.createBiquadFilter()
        f.type = def.type
        f.frequency.value = def.frequency
        if (def.Q != null) f.Q.value = this.peakingQ
        f.gain.value = 0
        return f
      })

      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -6
      limiter.knee.value = 12
      limiter.ratio.value = 4
      limiter.attack.value = 0.003
      limiter.release.value = 0.25
      this.limiter = limiter

      const master = ctx.createGain()
      master.gain.value = dbToLinear(this.masterGainDb)
      this.master = master

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.7
      analyser.minDecibels = -90
      analyser.maxDecibels = -10
      this.analyser = analyser

      this.built = true
      this.wireGraph()
      this.applyGains(this.currentGains)
      this.applyPeakingQ(this.peakingQ)
    }

    if (shared.ctx.state === 'suspended') {
      try {
        await shared.ctx.resume()
      } catch {
        return false
      }
    }
    return true
  }

  setBypass(bypass: boolean): void {
    if (this.bypass === bypass && this.built) return
    this.bypass = bypass
    this.wireGraph()
  }

  setGains(gains: EqGains): void {
    const next = { ...FLAT_GAINS }
    for (const b of EQ_BANDS) next[b.id] = clampGain(gains[b.id] ?? 0)
    this.currentGains = next
    this.applyGains(this.currentGains)
  }

  setMasterGainDb(db: number): void {
    this.masterGainDb = clampMaster(db)
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(dbToLinear(this.masterGainDb), this.ctx.currentTime, 0.02)
    }
  }

  setPeakingQ(q: number): void {
    this.peakingQ = clampQ(q)
    this.applyPeakingQ(this.peakingQ)
  }

  /** Apply preset (including off → bypass). */
  applyPreset(preset: EqPresetId, custom: EqGains): void {
    if (preset === 'off') {
      this.setBypass(true)
      this.setGains(FLAT_GAINS)
      return
    }
    this.setBypass(false)
    this.setGains(gainsForPreset(preset, custom))
  }

  /**
   * Disconnect this instance's nodes. Does not close AudioContext / MediaElementSource
   * so the same <video> can be re-bound after Strict Mode remount.
   */
  dispose(): void {
    try {
      this.source?.disconnect()
      for (const f of this.filters) f.disconnect()
      this.limiter?.disconnect()
      this.master?.disconnect()
      this.analyser?.disconnect()
    } catch {
      /* already disconnected */
    }
    // Reconnect shared source straight to destination so playback keeps audio
    // if another EQ instance has not taken over yet.
    if (this.source && this.ctx) {
      try {
        this.source.connect(this.ctx.destination)
      } catch {
        /* ignore */
      }
    }
    this.filters = []
    this.limiter = null
    this.master = null
    this.analyser = null
    this.source = null
    this.ctx = null
    this.built = false
  }

  private wireGraph(): void {
    if (!this.source || !this.master || !this.ctx) return
    try {
      this.source.disconnect()
      for (const f of this.filters) f.disconnect()
      this.limiter?.disconnect()
      this.master.disconnect()
      this.analyser?.disconnect()
    } catch {
      /* ignore */
    }

    if (this.bypass || this.filters.length === 0) {
      this.source.connect(this.master)
    } else {
      let node: AudioNode = this.source
      for (const f of this.filters) {
        node.connect(f)
        node = f
      }
      if (this.limiter) {
        node.connect(this.limiter)
        this.limiter.connect(this.master)
      } else {
        node.connect(this.master)
      }
    }

    this.master.connect(this.ctx.destination)
    if (this.analyser) this.master.connect(this.analyser)
  }

  private applyGains(gains: EqGains): void {
    const t = this.ctx?.currentTime ?? 0
    for (let i = 0; i < this.filters.length; i++) {
      const band = EQ_BANDS[i]!
      const filter = this.filters[i]!
      filter.gain.setTargetAtTime(gains[band.id], t, 0.015)
    }
  }

  private applyPeakingQ(q: number): void {
    for (let i = 0; i < this.filters.length; i++) {
      const band = EQ_BANDS[i]!
      if (band.type !== 'peaking') continue
      this.filters[i]!.Q.value = q
    }
  }
}
