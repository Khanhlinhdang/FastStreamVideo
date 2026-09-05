import type { ReactNode } from 'react'

type Props = {
  title?: string
  message?: string
  action?: ReactNode
}

export function EmptyState({
  title = 'Trống',
  message = 'Chưa có nội dung để hiển thị.',
  action,
}: Props) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
      {action ? <div style={{ marginTop: '1rem' }}>{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Đã xảy ra lỗi',
  message = 'Không tải được dữ liệu. Thử lại sau.',
}: {
  title?: string
  message?: string
}) {
  return (
    <div className="error-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  )
}

export function LoadingBlock({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="loading-block">
      <div
        className="skeleton"
        style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 1rem' }}
      />
      <p>{label}</p>
    </div>
  )
}

export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="poster-card">
          <div className="poster-card__media skeleton" />
          <div className="skeleton" style={{ height: 14, width: '70%', marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}
