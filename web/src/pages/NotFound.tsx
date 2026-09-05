import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="container empty-state">
      <h1>404</h1>
      <h3>Không tìm thấy trang</h3>
      <p>Đường dẫn không tồn tại trên LiveStream.</p>
      <div style={{ marginTop: '1rem' }}>
        <Link to="/" className="btn btn-primary">
          Về trang chủ
        </Link>
      </div>
    </div>
  )
}
