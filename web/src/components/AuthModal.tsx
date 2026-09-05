import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './AuthModal.css'

type Mode = 'login' | 'register'

type Props = {
  open: boolean
  initialMode?: Mode
  onClose: () => void
  onSuccess?: () => void
}

export function AuthModal({ open, initialMode = 'login', onClose, onSuccess }: Props) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError(null)
    }
  }, [open, initialMode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password, displayName.trim())
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác thất bại')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="auth-modal" role="dialog" aria-modal="true">
      <button type="button" className="auth-modal__backdrop" aria-label="Đóng" onClick={onClose} />
      <form className="auth-modal__panel" onSubmit={onSubmit}>
        <div className="auth-modal__tabs">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => setMode('login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => setMode('register')}
          >
            Đăng ký
          </button>
        </div>
        {mode === 'register' && (
          <div className="form-group">
            <label className="label">Tên hiển thị</label>
            <input
              className="input"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        )}
        <div className="form-group">
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label">Mật khẩu</label>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="auth-modal__error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
          Đóng
        </button>
      </form>
    </div>,
    document.body,
  )
}
