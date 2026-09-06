import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Series } from '../api/types'
import { EmptyState, PosterGridSkeleton } from '../components/EmptyState'
import { PosterCard } from '../components/PosterCard'

const PRESET_LABELS: Record<string, string> = {
  anime: 'Anime',
  'k-drama': 'K-Drama',
  kdrama: 'K-Drama',
  'c-drama': 'C-Drama',
  cdrama: 'C-Drama',
}

export function ExplorePresetPage() {
  const { preset = '' } = useParams()
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const list = await api.seriesList({ preset, limit: 48 })
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preset])

  return (
    <div className="container">
      <h1 className="page-title">{PRESET_LABELS[preset] || preset}</h1>
      {loading ? (
        <PosterGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title="Trống" message="Chưa có phim khớp preset này." />
      ) : (
        <div className="poster-grid">
          {items.map((s) => (
            <PosterCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  )
}

export function PersonPage() {
  const { personSlug = '' } = useParams()
  const [name, setName] = useState(personSlug)
  const [items, setItems] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await api.person(personSlug)
      if (!cancelled) {
        if (!data) {
          setMissing(true)
          setItems([])
        } else {
          setMissing(false)
          setName(data.name)
          setItems(data.items)
        }
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [personSlug])

  if (!loading && missing) {
    return (
      <div className="container">
        <EmptyState
          title="Không tìm thấy diễn viên"
          message="Slug không khớp cast nào trong catalog."
          action={
            <Link to="/" className="btn btn-primary">
              Về trang chủ
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container">
      <h1 className="page-title">{name}</h1>
      {loading ? (
        <PosterGridSkeleton />
      ) : (
        <div className="poster-grid">
          {items.map((s) => (
            <PosterCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState(params.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function requestReset(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const res = await api.forgotPassword(email)
      setMsg(
        res.devToken
          ? `Token (dev): ${res.devToken}`
          : 'Nếu email tồn tại, hướng dẫn đặt lại đã được tạo.',
      )
      if (res.devToken) setToken(res.devToken)
    } catch {
      setErr('Không gửi được yêu cầu.')
    }
  }

  async function doReset(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      await api.resetPassword(token, password)
      setMsg('Đã đổi mật khẩu. Bạn có thể đăng nhập.')
    } catch {
      setErr('Token không hợp lệ hoặc đã hết hạn.')
    }
  }

  return (
    <div className="container static-page fade-up">
      <h1 className="page-title">Đặt lại mật khẩu</h1>
      {msg ? <p className="badge badge-teal" style={{ marginBottom: 12 }}>{msg}</p> : null}
      {err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null}
      <form onSubmit={requestReset} className="static-form">
        <label className="form-group">
          <span className="label">Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn-ghost">
          Gửi yêu cầu
        </button>
      </form>
      <form onSubmit={doReset} className="static-form">
        <label className="form-group">
          <span className="label">Token</span>
          <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
        </label>
        <label className="form-group">
          <span className="label">Mật khẩu mới</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Đổi mật khẩu
        </button>
      </form>
    </div>
  )
}
