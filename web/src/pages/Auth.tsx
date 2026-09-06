import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to={redirect} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(redirect)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Đăng nhập thất bại. Kiểm tra email/mật khẩu.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container auth-page">
      <form className="auth-card fade-up" onSubmit={onSubmit}>
        <h1>Đăng nhập</h1>
        <p className="auth-card__sub">Chào mừng trở lại LiveStream</p>
        <div className="form-group">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="password">
            Mật khẩu
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="auth-card__error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        <p className="auth-card__footer">
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
          {' · '}
          Chưa có tài khoản? <Link to="/dang-ky">Đăng ký</Link>
        </p>
      </form>
    </div>
  )
}

export function RegisterPage() {
  const { register, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register(email.trim(), password, displayName.trim())
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng ký thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container auth-page">
      <form className="auth-card fade-up" onSubmit={onSubmit}>
        <h1>Đăng ký</h1>
        <p className="auth-card__sub">Tạo tài khoản LiveStream</p>
        <div className="form-group">
          <label className="label" htmlFor="displayName">
            Tên hiển thị
          </label>
          <input
            id="displayName"
            className="input"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="reg-email">
            Email
          </label>
          <input
            id="reg-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="reg-password">
            Mật khẩu
          </label>
          <input
            id="reg-password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="auth-card__error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Đang tạo...' : 'Tạo tài khoản'}
        </button>
        <p className="auth-card__footer">
          Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link>
        </p>
      </form>
    </div>
  )
}
