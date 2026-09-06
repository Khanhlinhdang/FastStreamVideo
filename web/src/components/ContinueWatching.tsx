import { Link } from 'react-router-dom'
import type { WatchHistoryItem } from '../api/types'
import { placeholderPoster } from '../lib/format'
import './ContinueWatching.css'

type Props = {
  items: WatchHistoryItem[]
}

export function ContinueWatching({ items }: Props) {
  if (!items.length) return null

  return (
    <section className="section continue-watching">
      <div className="section-head">
        <h2 className="section-title">Tiếp tục xem</h2>
        <Link to="/lich-su" className="section-link">
          Lịch sử
        </Link>
      </div>
      <div className="continue-watching__row">
        {items.map((item) => {
          const slug = item.seriesSlug
          const title = item.seriesTitle || 'Phim'
          const progress =
            item.durationSec && item.durationSec > 0
              ? Math.min(100, (item.positionSec / item.durationSec) * 100)
              : 0
          const to = slug
            ? `/xem/${slug}/${item.episodeNumber}`
            : '/lich-su'

          return (
            <Link key={`${item.episodeId}-${item.updatedAt}`} to={to} className="continue-card">
              <div className="continue-card__media">
                <img
                  src={item.posterUrl || placeholderPoster(title)}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = placeholderPoster(title)
                  }}
                />
                <div className="continue-card__bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <h3 className="continue-card__title">{title}</h3>
              <p className="continue-card__meta">Tập {item.episodeNumber}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
