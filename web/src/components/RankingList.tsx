import { Link } from 'react-router-dom'
import type { Series } from '../api/types'
import { formatViews } from '../lib/format'
import './RankingList.css'

type Props = {
  items: Series[]
  title?: string
  linkTo?: string
}

export function RankingList({ items, title = 'Bảng xếp hạng', linkTo = '/top' }: Props) {
  if (!items.length) {
    return (
      <aside className="ranking">
        <div className="section-head">
          <h2 className="section-title">{title}</h2>
        </div>
        <p className="ranking__empty">Chưa có dữ liệu xếp hạng.</p>
      </aside>
    )
  }

  return (
    <aside className="ranking">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <Link to={linkTo} className="section-link">
          Xem thêm
        </Link>
      </div>
      <ol className="ranking__list">
        {items.slice(0, 10).map((s, i) => (
          <li key={s.id} className="ranking__item">
            <span className={`ranking__rank${i < 3 ? ' ranking__rank--top' : ''}`}>
              {i + 1}
            </span>
            <Link to={`/phim/${s.slug}`} className="ranking__link">
              <span className="ranking__title">{s.title}</span>
              <span className="ranking__meta">{formatViews(s.viewCount)} lượt xem</span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  )
}
