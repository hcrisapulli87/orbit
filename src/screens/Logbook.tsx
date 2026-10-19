import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { fetchCompletedThrough, historyCursor } from '../data/tasks'
import { groupByDay, weekTally, wholeDays } from '../domain/logbook'
import { relativeLabel, todayISO } from '../domain/day'
import type { Task } from '../data/types'

/** Rows per page from the server. Trimmed back to whole days before showing. */
const PAGE = 100

/**
 * Everything you've finished, a day at a time.
 *
 * The last month comes straight from the working set, so it is live: tick
 * something on Today and it is here already. Earlier months are paged in from
 * the server on request and merged underneath. Unticking a recent row reopens
 * it, the same as anywhere else; older rows are a record and are read-only.
 */
export default function Logbook() {
  const navigate = useNavigate()
  const { tasks } = useData()
  const today = todayISO()

  const [older, setOlder] = useState<Task[]>([])
  const [cursor, setCursor] = useState<string | null>(() => historyCursor(today))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const days = useMemo(() => groupByDay([...tasks, ...older]), [tasks, older])
  const live = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const tally = useMemo(() => weekTally(tasks, today), [tasks, today])

  const loadEarlier = async () => {
    if (!cursor) return
    setLoading(true)
    setError('')
    try {
      const page = await fetchCompletedThrough(cursor, PAGE)
      const { kept, cursor: next } = wholeDays(page, PAGE)
      setOlder((prev) => [...prev, ...kept])
      setCursor(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load earlier history')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="screen">
      <ScreenHeader
        title="Logbook"
        sub={`${tally.thisWeek} done this week · ${tally.lastWeek} last week`}
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />
      {error && <p className="error">{error}</p>}

      {days.length === 0 && (
        <EmptyState
          icon="logbook"
          title="Nothing finished yet"
          hint="Tick something off and it will be kept here, by the day you did it."
        />
      )}

      {days.map((d) => (
        <div className="card" key={d.day}>
          <h2>
            {relativeLabel(d.day, today)} · {d.tasks.length}
          </h2>
          {d.tasks.map((t) =>
            live.has(t.id) ? <TaskRow key={t.id} task={t} /> : <HistoryRow key={t.id} task={t} />,
          )}
        </div>
      ))}

      {cursor ? (
        <button className="btn" style={{ width: '100%' }} disabled={loading} onClick={() => void loadEarlier()}>
          {loading ? 'Loading…' : 'Show earlier'}
        </button>
      ) : (
        days.length > 0 && <p className="hint" style={{ textAlign: 'center' }}>That's everything.</p>
      )}
    </main>
  )
}

/**
 * A finished task from before the working set's window. Nothing else in the
 * app holds it — the task screen and the tick both work from memory — so it is
 * shown as the record it is rather than as a row that half works.
 */
function HistoryRow({ task }: { task: Task }) {
  const { projects } = useData()
  const project = projects.find((p) => p.id === task.project_id)
  return (
    <div className="swipe">
      <div className="task-row task-row--done">
        <span className="check check--done" aria-hidden="true">
          <span className="check__box">✓</span>
        </span>
        <div className="task-row__body">
          <span className="task-row__title">{task.title}</span>
          {project && (
            <p className="task-row__meta">
              <span className="chip">
                {project.icon} {project.name}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
