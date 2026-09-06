import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { SearchBar } from './SearchBar'

export function Layout() {
  return (
    <>
      <div className="site-top">
        <Header />
        <SearchBar />
      </div>
      <main className="page">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container">
          <strong>LiveStream</strong> — Nền tảng xem phim local ·{' '}
          <a href="/gioi-thieu">Giới thiệu</a> · <a href="/lien-he">Liên hệ</a>
        </div>
      </footer>
    </>
  )
}
