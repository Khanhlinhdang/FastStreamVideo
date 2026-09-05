import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import './SearchBar.css'

export function SearchBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onSearchPage = location.pathname === '/tim-kiem'
  const paramQ = params.get('q') ?? ''
  const [q, setQ] = useState(onSearchPage ? paramQ : '')
  const debounced = useDebounce(q, 350)

  useEffect(() => {
    if (onSearchPage) {
      setQ(paramQ)
    }
  }, [onSearchPage, paramQ])

  useEffect(() => {
    const query = debounced.trim()
    if (!query) return
    if (onSearchPage && paramQ === query) return
    navigate(`/tim-kiem?q=${encodeURIComponent(query)}`, { replace: onSearchPage })
  }, [debounced, navigate, onSearchPage, paramQ])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    navigate(`/tim-kiem?q=${encodeURIComponent(query)}`)
  }

  return (
    <div className="search-bar">
      <form className="container search-bar__form" onSubmit={onSubmit} role="search">
        <input
          className="input search-bar__input"
          type="search"
          placeholder="Tìm phim, series..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm kiếm"
        />
        <button type="submit" className="btn btn-primary btn-sm search-bar__btn">
          Tìm
        </button>
      </form>
    </div>
  )
}
