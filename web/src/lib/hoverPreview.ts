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
 * Horizontal span vs poster media width W:
 * full center poster + half left neighbor + half right neighbor = 2W.
 */
export const HOVER_PREVIEW_WIDTH_SCALE = 2
/**
 * Vertical span vs poster media height H:
 * H/4 above + H + H/4 below = 1.5H.
 */
export const HOVER_PREVIEW_HEIGHT_SCALE = 1.5
export const HOVER_PREVIEW_EDGE_MARGIN_PX = 12

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
 * Formula (W = media width, H = media height):
 *   width  = 2W   (extends W/2 past each side — half of each neighbor)
 *   height = 1.5H (extends H/4 past top and bottom)
 * Ideal offsets center the frame on the media; edge clamping only shifts
 * position (size stays 2W × 1.5H) when near viewport edges.
 * Video inside stays 16:9 with object-fit: cover.
 */
export function computeHoverPreviewTransform(
  mediaRect: DOMRect,
  wrapRect: DOMRect,
): HoverPreviewTransform {
  const mediaW = Math.max(1, mediaRect.width)
  const mediaH = Math.max(1, mediaRect.height)
  const width = mediaW * HOVER_PREVIEW_WIDTH_SCALE
  const height = mediaH * HOVER_PREVIEW_HEIGHT_SCALE
  const margin = HOVER_PREVIEW_EDGE_MARGIN_PX
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Ideal: center on the poster media within the wrap (±W/2, ±H/4).
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

  if (viewTop < margin) {
    offsetY += margin - viewTop
    viewTop = margin
  }
  const overflowBottom = viewTop + height - (vh - margin)
  if (overflowBottom > 0) {
    offsetY -= overflowBottom
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
