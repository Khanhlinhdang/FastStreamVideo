import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import './StaticPages.css'

export function AboutPage() {
  return (
    <div className="container static-page fade-up">
      <h1 className="page-title">Giới thiệu</h1>
      <p>
        <strong>LiveStream</strong> là nền tảng xem phim/series tự host với phát HLS ABR,
        phụ đề, đa audio và equalizer — không phụ thuộc embed nguồn bên thứ ba không kiểm soát.
      </p>
      <p>
        Catalog do admin quản lý: upload, encode, lịch chiếu, bình luận và đánh giá nội bộ.
      </p>
      <p>
        <Link to="/lien-he" className="btn btn-primary">
          Liên hệ
        </Link>
      </p>
    </div>
  )
}

export function ContactPage() {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '')
    const email = String(fd.get('email') || '')
    const message = String(fd.get('message') || '')
    const body = encodeURIComponent(`Từ: ${name} <${email}>\n\n${message}`)
    window.location.href = `mailto:support@livestream.local?subject=${encodeURIComponent('Liên hệ LiveStream')}&body=${body}`
  }

  return (
    <div className="container static-page fade-up">
      <h1 className="page-title">Liên hệ</h1>
      <p className="text-muted">Gửi phản hồi — mở client email của bạn (không lưu secret trên server).</p>
      <form className="static-form" onSubmit={onSubmit}>
        <label className="form-group">
          <span className="label">Họ tên</span>
          <input className="input" name="name" required />
        </label>
        <label className="form-group">
          <span className="label">Email</span>
          <input className="input" type="email" name="email" required />
        </label>
        <label className="form-group">
          <span className="label">Nội dung</span>
          <textarea className="textarea" name="message" required />
        </label>
        <button type="submit" className="btn btn-primary">
          Gửi
        </button>
      </form>
    </div>
  )
}
