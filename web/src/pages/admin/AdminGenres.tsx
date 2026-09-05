import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { Genre } from '../../api/types'
import { EmptyState, LoadingBlock } from '../../components/EmptyState'

export function AdminGenresPage() {
  const [items, setItems] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const list = await api.adminGenres().catch(() => api.genres())
    setItems(list)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  function slugify(v: string) {
    return v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.adminCreateGenre({
        name: name.trim(),
        slug: slug.trim() || slugify(name),
      })
      setName('')
      setSlug('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo thể loại thất bại')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingBlock />

  return (
    <div>
      <form className="admin-form" onSubmit={onCreate}>
        <h2>Thêm thể loại</h2>
        <div className="form-group">
          <label className="label">Tên</label>
          <input
            className="input"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSlug(slugify(e.target.value))
            }}
          />
        </div>
        <div className="form-group">
          <label className="label">Slug</label>
          <input
            className="input"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Thêm
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="Chưa có thể loại" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Slug</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
