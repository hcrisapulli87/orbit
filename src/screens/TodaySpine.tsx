import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/ui/EmptyState'
import { HOUR_PX, timedEntriesFor } from '../components/calendar/DayColumn'
import type { TimedEntry } from '../components/calendar/DayColumn'
import { layoutTimedItems, visibleWindow } from '../domain/calendarGrid'
import { useData } from '../data/DataProvider'
import { formatTime, minutesToTime, parseTimeToMinutes, relativeLabel, todayISO, weekdayOf } from '../domain/day'
import type { TodayPlan } from '../domain/planner'
import type { Block, Task } from '../data/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Transit's Today: one rail instead of a stack of cards.
 *
 * Anything with a time — a block, a task due at 3pm — sits on the clock where
 * it actually falls. Everything without one hangs below the spine, because a
 * timeline that invents times for undated work is lying about the day.
 *
 * The plan is built by Today and handed down, and the geometry comes from
 * DayColumn (HOUR_PX, timedEntriesFor), so the rail and the calendar can't
 * drift apart — change the hour height in one place and both move.
 */
export default function TodaySpine({
  plan,
  blocks,
  doneToday,
}: {
  plan: TodayPlan<Task & { lead_days: number }>
  blocks: Block[]
  doneToday: Task[]
}) {
  const { tasks, settings, error } = useData()
  const today = todayISO()

  const dayStart = parseTimeToMinutes(settings.day_start) ?? 480
  const dayEnd = parseTimeToMinutes(settings.day_end) ?? 1260

  // Blocks and timed tasks share one list so they lay out against each other
  // rather than in two independent stacks that can overlap.
  const blockEntries: TimedEntry[] = blocks.flatMap((b) => {
    const startMin = parseTimeToMinutes(b.start_time)
    const endMin = parseTimeToMinutes(b.end_time)
    if (startMin === null || endMin === null) return []
    return [{
      id: b.id,
      title: b.label || tasks.find((t) => t.id === b.task_id)?.title || 'Blocked',
      startMin,
      endMin,
      kind: 'block' as const,
    }]
  })

  // The rail is today. Must and Should are today by construction now, so the
  // date filter below is belt and braces rather than the load-bearing part it
  // used to be when the plan reached days ahead.
  const planned = [...plan.must, ...plan.should]

  const onClock = [...blockEntries, ...timedEntriesFor(planned.filter((t) => t.due_on === today))]
    .sort((a, b) => a.startMin - b.startMin)

  const onClockIds = new Set(onClock.map((e) => e.id))
  const unscheduled = planned.filter((t) => !onClockIds.has(t.id))

  // Two things at the same time sit side by side rather than on top of each
  // other. Same function the calendar uses, so a clash looks the same on both.
  const layout = new Map(
    layoutTimedItems(onClock.map((e) => ({ id: e.id, start: e.startMin, end: e.endMin })))
      .map((l) => [l.id, l]),
  )

  // The rail grows to fit rather than clamping — the same rule, and the same
  // function, the calendar's grids use.
  const { startMin: railStart, endMin: railEnd } = visibleWindow(onClock, dayStart, dayEnd)

  const hours = Math.max(1, Math.ceil((railEnd - railStart) / 60))
  const railHeight = hours * HOUR_PX
  const topFor = (min: number) => ((min - railStart) / 60) * HOUR_PX

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nowVisible = nowMin >= railStart && nowMin <= railEnd

  return (
    <main className="screen">
      <ScreenHeader
        title={WEEKDAYS[weekdayOf(today)]}
        sub={relativeLabel(today, today)}
        action={
          <Link className="gear" to="/settings" aria-label="Settings">
            <Icon name="gear" />
          </Link>
        }
      />
      {error && <p className="error">{error}</p>}

      {plan.overdue.length > 0 && (
        <div className="banner">
          <strong>{plan.overdue.length} overdue</strong>
          <span className="muted"> — below the rail</span>
        </div>
      )}

      <div className="card">
        <h2>
          The rail · {formatTime(minutesToTime(railStart))}–{formatTime(minutesToTime(railEnd))}
        </h2>
        <div className="spine" style={{ height: railHeight }}>
          {Array.from({ length: hours }, (_, i) => (
            <div key={i}>
              <span className="spine__hour" style={{ top: i * HOUR_PX - 5 }}>
                {formatTime(minutesToTime(railStart + i * 60))}
              </span>
              <div className="spine__rule" style={{ top: i * HOUR_PX }} />
            </div>
          ))}

          {nowVisible && <div className="spine__now" style={{ top: topFor(nowMin) }} />}

          <div className="spine__lane">
            {onClock.map((e) => {
              const l = layout.get(e.id)
              const width = 100 / (l?.columns ?? 1)
              return (
                <div
                  key={e.id}
                  className={`spine__item spine__item--${e.kind}`}
                  style={{
                    top: topFor(e.startMin),
                    height: Math.max(22, ((e.endMin - e.startMin) / 60) * HOUR_PX - 2),
                    left: `${(l?.column ?? 0) * width}%`,
                    width: `${width}%`,
                  }}
                  title={e.title}
                >
                  <span className="spine__time">{formatTime(minutesToTime(e.startMin))}</span>
                  {e.title}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="card">
          <h2>Not on the clock · {unscheduled.length}</h2>
          {unscheduled.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {plan.comingUp.length > 0 && (
        <div className="card">
          <h2>Coming up</h2>
          <p className="hint">The next seven days, and the dates worth knowing about.</p>
          {plan.comingUp.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {plan.ifTime.length > 0 && (
        <div className="card">
          <h2>If there's time · {plan.ifTime.length}</h2>
          <p className="hint">Open work with no date on it.</p>
          {plan.ifTime.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {doneToday.length > 0 && (
        <div className="card">
          <h2>Done today</h2>
          {doneToday.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {onClock.length === 0 &&
        unscheduled.length === 0 &&
        plan.comingUp.length === 0 &&
        plan.ifTime.length === 0 && (
          <EmptyState
            icon="today"
            title="Nothing on the rail"
            hint="Capture something and it will show up here."
          />
        )}
    </main>
  )
}
