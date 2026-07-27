import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { buildToday } from '../domain/planner'
import { formatTime, relativeLabel, todayISO, weekdayOf } from '../domain/day'
import type { Task } from '../data/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const hours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`

export default function Today() {
  const { tasks, series, blocks, settings, error, planDay } = useData()
  const today = todayISO()
  const todayBlocks = blocks.filter((b) => b.on_date === today)

  // lead_days lives on the series, so occurrences borrow it for scoring: a
  // birthday with a week of lead should surface a week out, not on the day.
  const plannable = useMemo(() => {
    const leadById = new Map(series.map((s) => [s.id, s.lead_days]))
    return tasks.map((t) => ({ ...t, lead_days: t.series_id ? leadById.get(t.series_id) ?? 0 : 0 }))
  }, [tasks, series])

  const capacityMin = settings.weekday_capacity[weekdayOf(today)] ?? 180
  const plan = useMemo(
    () => buildToday(plannable, { today, capacityMin }),
    [plannable, today, capacityMin],
  )

  const doneToday = tasks.filter((t) => t.status === 'done' && t.completed_on === today)
  const nothing =
    plan.must.length + plan.should.length + plan.ifTime.length + plan.events.length === 0

  return (
    <main className="screen">
      <ScreenHeader
        title={WEEKDAYS[weekdayOf(today)]}
        sub={relativeLabel(today, today)}
        action={
          <Link className="gear" to="/settings" aria-label="Settings">
            ⚙️
          </Link>
        }
      />
      {error && <p className="error">{error}</p>}

      {plan.overdue.length > 0 && (
        <div className="banner">
          <strong>{plan.overdue.length} overdue</strong>
          <span className="muted"> — oldest first below</span>
        </div>
      )}

      {/* The capacity bar is a statement of fact, not a nag: when the day
          doesn't fit it says by how much rather than hiding anything. */}
      {plan.must.length + plan.should.length > 0 && (
        <div className="card">
          <h2>The day</h2>
          <div className="meter">
            <div
              className={`meter__fill${plan.overCapacity > 0 ? ' meter__fill--over' : ''}`}
              style={{ width: `${Math.min(100, (plan.plannedMin / Math.max(1, capacityMin)) * 100)}%` }}
            />
          </div>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
            {hours(plan.plannedMin)} planned of {hours(capacityMin)}
            {plan.overCapacity > 0 && (
              <span className="warn"> · {hours(plan.overCapacity)} more than you have</span>
            )}
          </p>
          <button
            className="btn btn--small"
            style={{ marginTop: 12 }}
            onClick={() => void planDay(today)}
          >
            Auto-plan my day
          </button>
        </div>
      )}

      {todayBlocks.length > 0 && (
        <div className="card">
          <h2>Blocked out</h2>
          {todayBlocks.map((b) => (
            <p key={b.id} style={{ margin: '4px 0' }}>
              <strong>{formatTime(b.start_time)}</strong>–{formatTime(b.end_time)}{' '}
              {b.label || tasks.find((t) => t.id === b.task_id)?.title || 'Blocked'}
              {b.source === 'planner' && <span className="muted"> · suggested</span>}
            </p>
          ))}
        </div>
      )}

      {nothing && (
        <EmptyState icon="🌅" title="Nothing needs you today" hint="Capture something and it will show up here." />
      )}

      <Section title="Must" tasks={plan.must} />
      <Section title="Should" tasks={plan.should} />
      <Section title="If there's time" tasks={plan.ifTime} />

      {plan.events.length > 0 && (
        <div className="card">
          <h2>Coming up</h2>
          {plan.events.map((t) => (
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
    </main>
  )
}

function Section({ title, tasks }: { title: string; tasks: Task[] }) {
  if (tasks.length === 0) return null
  return (
    <div className="card">
      <h2>{title}</h2>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </div>
  )
}
