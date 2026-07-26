import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { compareISO, relativeLabel, todayISO, weekdayOf } from '../domain/day'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Today() {
  const { signOut } = useAuth()
  const { tasks, error } = useData()
  const today = todayISO()

  // Provisional grouping. The scored planner (must / should / if-time, filled
  // against the day's capacity) replaces this in Phase 4.
  const open = tasks.filter((t) => t.status === 'open')
  const overdue = open.filter((t) => t.kind !== 'event' && t.due_on && compareISO(t.due_on, today) < 0)
  const dueToday = open.filter((t) => t.due_on === today)
  const doneToday = tasks.filter((t) => t.status === 'done' && t.completed_on === today)

  const nothingToShow = overdue.length + dueToday.length + doneToday.length === 0

  return (
    <main className="screen">
      <ScreenHeader
        title={WEEKDAYS[weekdayOf(today)]}
        sub={relativeLabel(today, today)}
        action={
          <button className="btn btn--small" onClick={() => void signOut()}>
            Sign out
          </button>
        }
      />
      {error && <p className="error">{error}</p>}

      {nothingToShow && (
        <EmptyState icon="🌅" title="Nothing due today" hint="Capture something and it will show up here." />
      )}

      {overdue.length > 0 && (
        <div className="card">
          <h2>Overdue</h2>
          {overdue.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}

      {dueToday.length > 0 && (
        <div className="card">
          <h2>Today</h2>
          {dueToday.map((t) => (
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
