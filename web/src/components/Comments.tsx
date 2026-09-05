import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import type { Comment } from '../api/types'
import { formatRelativeTime } from '../lib/format'
import './Comments.css'

type Props = {
  episodeId: string
}

export function Comments({ episodeId }: Props) {
  const { isAuthenticated, user } = useAuth()
  const [items, setItems] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await api.getComments(episodeId)
    setItems(list)
    setLoading(false)
  }, [episodeId])

  useEffect(() => {
    load()
  }, [load])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || !isAuthenticated) return
    setSubmitting(true)
    setError(null)
    try {
      await api.postComment(episodeId, body.trim())
      setBody('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được bình luận')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await api.deleteComment(id)
      setItems((prev) => prev.filter((c) => c.id !== id))
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="comments section">
      <h2 className="section-title">Bình luận</h2>

      {isAuthenticated ? (
        <form className="comments__form" onSubmit={onSubmit}>
          <textarea
            className="textarea"
            placeholder="Viết bình luận..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />
          {error && <p className="comments__error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting || !body.trim()}>
            {submitting ? 'Đang gửi...' : 'Gửi'}
          </button>
        </form>
      ) : (
        <p className="comments__login">
          <Link to="/dang-nhap">Đăng nhập</Link> để bình luận.
        </p>
      )}

      {loading ? (
        <p className="comments__meta">Đang tải bình luận...</p>
      ) : items.length === 0 ? (
        <p className="comments__meta">Chưa có bình luận nào.</p>
      ) : (
        <ul className="comments__list">
          {items.map((c) => {
            const name = c.displayName || c.user?.displayName || 'Người dùng'
            const canDelete = user && (String(user.id) === String(c.userId) || user.role === 'admin')
            return (
              <li key={c.id} className="comments__item">
                <div className="comments__head">
                  <strong>{name}</strong>
                  <span>{formatRelativeTime(c.createdAt)}</span>
                </div>
                <p className="comments__body">{c.body}</p>
                {canDelete && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onDelete(c.id)}
                  >
                    Xóa
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
