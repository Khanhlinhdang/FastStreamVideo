export type ParseConfidence = 'high' | 'medium' | 'low'

export type ParsedEpisodeFilename = {
  number: number | null
  season: number | null
  title: string
  confidence: ParseConfidence
  rawStem: string
}

const YEAR_RE = /^(19|20)\d{2}$/

function cleanTitle(raw: string): string {
  return raw
    .replace(/[._\-–—]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s[\(]+|[\s]\)]+$/g, '')
    .trim()
}

function stripEpisodeTokens(stem: string): string {
  return stem
    .replace(/\b[sS]\d{1,2}\s*[eE]\d{1,3}\b/g, ' ')
    .replace(/\b(?:ep|episode|e|tập|tap)\s*[.\-_ ]?\s*\d{1,3}\b/gi, ' ')
    .replace(/[\[\(]\s*\d{1,3}\s*[\]\)]/g, ' ')
    .replace(/(?:^|[\s._\-])\d{1,3}(?=[\s._\-]|$)/g, ' ')
    .replace(/\b\d{3,4}p\b/gi, ' ')
    .replace(/\b(?:1080|720|480|2160|4k|bluray|webrip|web-dl|x264|x265|hevc|aac|hdtv)\b/gi, ' ')
}

/**
 * Parse episode number + clean title from a video filename.
 * Prefer SxxEyy / EPnn / "12 - Title"; avoid mistaking years (2024) for episode numbers.
 */
export function parseEpisodeFilename(
  filename: string,
  fallbackNumber = 1,
): ParsedEpisodeFilename {
  const rawStem = filename.replace(/\.[^.]+$/, '')
  let number: number | null = null
  let season: number | null = null
  let confidence: ParseConfidence = 'low'

  const sxe = rawStem.match(/\b[sS](\d{1,2})\s*[eE](\d{1,3})\b/)
  if (sxe) {
    season = Number(sxe[1])
    number = Number(sxe[2])
    confidence = 'high'
  }

  if (number == null) {
    const ep = rawStem.match(/\b(?:ep|episode|e|tập|tap)\s*[.\-_ ]?\s*(\d{1,3})\b/i)
    if (ep) {
      number = Number(ep[1])
      confidence = 'high'
    }
  }

  if (number == null) {
    const bracket = rawStem.match(/[\[\(]\s*(\d{1,3})\s*[\]\)]/)
    if (bracket && !YEAR_RE.test(bracket[1])) {
      number = Number(bracket[1])
      confidence = 'medium'
    }
  }

  if (number == null) {
    const leading = rawStem.match(/^(\d{1,3})\s*[-_.\s]+(.+)$/)
    if (leading && !YEAR_RE.test(leading[1])) {
      number = Number(leading[1])
      confidence = 'medium'
    }
  }

  if (number == null) {
    const trailing = rawStem.match(/[-_\s]+(\d{1,3})$/)
    if (trailing && !YEAR_RE.test(trailing[1])) {
      number = Number(trailing[1])
      confidence = 'medium'
    }
  }

  if (number == null) {
    const nums = [...rawStem.matchAll(/(?<![A-Za-z])(\d{1,4})(?![A-Za-z])/g)].map((m) => m[1])
    const candidates = nums.filter((n) => !YEAR_RE.test(n) && Number(n) >= 1 && Number(n) <= 999)
    if (candidates.length === 1) {
      number = Number(candidates[0])
      confidence = 'low'
    } else if (candidates.length > 1) {
      // Prefer small episode-like numbers over resolutions (1080, 720)
      const epLike = candidates.find((n) => Number(n) <= 200 && !['1080', '720', '480', '2160'].includes(n))
      if (epLike) {
        number = Number(epLike)
        confidence = 'low'
      }
    }
  }

  let title = cleanTitle(stripEpisodeTokens(rawStem))
  if (!title || title.length < 2) {
    title = number != null ? `Tập ${number}` : cleanTitle(rawStem) || `Tập ${fallbackNumber}`
  }

  return {
    number,
    season,
    title,
    confidence,
    rawStem,
  }
}

/** Assign unique episode numbers for a batch; fill gaps when parse fails. */
export function assignEpisodeNumbers(
  files: File[],
  usedNumbers: Set<number>,
  startFallback = 1,
): Array<{
  file: File
  number: number
  title: string
  confidence: ParseConfidence
  conflict: boolean
  autoAssigned: boolean
}> {
  const occupied = new Set(usedNumbers)
  let fallback = startFallback
  while (occupied.has(fallback)) fallback += 1

  return files.map((file) => {
    const parsed = parseEpisodeFilename(file.name, fallback)
    let number = parsed.number
    let autoAssigned = false
    let conflict = false

    if (number == null || number < 1) {
      number = fallback
      autoAssigned = true
    } else if (occupied.has(number)) {
      conflict = true
      number = fallback
      autoAssigned = true
    }

    occupied.add(number)
    while (occupied.has(fallback)) fallback += 1

    return {
      file,
      number,
      title: parsed.title,
      confidence: parsed.confidence,
      conflict,
      autoAssigned,
    }
  })
}
