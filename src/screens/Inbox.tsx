import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { isInbox } from '../data/tasks'

export default function Inbox() {
  const { tasks } = useData()
  const inbox = tasks.filter(isInbox)

  return (
    <main className="screen">
      <ScreenHeader title="Inbox" sub={inbox.length ? `${inbox.length} to triage` : undefined} />
      {inbox.length === 0 ? (
        <EmptyState icon="📥" title="Inbox zero" hint="Anything captured without a date or project lands here." />
      ) : (
        <div className="card">
          {inbox.map((t) => (
            <p key={t.id} style={{ margin: '4px 0' }}>
              {t.title}
            </p>
          ))}
        </div>
      )}
    </main>
  )
}
