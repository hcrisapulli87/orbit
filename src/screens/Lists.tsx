import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useData } from '../data/DataProvider'
import { withinHorizon } from '../domain/planner'
import { todayISO } from '../domain/day'
import type { ProjectKind } from '../data/types'

export default function Lists() {
  const { areas, projects, tasks, addArea } = useData()
  const today = todayISO()
  const [making, setMaking] = useState(false)

  const countsFor = (projectId: string) => {
    const own = tasks.filter((t) => t.project_id === projectId && t.parent_id === null)
    return { done: own.filter((t) => t.status === 'done').length, total: own.length }
  }

  // Near enough to act on, by the same rule Today uses — otherwise a daily
  // habit's sixty materialised occurrences dominate the count and it stops
  // meaning "there is loose work here".
  const looseByArea = (areaId: string) =>
    tasks.filter(
      (t) =>
        t.area_id === areaId &&
        t.project_id === null &&
        t.status === 'open' &&
        withinHorizon(t, today),
    ).length

  return (
    <main className="screen">
      <ScreenHeader
        title="Lists"
        action={
          <span className="row">
            <button className="gear" onClick={() => setMaking(true)} aria-label="New list">
              <Icon name="plus" />
            </button>
            <Link className="gear" to="/templates" aria-label="Templates">
              <Icon name="templates" />
            </Link>
          </span>
        }
      />

      {areas.length === 0 ? (
        <EmptyState
          icon="lists"
          title="No areas yet"
          hint="An area is a coarse bucket — Work, Home, Car. Lists and projects live inside one."
          action={
            <button
              className="btn btn--primary"
              onClick={() =>
                void addArea({ name: 'Home', icon: '🏠', sort_order: 10 })
              }
            >
              Create a Home area
            </button>
          }
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

      {areas.length > 0 && (
        <button className="btn" onClick={() => setMaking(true)}>
          New list or project
        </button>
      )}

      {making && <NewProjectSheet onClose={() => setMaking(false)} />}
    </main>
  )
}

/**
 * Make a list or a project.
 *
 * Both are one row in one table — `kind` changes how it renders and nothing
 * else — so this is one form with a switch rather than two screens. The copy
 * explains the difference at the point of choosing, because the words "list"
 * and "project" don't carry it on their own.
 */
function NewProjectSheet({ onClose }: { onClose: () => void }) {
  const { areas, addArea, addProject } = useData()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🗂️')
  const [kind, setKind] = useState<ProjectKind>('list')
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    // An area is required to place it, so make one rather than refusing.
    const area = areaId || (await addArea({ name: 'Home', icon: '🏠', sort_order: 10 }))?.id
    await addProject({
      name: trimmed,
      kind,
      icon: icon.trim() || (kind === 'list' ? '🧺' : '🗂️'),
      area_id: area ?? null,
      sort_order: 100,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="New list or project">
      <div className="sheet__panel">
        <div className="row--between">
          <strong>New</strong>
          <button className="btn btn--small" onClick={onClose}>
            Cancel
          </button>
        </div>

        <SegmentedControl
          value={kind}
          options={[
            { value: 'list' as ProjectKind, label: 'List' },
            { value: 'project' as ProjectKind, label: 'Project' },
          ]}
          onChange={setKind}
        />
        <p className="hint">
          {kind === 'list'
            ? 'A rolling tally you never finish — groceries, a wishlist. One field, type and enter.'
            : 'Something with steps and an end — subtasks, due dates and a progress bar.'}
        </p>

        <label className="row--between setting-row">
          <span>Name</span>
          <input
            className="input input--time"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'list' ? 'Hardware' : 'Repaint the deck'}
            aria-label="Name"
            autoFocus
          />
        </label>

        <label className="row--between setting-row">
          <span>Icon</span>
          <input
            className="input input--number"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            aria-label="Icon"
          />
        </label>

        <label className="row--between setting-row">
          <span>Area</span>
          <select
            className="input input--time"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            aria-label="Area"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </label>

        <p className="hint" style={{ marginTop: 10 }}>
          Capture picks it up straight away: type <code>@{(name.trim() || 'name').toLowerCase().split(' ')[0]}</code> and
          anything you capture files itself here.
        </p>

        <button
          className="btn btn--primary"
          style={{ marginTop: 12 }}
          disabled={saving || !name.trim()}
          onClick={() => void save()}
        >
          {saving ? 'Creating…' : `Create ${kind}`}
        </button>
      </div>
    </div>
  )
}
