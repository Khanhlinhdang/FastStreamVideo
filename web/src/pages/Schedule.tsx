import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ScheduleItem } from '../api/types'
import { EmptyState, LoadingBlock } from '../components/EmptyState'
import { ScheduleTabs } from '../components/ScheduleTabs'
import { todayWeekday } from '../lib/format'

export function SchedulePage() {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState(todayWeekday())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await api.schedule()
      if (!cancelled) {
        setItems(data)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="container">
      <h1 className="page-title">Lịch chiếu</h1>
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có lịch chiếu"
          message="Admin có thể thêm lịch trong trang quản trị."
        />
      ) : (
        <ScheduleTabs
          items={items}
          activeDay={day}
          onDayChange={setDay}
          showAllLink={false}
        />
      )}
    </div>
  )
}
