import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { HomePage } from './pages/Home'
import { SchedulePage } from './pages/Schedule'
import { LatestPage } from './pages/Latest'
import { TopPage } from './pages/Top'
import { CompletedPage } from './pages/Completed'
import { GenrePage } from './pages/Genre'
import { SearchPage } from './pages/Search'
import { SeriesDetailPage } from './pages/SeriesDetail'
import { WatchPage } from './pages/Watch'
import { LoginPage, RegisterPage } from './pages/Auth'
import { FavoritesPage, HistoryPage } from './pages/Library'
import { NotFoundPage } from './pages/NotFound'
import { AboutPage, ContactPage } from './pages/StaticPages'
import {
  ExplorePresetPage,
  PersonPage,
  ResetPasswordPage,
} from './pages/ExplorePages'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboardPage } from './pages/admin/AdminDashboard'
import { AdminSeriesPage } from './pages/admin/AdminSeries'
import { AdminEpisodesPage } from './pages/admin/AdminEpisodes'
import { AdminSchedulePage } from './pages/admin/AdminSchedule'
import { AdminGenresPage } from './pages/admin/AdminGenres'
import { AdminCommentsPage } from './pages/admin/AdminComments'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="lich-chieu" element={<SchedulePage />} />
            <Route path="moi-cap-nhat" element={<LatestPage />} />
            <Route path="top" element={<TopPage />} />
            <Route path="hoan-thanh" element={<CompletedPage />} />
            <Route path="the-loai/:slug" element={<GenrePage />} />
            <Route path="kham-pha/:preset" element={<ExplorePresetPage />} />
            <Route path="dien-vien/:personSlug" element={<PersonPage />} />
            <Route path="tim-kiem" element={<SearchPage />} />
            <Route path="phim/:slug" element={<SeriesDetailPage />} />
            <Route path="xem/:slug/:ep" element={<WatchPage />} />
            <Route path="dang-nhap" element={<LoginPage />} />
            <Route path="dang-ky" element={<RegisterPage />} />
            <Route path="quen-mat-khau" element={<ResetPasswordPage />} />
            <Route path="gioi-thieu" element={<AboutPage />} />
            <Route path="lien-he" element={<ContactPage />} />
            <Route path="yeu-thich" element={<FavoritesPage />} />
            <Route path="lich-su" element={<HistoryPage />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="series" element={<AdminSeriesPage />} />
              <Route path="episodes" element={<AdminEpisodesPage />} />
              <Route path="schedule" element={<AdminSchedulePage />} />
              <Route path="genres" element={<AdminGenresPage />} />
              <Route path="comments" element={<AdminCommentsPage />} />
            </Route>
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
