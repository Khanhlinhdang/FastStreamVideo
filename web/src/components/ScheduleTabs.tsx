import { Link } from 'react-router-dom'
import type { ScheduleItem, Series } from '../api/types'
import { WEEKDAYS, todayWeekday } from '../lib/format'
import { placeholderPoster } from '../lib/format'
import './ScheduleTabs.css'

type Props = {
  items: ScheduleItem[]
  activeDay?: number
  onDayChange?: (day: number) => void
  showAllLink?: boolean
}

function seriesFromItem(item: ScheduleItem): Series | null {
  return item.series ?? null
}

export function ScheduleTabs({
  items,
  activeDay: controlledDay,
  onDayChange,
  showAllLink = true,
}: Props) {
  const day = controlledDay ?? todayWeekday()
  const filtered = items.filter((i) => i.weekday === day)

  return (
    <div className="schedule-tabs">
      <div className="section-head">
        <h2 className="section-title">Lịch chiếu</h2>
        {showAllLink && (
          <Link to="/lich-chieu" className="section-link">
            Xem tất cả
          </Link>
        )}
      </div>
      <div className="schedule-tabs__days" role="tablist">
        {WEEKDAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="tab"
            aria-selected={day === d.value}
            className={`schedule-tabs__day${day === d.value ? ' is-active' : ''}`}
            onClick={() => onDayChange?.(d.value)}
          >
            <span className="schedule-tabs__short">{d.short}</span>
            <span className="schedule-tabs__label">{d.label}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="schedule-tabs__empty">Không có lịch chiếu ngày này.</p>
      ) : (
        <div className="schedule-tabs__grid">
          {filtered.map((item) => {
            const s = seriesFromItem(item)
            if (!s) {
              return (
                <div key={item.id} className="schedule-tabs__card">
                  <div className="schedule-tabs__poster skeleton" />
                  <div>
                    <p className="schedule-tabs__note">{item.note || 'Series'}</p>
                  </div>
                </div>
              )
            }
            return (
              <Link key={item.id} to={`/phim/${s.slug}`} className="schedule-tabs__card">
                <img
                  className="schedule-tabs__poster"
                  src={s.posterUrl || placeholderPoster(s.title)}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = placeholderPoster(s.title)
                  }}
                />
                <div>
                  <h3 className="schedule-tabs__title">{s.title}</h3>
                  {item.note && <p className="schedule-tabs__note">{item.note}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
