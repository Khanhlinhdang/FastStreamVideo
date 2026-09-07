/** Persist subtitle / audio / quality choices across episodes. */

const QUALITY_KEY = 'livestream.hls.quality'
const SUB_KEY = 'livestream.hls.subtitle'
const AUDIO_KEY = 'livestream.hls.audio'

export type SubtitlePref = { mode: 'off' } | { mode: 'on'; lang?: string; index?: number }

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function readQualityPref(): string {
  return safeGet(QUALITY_KEY) || 'auto'
}

export function writeQualityPref(value: string): void {
  safeSet(QUALITY_KEY, value)
}

export function readSubtitlePref(): SubtitlePref {
  const raw = safeGet(SUB_KEY)
  if (!raw || raw === 'off') return { mode: 'off' }
  try {
    const parsed = JSON.parse(raw) as SubtitlePref
    if (parsed && (parsed.mode === 'off' || parsed.mode === 'on')) return parsed
  } catch {
    /* legacy: bare lang string */
    if (raw !== 'on') return { mode: 'on', lang: raw }
  }
  return { mode: 'on' }
}

export function writeSubtitlePref(pref: SubtitlePref): void {
  safeSet(SUB_KEY, JSON.stringify(pref))
}

export function readAudioPref(): { lang?: string; index?: number } {
  const raw = safeGet(AUDIO_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as { lang?: string; index?: number }
  } catch {
    return { lang: raw }
  }
}

export function writeAudioPref(pref: { lang?: string; index?: number }): void {
  safeSet(AUDIO_KEY, JSON.stringify(pref))
}
