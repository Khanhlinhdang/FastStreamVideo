/** Feature flag: set VITE_HOVER_PREVIEW=0 to disable muted poster previews. */
export function isHoverPreviewEnabled(): boolean {
  try {
    const flag = import.meta.env.VITE_HOVER_PREVIEW
    if (flag === '0' || flag === 'false') return false
  } catch {
    /* ignore */
  }
  return true
}

/** Desktop fine-pointer hover only — touch devices keep tap → detail. */
export function canUseHoverPreview(): boolean {
  if (typeof window === 'undefined') return false
  if (!isHoverPreviewEnabled()) return false
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  } catch {
    return false
  }
}

/** Hover dwell before expand (Netflix-like ~0.4–0.5s). */
export const HOVER_PREVIEW_DELAY_MS = 450

/**
 * Close delay when leaving the preview window.
 * Instant tear-down (0ms); keep ≤16ms if a one-frame defer is ever needed.
 */
export const HOVER_PREVIEW_CLOSE_DELAY_MS = 0

/** Landscape video inside the preview frame uses object-fit: cover (16:9). */
export const HOVER_PREVIEW_ASPECT = 16 / 9

/**
 * Fallback when `.site-top` is missing — matches CSS
 * `--header-h` (64) + `--search-bar-h` (52).
 */
export const HOVER_PREVIEW_TOP_SAFE_FALLBACK_PX = 116

/** @deprecated Use getHoverPreviewTopSafePx() — sticky header alone is not enough. */
export const HOVER_PREVIEW_TOP_SAFE_PX = HOVER_PREVIEW_TOP_SAFE_FALLBACK_PX

export const HOVER_PREVIEW_EDGE_MARGIN_PX = 12

/**
 * Bottom edge of the sticky header+search (`.site-top`) in viewport coords.
 * Preview must sit fully below this (or paint above it via z-index).
 */
export function getHoverPreviewTopSafePx(): number {
  if (typeof document === 'undefined') return HOVER_PREVIEW_TOP_SAFE_FALLBACK_PX
  const el = document.querySelector('.site-top') as HTMLElement | null
  if (el) {
    const bottom = el.getBoundingClientRect().bottom
    if (Number.isFinite(bottom) && bottom > 0) return Math.ceil(bottom)
  }
  return HOVER_PREVIEW_TOP_SAFE_FALLBACK_PX
}

/**
 * Base scales vs poster media size (W×H). Slightly under “full neighbor span”
 * so the card feels compact while still reading as a hover expand.
 */
export type HoverPreviewScales = {
  widthScale: number
  heightScale: number
  /** Hard cap as fraction of viewport width */
  maxVw: number
  /** Hard cap as fraction of viewport height (below sticky header) */
  maxVh: number
}

/** Responsive scales — narrower viewports get a gentler expand. */
export function hoverPreviewScalesForViewport(vw: number): HoverPreviewScales {
  if (vw < 768) {
    return { widthScale: 1.42, heightScale: 1.18, maxVw: 0.72, maxVh: 0.48 }
  }
  if (vw < 1024) {
    return { widthScale: 1.52, heightScale: 1.22, maxVw: 0.48, maxVh: 0.52 }
  }
  if (vw < 1440) {
    return { widthScale: 1.58, heightScale: 1.25, maxVw: 0.36, maxVh: 0.55 }
  }
  return { widthScale: 1.62, heightScale: 1.28, maxVw: 0.32, maxVh: 0.55 }
}

/** @deprecated Prefer hoverPreviewScalesForViewport — kept for callers/tests. */
export const HOVER_PREVIEW_WIDTH_SCALE = 1.58
/** @deprecated Prefer hoverPreviewScalesForViewport */
export const HOVER_PREVIEW_HEIGHT_SCALE = 1.25

export type HoverPreviewTransform = {
  width: number
  height: number
  /** Left offset of the preview frame relative to the wrap (px). */
  offsetX: number
  /** Top offset of the preview frame relative to the wrap (px). */
  offsetY: number
}

