/**
 * LiveStream preview taxonomy — four distinct domains that share the word "preview"
 * but must NOT be merged into one component (different UX / data / lifecycle).
 *
 * | Kind           | Where                         | What                                      |
 * |----------------|-------------------------------|-------------------------------------------|
 * | hoverCatalog   | PosterCard → HoverPreviewCard | Muted HLS/trailer on poster hover         |
 * | seekScrub      | HlsPlayer scrub bar           | thumbs.vtt sprite while seeking           |
 * | adminFile      | AdminSeries / AdminEpisodes   | Object-URL image/video before upload      |
 * | adminImport    | AdminEpisodes bulk            | Metadata table before batch create+upload |
 */
export type PreviewKind = 'hoverCatalog' | 'seekScrub' | 'adminFile' | 'adminImport'

export const PREVIEW_KINDS: readonly PreviewKind[] = [
  'hoverCatalog',
  'seekScrub',
  'adminFile',
  'adminImport',
] as const
