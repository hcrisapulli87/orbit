import { formatTime, minutesToTime } from '../../domain/day'
import type { CalendarSlice } from '../../data/useCalendarFeeds'

/** "9:00am–9:30am", or "All day". */
export function sliceRange(s: CalendarSlice): string {
  if (s.allDay) return 'All day'
  return `${formatTime(minutesToTime(s.startMin))}–${formatTime(minutesToTime(Math.min(s.endMin, 1439)))}`
}

/**
 * A day's events from connected calendars, as a read-only list.
 *
 * Read-only on purpose: the event belongs to Google or Outlook, and an edit
 * made here would be overwritten on the next read. Changing it means changing
 * it there. Events marked "free" are listed but say so, because they don't
 * count against the day.
 */
export function EventList({ slices }: { slices: CalendarSlice[] }) {
  const sorted = [...slices].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.startMin - b.startMin,
  )
  return (
    <>
      {sorted.map((s) => (
        <div key={s.id} className="blockrow blockrow--static">
          <span className="blockrow__when">{sliceRange(s)}</span>
          <span className="blockrow__what">{s.title || 'Busy'}</span>
          <span className="muted">{s.busy || s.allDay ? s.calendarName : 'free'}</span>
        </div>
      ))}
    </>
  )
}
