import { useObjectUrl } from '../../hooks/useObjectUrl'

type Props = {
  file: File | null | undefined
  /** Optional caption under the media */
  caption?: string | null
  className?: string
  /** Max CSS size hint for image preview */
  imageMaxWidth?: number
  imageMaxHeight?: number
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Admin file preview (`adminFile` kind) — image or video via object URL.
 */
export function AdminFilePreview({
  file,
  caption,
  className,
  imageMaxWidth = 180,
  imageMaxHeight = 260,
}: Props) {
  const url = useObjectUrl(file ?? null)
  if (!file || !url) return null

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  return (
    <div className={`admin-file-preview${className ? ` ${className}` : ''}`}>
      {isImage ? (
        <img
          src={url}
          alt={file.name}
          className="admin-file-preview__media admin-file-preview__media--image"
          style={{ maxWidth: imageMaxWidth, maxHeight: imageMaxHeight }}
        />
      ) : isVideo ? (
        <video
          src={url}
          className="admin-file-preview__media admin-file-preview__media--video"
          muted
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="admin-file-preview__fallback">
          <strong>{file.name}</strong>
          <span>{formatBytes(file.size)}</span>
        </div>
      )}
      <p className="admin-file-preview__meta">
        {caption ?? (
          <>
            {file.name} · {formatBytes(file.size)}
          </>
        )}
      </p>
    </div>
  )
}
