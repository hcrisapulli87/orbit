import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'

export default function Lists() {
  const { areas, projects } = useData()

  return (
    <main className="screen">
      <ScreenHeader title="Lists" />
      {areas.length === 0 ? (
        <EmptyState icon="🧺" title="No areas yet" hint="Run supabase/schema.sql to seed Work, Home, Car, Health, Money, Personal and Dates." />
      ) : (
        areas.map((a) => {
          const inArea = projects.filter((p) => p.area_id === a.id)
          return (
            <div className="card" key={a.id}>
              <h2>
                {a.icon} {a.name}
              </h2>
              {inArea.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No projects
                </p>
              ) : (
                inArea.map((p) => (
                  <p key={p.id} style={{ margin: '4px 0' }}>
                    {p.icon} {p.name}
                    {p.kind === 'list' && <span className="muted"> · list</span>}
                  </p>
                ))
              )}
            </div>
          )
        })
      )}
    </main>
  )
}
