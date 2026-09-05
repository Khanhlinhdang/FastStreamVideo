import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { HomeResponse, ScheduleItem, Series } from '../api/types'
import { BillboardHero } from '../components/BillboardHero'
import { ContinueWatching } from '../components/ContinueWatching'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'
import { PosterRow } from '../components/PosterRow'
import { RankingList } from '../components/RankingList'
import { ScheduleTabs } from '../components/ScheduleTabs'
import { useAuth } from '../context/AuthContext'
import { todayWeekday } from '../lib/format'
import './Home.css'

export function HomePage() {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<HomeResponse | null>(null)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [personalized, setPersonalized] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState(todayWeekday())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [home, fullSchedule, personal] = await Promise.all([
        api.home(),
        api.schedule(),
        isAuthenticated ? api.personalized() : Promise.resolve([]),
      ])
      if (!cancelled) {
        setData(home)
        setSchedule(
          fullSchedule.length > 0 ? fullSchedule : (home.scheduleToday ?? []),
        )
        setPersonalized(personal)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const hot = data?.hot ?? []
  const latest = data?.latest ?? []
  const ranking = data?.ranking ?? []
  const continueWatching = data?.continueWatching ?? []
  const catalog = latest.length > 0 ? latest : hot

  return (
    <div className="container home">
      <section className="home-intro fade-up">
        <p className="home-intro__eyebrow">Giới thiệu</p>
        <h1 className="home-intro__title">LiveStream</h1>
        <p className="home-intro__copy">
          Nền tảng xem phim/series tự host — catalog demo, lịch chiếu và phát HLS local.
        </p>
        <div className="home-intro__actions">
          <Link to="/gioi-thieu" className="btn btn-ghost btn-sm">
            Giới thiệu
          </Link>
          <Link to="/lien-he" className="btn btn-primary btn-sm">
            Liên hệ
          </Link>
        </div>
      </section>

      {(hot.length > 0 || loading) && (
        <BillboardHero items={hot} loading={loading && !data} />
      )}

      {continueWatching.length > 0 && <ContinueWatching items={continueWatching} />}

      {personalized.length > 0 && (
        <PosterRow title="Vì bạn đã xem" items={personalized} />
      )}

      <section className="section home-catalog">
        <div className="section-head">
          <h2 className="section-title">
            {latest.length > 0 ? 'Mới cập nhật' : 'Đang hot'}
          </h2>
          <Link
            to={latest.length > 0 ? '/moi-cap-nhat' : '/top'}
            className="section-link"
          >
            Xem tất cả →
          </Link>
        </div>
        {loading && !catalog.length ? (
          <PosterGridSkeleton count={20} />
        ) : catalog.length === 0 ? (
          <EmptyState
            title="Chưa có phim"
            message="API /api/home chưa trả về dữ liệu."
          />
        ) : (
          <div className="poster-grid">
            {catalog.map((s) => (
              <PosterCard key={s.id} series={s} />
            ))}
          </div>
        )}
      </section>

      {hot.length > 0 && latest.length > 0 && (
        <section className="section home-catalog">
          <div className="section-head">
            <h2 className="section-title">Đang hot</h2>
            <Link to="/top" className="section-link">
              Xem tất cả →
            </Link>
          </div>
          <div className="poster-grid">
            {hot.map((s) => (
              <PosterCard key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Khám phá nhanh</h2>
        </div>
        <div className="home-presets">
          <Link className="chip" to="/tim-kiem?kind=movie">
            Phim lẻ
          </Link>
          <Link className="chip" to="/tim-kiem?kind=series">
            Phim bộ
          </Link>
          <Link className="chip" to="/kham-pha/anime">
            Anime
          </Link>
          <Link className="chip" to="/kham-pha/k-drama">
            K-Drama
          </Link>
          <Link className="chip" to="/kham-pha/c-drama">
            C-Drama
          </Link>
        </div>
      </section>

      <div className="home-secondary">
        <RankingList items={ranking} />
        <ScheduleTabs items={schedule} activeDay={day} onDayChange={setDay} />
      </div>
    </div>
  )
}
