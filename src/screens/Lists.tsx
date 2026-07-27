import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useData } from '../data/DataProvider'

export default function Lists() {
  const { areas, projects, tasks } = useData()

  const countsFor = (projectId: string) => {
    const own = tasks.filter((t) => t.project_id === projectId && t.parent_id === null)
    return { done: own.filter((t) => t.status === 'done').length, total: own.length }
  }

  const looseByArea = (areaId: string) =>
    tasks.filter((t) => t.area_id === areaId && t.project_id === null && t.status === 'open').length

  return (
    <main className="screen">
      <ScreenHeader title="Lists" />

      {areas.length === 0 ? (
        <EmptyState
          icon="🧺"
          title="No areas yet"
          hint="Run supabase/schema.sql to seed Work, Home, Car, Health, Money, Personal and Dates."
        />
      ) : (
        areas.map((area) => {
          const inArea = projects.filter((p) => p.area_id === area.id)
          const loose = looseByArea(area.id)
          if (inArea.length === 0 && loose === 0) return null

          return (
            <div className="card" key={area.id}>
              <h2>
                {area.icon} {area.name}
              </h2>

              {inArea.map((project) => {
                const { done, total } = countsFor(project.id)
                return (
                  <Link className="listrow" to={`/project/${project.id}`} key={project.id}>
                    <span className="listrow__icon">{project.icon}</span>
                    <span className="listrow__body">
                      <span className="row--between">
                        <strong>{project.name}</strong>
                        {/* A list is a rolling tally, not a thing you finish,
                            so it counts what's left rather than progress. */}
                        {project.kind === 'list' && (
                          <span className="muted">{total - done} to get</span>
                        )}
                      </span>
                      {project.kind === 'project' && total > 0 && (
                        <ProgressBar done={done} total={total} />
                      )}
                    </span>
                  </Link>
                )
              })}

              {loose > 0 && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
                  {loose} not in a project
                </p>
              )}
            </div>
          )
        })
      )}
    </main>
  )
}
