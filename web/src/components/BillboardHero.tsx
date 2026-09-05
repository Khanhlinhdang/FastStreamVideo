import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Series } from '../api/types'
import { placeholderPoster } from '../lib/format'
import './BillboardHero.css'

type Props = {
  items: Series[]
  loading?: boolean
}

const INTERVAL_MS = 6500

export function BillboardHero({ items, loading }: Props) {
  const slides = items.slice(0, 6)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    setActive(0)
  }, [slides.map((s) => s.id).join(',')])

  useEffect(() => {
    if (paused || slides.length < 2) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length)
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [paused, slides.length])

  if (loading) {
    return (
      <section className="billboard billboard--skel" aria-busy="true" aria-label="Đang tải nổi bật">
        <div className="billboard__skel-block skeleton" />
        <div className="billboard__content">
          <div className="skeleton" style={{ height: 14, width: 100, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 40, width: '70%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 40, width: 120, borderRadius: 999 }} />
            <div className="skeleton" style={{ height: 40, width: 100, borderRadius: 999 }} />
          </div>
        </div>
      </section>
    )
  }

  if (!slides.length) return null

  const hero = slides[active] ?? slides[0]
  const isMovie = hero.kind === 'movie'
  const watchTo = isMovie ? `/xem/${hero.slug}/1` : `/phim/${hero.slug}`

  return (
    <section
      className="billboard"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Phim nổi bật"
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`billboard__bg${i === active ? ' is-active' : ''}`}
          style={{ backgroundImage: `url(${s.posterUrl || placeholderPoster(s.title)})` }}
          aria-hidden={i !== active}
        />
      ))}
      <div className="billboard__content fade-up">
        <p className="billboard__eyebrow">LiveStream</p>
        <p className="billboard__kind">{isMovie ? 'Phim lẻ' : 'Phim bộ'}</p>
        <h1 className="billboard__title">{hero.title}</h1>
        {hero.tagline ? <p className="billboard__tagline">{hero.tagline}</p> : null}
        <p className="billboard__synopsis">
          {(hero.synopsis || 'Xem ngay trên LiveStream').slice(0, 180)}
          {hero.synopsis && hero.synopsis.length > 180 ? '…' : ''}
        </p>
        <div className="billboard__actions">
          <Link to={watchTo} className="btn btn-primary">
            {isMovie ? 'Xem phim' : 'Xem ngay'}
          </Link>
          <Link to={`/phim/${hero.slug}`} className="btn btn-ghost">
            Chi tiết
          </Link>
        </div>
        {slides.length > 1 ? (
          <div className="billboard__dots" role="tablist">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`billboard__dot${i === active ? ' is-active' : ''}`}
                onClick={() => setActive(i)}
                aria-label={`Slide ${i + 1}: ${s.title}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
