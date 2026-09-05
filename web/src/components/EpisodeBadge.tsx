type Props = {
  episode?: number | string
  quality?: string
  audio?: string
  className?: string
}

export function EpisodeBadge({ episode, quality, audio, className }: Props) {
  return (
    <span className={`episode-badge ${className ?? ''}`.trim()}>
      {episode != null && <span className="badge">Tập {episode}</span>}
      {quality && <span className="badge badge-warn">{quality}</span>}
      {audio && <span className="badge badge-muted">{audio}</span>}
    </span>
  )
}
