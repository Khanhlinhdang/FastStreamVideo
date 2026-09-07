import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LoadingBlock } from '../../components/EmptyState'
import './Admin.css'

const NAV = [
  { to: '/admin', end: true, label: 'Tổng quan', adminOnly: false },
  { to: '/admin/wizard', end: false, label: 'Wizard', adminOnly: false },
  { to: '/admin/series', end: false, label: 'Series', adminOnly: false },
  { to: '/admin/episodes', end: false, label: 'Episodes', adminOnly: false },
  { to: '/admin/comments', end: false, label: 'Bình luận', adminOnly: false },
  { to: '/admin/schedule', end: false, label: 'Lịch chiếu', adminOnly: false },
  { to: '/admin/genres', end: false, label: 'Thể loại', adminOnly: false },
]

export function AdminLayout() {
  const { isAuthenticated, isAdmin, isFullAdmin, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="container">
        <LoadingBlock />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?redirect=/admin" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  const nav = NAV.filter((item) => !item.adminOnly || isFullAdmin)

  return (
    <div className="container admin">
      <div className="admin__head">
        <h1 className="page-title">
          {isFullAdmin ? 'Bảng điều khiển Admin' : 'Bảng điều khiển Editor'}
        </h1>
        <p className="admin__subtitle">
          {isFullAdmin
            ? 'Quản lý catalog, upload encode HLS, lịch chiếu, bảo mật — LiveStream'
            : 'Quản lý nội dung (series/tập/phụ đề/bình luận) — không đổi cài đặt bảo mật'}
          {user?.email ? ` · ${user.email}` : ''}
        </p>
        <nav className="admin__nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
