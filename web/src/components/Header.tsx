import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import type { Genre } from '../api/types'
import './Header.css'

const NAV = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/lich-chieu', label: 'Lịch chiếu' },
  { to: '/moi-cap-nhat', label: 'Mới cập nhật' },
  { to: '/top', label: 'Top' },
  { to: '/hoan-thanh', label: 'Đã hoàn thành' },
]

export function Header() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [genres, setGenres] = useState<Genre[]>([])
  const [genreOpen, setGenreOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  useEffect(() => {
    api.genres().then(setGenres)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  async function onLogout() {
    await logout()
    setUserOpen(false)
    navigate('/')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="header__brand" onClick={closeMenu}>
          <span className="header__logo" aria-hidden>
            LS
          </span>
          <span className="header__name">LiveStream</span>
        </Link>

        <button
          type="button"
          className="header__theme"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
          title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <button
          type="button"
          className="header__burger"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        {menuOpen ? (
          <button
            type="button"
            className="header__backdrop"
            aria-label="Đóng menu"
            onClick={closeMenu}
          />
        ) : null}

        <nav className={`header__nav${menuOpen ? ' is-open' : ''}`}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `header__link${isActive ? ' is-active' : ''}`
              }
              onClick={closeMenu}
            >
              {item.label}
            </NavLink>
          ))}

          <div
            className="header__dropdown"
            onMouseEnter={() => setGenreOpen(true)}
            onMouseLeave={() => setGenreOpen(false)}
          >
            <button
              type="button"
              className="header__link header__link--btn"
              aria-expanded={genreOpen}
              onClick={() => setGenreOpen((v) => !v)}
            >
              Thể loại ▾
            </button>
            {genreOpen && (
              <div className="header__menu">
                {genres.length === 0 ? (
                  <span className="header__menu-empty">Chưa có thể loại</span>
                ) : (
                  genres.map((g) => (
                    <Link
                      key={g.id}
                      to={`/the-loai/${g.slug}`}
                      className="header__menu-item"
                      onClick={() => {
                        setGenreOpen(false)
                        closeMenu()
                      }}
                    >
                      {g.name}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="header__auth">
            {isAuthenticated ? (
              <div className="header__dropdown">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setUserOpen((v) => !v)}
                >
                  {user?.displayName || 'Tài khoản'} ▾
                </button>
                {userOpen && (
                  <div className="header__menu header__menu--right">
                    <Link
                      to="/yeu-thich"
                      className="header__menu-item"
                      onClick={() => {
                        setUserOpen(false)
                        closeMenu()
                      }}
                    >
                      Yêu thích
                    </Link>
                    <Link
                      to="/lich-su"
                      className="header__menu-item"
                      onClick={() => {
                        setUserOpen(false)
                        closeMenu()
                      }}
                    >
                      Lịch sử xem
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="header__menu-item"
                        onClick={() => {
                          setUserOpen(false)
                          closeMenu()
                        }}
                      >
                        Admin
                      </Link>
                    )}
                    <button type="button" className="header__menu-item" onClick={onLogout}>
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/dang-nhap" className="btn btn-ghost btn-sm" onClick={closeMenu}>
                  Đăng nhập
                </Link>
                <Link to="/dang-ky" className="btn btn-primary btn-sm" onClick={closeMenu}>
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
