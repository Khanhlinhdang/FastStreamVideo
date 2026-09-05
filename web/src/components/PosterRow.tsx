import { Link } from 'react-router-dom'
import type { Series } from '../api/types'
import { PosterCard } from './PosterCard'
import { useCallback, useEffect, useRef, useState } from 'react'
import './PosterRow.css'

type Props = {
  title: string
  items: Series[]
  seeAllTo?: string
  loading?: boolean
}

export function PosterRow({ title, items, seeAllTo, loading }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 8)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [items, updateArrows])

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="poster-row section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {seeAllTo ? (
          <Link to={seeAllTo} className="section-link">
            Xem tất cả →
          </Link>
        ) : null}
      </div>
      <div className="poster-row__wrap">
        {canPrev ? (
          <button
            type="button"
            className="poster-row__chev poster-row__chev--prev"
            aria-label="Cuộn trái"
            onClick={() => scrollByDir(-1)}
          >
            ‹
          </button>
        ) : null}
        <div className="poster-row__scroller" ref={scrollerRef}>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="poster-row__skel skeleton" />
              ))
            : items.map((s) => (
                <div key={s.id} className="poster-row__item">
                  <PosterCard series={s} />
                </div>
              ))}
        </div>
        {canNext ? (
          <button
            type="button"
            className="poster-row__chev poster-row__chev--next"
            aria-label="Cuộn phải"
            onClick={() => scrollByDir(1)}
          >
            ›
          </button>
        ) : null}
      </div>
    </section>
  )
}
