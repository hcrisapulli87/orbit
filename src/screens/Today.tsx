import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { relativeLabel, todayISO, weekdayOf } from '../domain/day'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Today() {
  const { signOut } = useAuth()
  const { tasks, error } = useData()
  const today = todayISO()
  const dueToday = tasks.filter((t) => t.status === 'open' && t.due_on === today)

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

      {dueToday.length === 0 ? (
        <EmptyState icon="🌅" title="Nothing due today" hint="The planner lands in a later commit." />
      ) : (
        <div className="card">
          <h2>Due today</h2>
          {dueToday.map((t) => (
            <p key={t.id} style={{ margin: '4px 0' }}>
              {t.title}
            </p>
          ))}
        </div>
      )}
    </main>
  )
}
