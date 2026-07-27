import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { isInbox } from '../data/tasks'
import { addDays, startOfWeek, todayISO } from '../domain/day'
import type { Task } from '../data/types'

export default function Inbox() {
  const { tasks, projects, patchTask } = useData()
  const inbox = tasks.filter(isInbox)
  const today = todayISO()

  const when = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: addDays(startOfWeek(today, 1), 7) },
  ]

  return (
    <main className="screen">
      <ScreenHeader title="Inbox" sub={inbox.length ? `${inbox.length} to triage` : undefined} />

      {inbox.length === 0 ? (
        <EmptyState
          icon="📥"
          title="Inbox zero"
          hint="Anything captured without a date or project lands here."
        />
      ) : (
        inbox.map((t: Task) => (
          <div className="card" key={t.id}>
            <TaskRow task={t} />
            {/* One tap per decision — the whole point of a triage pass. */}
            <div className="triage">
              {when.map((w) => (
                <button
                  className="chip chip--action"
                  key={w.label}
                  onClick={() => void patchTask(t.id, { due_on: w.date })}
                >
                  {w.label}
                </button>
              ))}
              {projects.map((p) => (
                <button
                  className="chip chip--action"
                  key={p.id}
                  onClick={() => void patchTask(t.id, { project_id: p.id, area_id: p.area_id })}
                >
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </main>
  )
}
