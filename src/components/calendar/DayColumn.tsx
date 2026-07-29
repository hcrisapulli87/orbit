import { layoutTimedItems } from '../../domain/calendarGrid'
import { formatTime, minutesToTime, parseTimeToMinutes } from '../../domain/day'
import { defaultEstimateFor } from '../../domain/planner'
import { useDragToTime } from './useDragToTime'
import type { Task } from '../../data/types'

export const HOUR_PX = 56

/** Half-hour taps. An hour is too coarse for "block out 9:30". */
const SLOT_MIN = 30

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
 *
 * Entries are buttons when the caller supplies `onOpen`: tap to edit, or hold
 * and drag to move. The two share the element because the hold is what
 * separates them — a tap shorter than the hold never becomes a drag.
 */
export function DayColumn({
  entries,
  dayStartMin,
  dayEndMin,
  onSlotTap,
  onOpen,
  onMove,
}: {
  entries: TimedEntry[]
  dayStartMin: number
  dayEndMin: number
  onSlotTap?: (startMin: number) => void
  onOpen?: (entry: TimedEntry) => void
  onMove?: (entry: TimedEntry, startMin: number) => void
}) {
  const hours = Math.max(1, Math.ceil((dayEndMin - dayStartMin) / 60))
  const slots = hours * (60 / SLOT_MIN)
  const layout = new Map(
    layoutTimedItems(entries.map((e) => ({ id: e.id, start: e.startMin, end: e.endMin })))
      .map((l) => [l.id, l]),
  )

  const { drag, handlers } = useDragToTime((id, deltaMin) => {
    const entry = entries.find((e) => e.id === id)
    // Never before midnight, never past the end of the day it belongs to.
    if (entry) onMove?.(entry, Math.max(0, Math.min(24 * 60 - 1, entry.startMin + deltaMin)))
  })

  return (
    <div className="daycol" style={{ height: hours * HOUR_PX }}>
      {Array.from({ length: slots }, (_, i) => (
        <button
          key={i}
          className="daycol__slot"
          style={{ top: (i * SLOT_MIN * HOUR_PX) / 60, height: (SLOT_MIN * HOUR_PX) / 60 }}
          onClick={() => onSlotTap?.(dayStartMin + i * SLOT_MIN)}
          aria-label={`${formatTime(minutesToTime(dayStartMin + i * SLOT_MIN))} slot`}
          disabled={!onSlotTap}
        />
      ))}

      {entries.map((e) => {
        const l = layout.get(e.id)
        const nudge = drag?.id === e.id ? (drag.deltaMin / 60) * HOUR_PX : 0
        const top = ((e.startMin - dayStartMin) / 60) * HOUR_PX + nudge
        const height = Math.max(18, ((e.endMin - e.startMin) / 60) * HOUR_PX - 2)
        const width = 100 / (l?.columns ?? 1)
        const position = { top, height, left: `${(l?.column ?? 0) * width}%`, width: `${width}%` }

        if (!onOpen) {
          return (
            <div
              key={e.id}
              className={`daycol__item daycol__item--${e.kind}`}
              style={position}
              title={e.title}
            >
              <span className="daycol__time">{formatTime(minutesToTime(e.startMin))}</span>{' '}
              {e.title}
            </div>
          )
        }

        const { style: dragStyle, ...pointer } = handlers(e.id)
        return (
          <button
            key={e.id}
            className={`daycol__item daycol__item--${e.kind}${
              drag?.id === e.id ? ' daycol__item--dragging' : ''
            }`}
            style={{ ...position, ...dragStyle }}
            title={e.title}
            {...pointer}
            onClick={() => !drag && onOpen(e)}
          >
            <span className="daycol__time">
              {formatTime(minutesToTime(e.startMin + (drag?.id === e.id ? drag.deltaMin : 0)))}
            </span>{' '}
            {e.title}
          </button>
        )
      })}
    </div>
  )
}