/**
 * Size the hover preview from the poster media box and keep it on-screen.
 *
 * 1. Start from responsive scales of media W×H (≈1.4–1.6×W, ≈1.2–1.3×H).
 * 2. Uniformly shrink if needed to fit the area below sticky `.site-top` (header+search).
 * 3. Clamp position so the frame stays fully below `.site-top` and inside the viewport.
 */
export function computeHoverPreviewTransform(
  mediaRect: DOMRect,
  wrapRect: DOMRect,
  viewport?: { width: number; height: number; topSafe?: number },
): HoverPreviewTransform {
  const mediaW = Math.max(1, mediaRect.width)
  const mediaH = Math.max(1, mediaRect.height)
  const vw = viewport?.width ?? window.innerWidth
  const vh = viewport?.height ?? window.innerHeight
  const scales = hoverPreviewScalesForViewport(vw)
  const margin = HOVER_PREVIEW_EDGE_MARGIN_PX
  const topSafe =
    viewport?.topSafe ??
    (typeof document !== 'undefined' ? getHoverPreviewTopSafePx() : HOVER_PREVIEW_TOP_SAFE_FALLBACK_PX)

  let width = mediaW * scales.widthScale
  let height = mediaH * scales.heightScale

  const availH = Math.max(120, vh - topSafe - margin * 2)
  const maxW = Math.min(vw - margin * 2, vw * scales.maxVw)
  const maxH = Math.min(availH, vh * scales.maxVh)
  const fit = Math.min(1, maxW / width, maxH / height)
  width = Math.max(1, width * fit)
  height = Math.max(1, height * fit)

  // Ideal: center on the poster media within the wrap.
  let offsetX = mediaRect.left - wrapRect.left + (mediaW - width) / 2
  let offsetY = mediaRect.top - wrapRect.top + (mediaH - height) / 2

  let viewLeft = wrapRect.left + offsetX
  let viewTop = wrapRect.top + offsetY

  if (viewLeft < margin) {
    offsetX += margin - viewLeft
    viewLeft = margin
  }
  const overflowRight = viewLeft + width - (vw - margin)
  if (overflowRight > 0) {
    offsetX -= overflowRight
    viewLeft -= overflowRight
  }

  // Always keep the full preview below sticky header + search bar.
  const minTop = topSafe + margin
  if (viewTop < minTop) {
    offsetY += minTop - viewTop
    viewTop = minTop
  }
  let overflowBottom = viewTop + height - (vh - margin)
  if (overflowBottom > 0) {
    // Prefer shifting up, but never above minTop — shrink instead.
    const canShiftUp = viewTop - minTop
    const shift = Math.min(overflowBottom, Math.max(0, canShiftUp))
    offsetY -= shift
    viewTop -= shift
    overflowBottom -= shift
    if (overflowBottom > 0) {
      const shrink = height - overflowBottom
      if (shrink > 80) {
        const ratio = shrink / height
        width = Math.max(1, width * ratio)
        height = Math.max(1, shrink)
        // Re-center horizontally on media after shrink
        offsetX = mediaRect.left - wrapRect.left + (mediaW - width) / 2
        viewLeft = wrapRect.left + offsetX
        if (viewLeft < margin) offsetX += margin - viewLeft
        const rightOverflow = wrapRect.left + offsetX + width - (vw - margin)
        if (rightOverflow > 0) offsetX -= rightOverflow
      }
    }
  }

  return { width, height, offsetX, offsetY }
}

/** Only one muted preview session at a time across the grid. */
let activeKey: string | null = null
const closeListeners = new Map<string, () => void>()

export function claimHoverPreview(key: string, onForceClose: () => void): void {
  if (activeKey && activeKey !== key) {
    const prev = closeListeners.get(activeKey)
    prev?.()
    closeListeners.delete(activeKey)
  }
  activeKey = key
  closeListeners.set(key, onForceClose)
}

export function releaseHoverPreview(key: string): void {
  if (activeKey === key) activeKey = null
  closeListeners.delete(key)
}

export function getActiveHoverPreviewKey(): string | null {
  return activeKey
}
