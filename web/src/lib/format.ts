export const WEEKDAYS = [
  { value: 1, label: 'Thứ 2', short: 'T2' },
  { value: 2, label: 'Thứ 3', short: 'T3' },
  { value: 3, label: 'Thứ 4', short: 'T4' },
  { value: 4, label: 'Thứ 5', short: 'T5' },
  { value: 5, label: 'Thứ 6', short: 'T6' },
  { value: 6, label: 'Thứ 7', short: 'T7' },
  { value: 0, label: 'Chủ nhật', short: 'CN' },
] as const

export function todayWeekday(): number {
  return new Date().getDay()
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

export function statusLabel(status: string): string {
  if (status === 'completed') return 'Hoàn thành'
  if (status === 'ongoing') return 'Đang chiếu'
  return status
}

export function encodeStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Sẵn sàng'
    case 'queued':
      return 'Chờ encode'
    case 'encoding':
      return 'Đang encode'
    case 'failed':
      return 'Lỗi encode'
    case 'pending':
      return 'Chưa upload'
    default:
      return status || '—'
  }
}

export function placeholderPoster(title: string): string {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#1a2332"/><stop offset="1" stop-color="#0d1219"/>
    </linearGradient></defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <text x="200" y="300" text-anchor="middle" fill="#ff6b35" font-family="sans-serif" font-size="64" font-weight="700">${initials || 'LS'}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
