import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { OverdueBanner } from '../components/TodayCards'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useData } from '../data/DataProvider'
import { useDayCapacity } from '../data/useDayCapacity'
import { addDays, relativeLabel, startOfWeek, todayISO } from '../domain/day'
import type { ISODate } from '../domain/day'
import { buildToday } from '../domain/planner'
import { daysAhead, doneBy, reviewWeek, scheduledVsDone, staleUndated } from '../domain/review'
import type { Series, Task } from '../data/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (iso: ISODate) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

/** Enough of the stale pile to act on in one sitting. */
const STALE_SHOWN = 10

const hours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`

/** The same test Habits uses: at least weekly is a habit, rarer is upkeep. */
const isHabitCadence = (s: Series) =>
  s.rule_type === 'daily' || (s.rule_type === 'weekly' && s.step === 1)

/**
 * A look back over the week and a look at the next one.
 *
 * Five questions, each answered from data Orbit already has: how much got
 * done and where, how the habits went, what's overdue, which coming days are
 * already too full, and what has been sitting undated for a month. The only
 * decisions it asks for are about that last pile — and those are one tap.
 */
export default function WeekReview() {
  const navigate = useNavigate()
  const { tasks, series, areas, projects, rescheduleOverdue, snoozeTask, dropTask } = useData()
  const capacity = useDayCapacity()
  const today = todayISO()
  const { from, to } = reviewWeek(today)
  const nextMonday = addDays(startOfWeek(today, 1), 7)

  const all = () => 'all'
  const finished = doneBy(tasks, from, to, all)[0]?.count ?? 0
  const before = doneBy(tasks, addDays(from, -7), addDays(to, -7), all)[0]?.count ?? 0
  const lastWeek = to < today
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, `${a.icon} ${a.name}`])), [areas])
  const projectArea = useMemo(() => new Map(projects.map((p) => [p.id, p.area_id])), [projects])
  const byArea = doneBy(tasks, from, to, (t: Task) => t.area_id ?? (t.project_id ? projectArea.get(t.project_id) ?? null : null))
  const most = Math.max(1, ...byArea.map((g) => g.count))

  const habits = series.filter((s) => s.active && isHabitCadence(s)).map((s) => {
    const occ = tasks.filter((t) => t.series_id === s.id && t.due_on)
    const done = new Set(occ.filter((t) => t.status === 'done').map((t) => t.due_on as string))
    return { series: s, ...scheduledVsDone(occ.map((t) => t.due_on as string), done, from, to, today) }
  }).filter((h) => h.due > 0)

  const plannable = tasks.map((t) => ({ ...t, lead_days: 0 }))
  const overdue = buildToday(plannable, { today, capacityMin: 0 }).overdue
  const ahead = daysAhead(plannable, addDays(today, 1), 7, (d) => capacity(d).capacityMin)
  // Lists are rolling tallies you never finish — groceries aren't backlog.
  const listIds = new Set(projects.filter((p) => p.kind === 'list').map((p) => p.id))
  const stale = staleUndated(tasks.filter((t) => !t.project_id || !listIds.has(t.project_id)), today)

  return (
    <main className="screen">
      <ScreenHeader
        title="The week"
        sub={`${lastWeek ? 'Last week, ' : ''}${short(from)} – ${short(to)}`}
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <div className="card">
        <div className="row--between">
          <h2 style={{ margin: 0 }}>Finished · {finished}</h2>
          <Link className="chip chip--action" to="/logbook">Logbook</Link>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {before === 0 ? 'Nothing recorded the week before to compare with.'
            : finished >= before ? `Up from ${before} the week before.`
            : lastWeek ? `Down from ${before} the week before.`
            : `${before} the week before — and this one isn’t over.`}
        </p>
        {byArea.map((g) => (
          <div className="review-bar" key={g.group ?? 'none'}>
            <span>{g.group ? areaName.get(g.group) ?? 'Elsewhere' : 'Not filed'}</span>
            <span className="review-bar__track">
              <span className="review-bar__fill" style={{ width: `${(g.count / most) * 100}%` }} />
            </span>
            <strong>{g.count}</strong>
          </div>
        ))}
      </div>

      {habits.length > 0 && (
        <div className="card">
          <h2>Habits</h2>
          {habits.map((h) => (
            <Link key={h.series.id} to={`/series/${h.series.id}`} className="habitlink">
              <div className="setting-row">
                <span>{h.series.title}</span>
                <div style={{ marginTop: 6 }}>
                  <ProgressBar done={h.done} total={h.due} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {overdue.length > 0 && (
        <OverdueBanner
          count={overdue.length}
          note="clear them before the new week"
          onMove={(date) => void rescheduleOverdue(overdue, date)}
        />
      )}

      <div className="card">
        <h2>The next seven days</h2>
        <p className="hint">Work already dated, against the room each day has after meetings.</p>
        {ahead.map((d) => (
          <div className="review-bar" key={d.day}>
            <span>{relativeLabel(d.day, today)}</span>
            <span className="review-bar__track">
              <span
                className={`review-bar__fill${d.overMin > 0 ? ' review-bar__fill--over' : ''}`}
                style={{ width: `${Math.min(100, (d.plannedMin / Math.max(1, d.capacityMin)) * 100)}%` }}
              />
            </span>
            <span className={d.overMin > 0 ? 'warn' : 'muted'}>
              {hours(d.plannedMin)} / {hours(d.capacityMin)}
            </span>
          </div>
        ))}
      </div>

      {stale.length > 0 && (
        <div className="card">
          <h2>Sitting a while · {stale.length}</h2>
          <p className="hint">
            Undated and untouched for a month or more. Give it a day, or let it go.
          </p>
          {stale.slice(0, STALE_SHOWN).map((t) => (
            <div key={t.id}>
              <TaskRow task={t} />
              <div className="triage" style={{ marginTop: 0, marginBottom: 8 }}>
                <button className="chip chip--action" onClick={() => void snoozeTask(t, addDays(today, 1))}>Tomorrow</button>
                <button className="chip chip--action" onClick={() => void snoozeTask(t, nextMonday)}>Next week</button>
                <button className="chip chip--action" onClick={() => void dropTask(t)}>Drop</button>
              </div>
            </div>
          ))}
          {stale.length > STALE_SHOWN && (
            <p className="hint" style={{ margin: '8px 0 0' }}>
              And {stale.length - STALE_SHOWN} more — the oldest are shown first.
            </p>
          )}
        </div>
      )}
    </main>
  )
}
