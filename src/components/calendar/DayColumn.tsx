import { layoutTimedItems } from '../../domain/calendarGrid'
import { formatTime, parseTimeToMinutes } from '../../domain/day'
import { defaultEstimateFor } from '../../domain/planner'
import type { Task } from '../../data/types'

export const HOUR_PX = 56

export interface TimedEntry {
  id: string
  title: string
  startMin: number
  endMin: number
  /** A placed block reads differently from a task that merely has a time. */
  kind: 'task' | 'block'
}

/** Tasks with a time of day become entries; the rest belong in the all-day row. */
export function timedEntriesFor(tasks: Task[]): TimedEntry[] {
  return tasks.flatMap((t) => {
    const startMin = parseTimeToMinutes(t.due_time)
    if (startMin === null) return []
    return [{
      id: t.id,
      title: t.title,
      startMin,
      // No duration is stored on a task, so the planner's default estimate is
      // what gives it a height. It's an approximation and looks like one.
      endMin: startMin + Math.max(15, defaultEstimateFor(t)),
      kind: 'task' as const,
    }]
  })
}

/**
 * One day's hour grid. Shared by the day and week views so they can't drift
 * apart — the week is seven of these side by side.
 */
export function DayColumn({
  entries,
  dayStartMin,
  dayEndMin,
  onSlotTap,
}: {
  entries: TimedEntry[]
  dayStartMin: number
  dayEndMin: number
  onSlotTap?: (startMin: number) => void
}) {
  const hours = Math.max(1, Math.ceil((dayEndMin - dayStartMin) / 60))
  const layout = new Map(
    layoutTimedItems(entries.map((e) => ({ id: e.id, start: e.startMin, end: e.endMin })))
      .map((l) => [l.id, l]),
  )

  return (
    <div className="daycol" style={{ height: hours * HOUR_PX }}>
      {Array.from({ length: hours }, (_, i) => (
        <button
          key={i}
          className="daycol__slot"
          style={{ top: i * HOUR_PX, height: HOUR_PX }}
          onClick={() => onSlotTap?.(dayStartMin + i * 60)}
          aria-label={`${formatTime(minutesToTime(dayStartMin + i * 60))} slot`}
          disabled={!onSlotTap}
        />
      ))}

      {entries.map((e) => {
        const l = layout.get(e.id)
        const top = ((e.startMin - dayStartMin) / 60) * HOUR_PX
        const height = Math.max(18, ((e.endMin - e.startMin) / 60) * HOUR_PX - 2)
        const width = 100 / (l?.columns ?? 1)
        return (
          <div
            key={e.id}
            className={`daycol__item daycol__item--${e.kind}`}
            style={{ top, height, left: `${(l?.column ?? 0) * width}%`, width: `${width}%` }}
            title={e.title}
          >
            <span className="daycol__time">{formatTime(minutesToTime(e.startMin))}</span>{' '}
            {e.title}
          </div>
        )
      })}
    </div>
  )
}

export const minutesToTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
