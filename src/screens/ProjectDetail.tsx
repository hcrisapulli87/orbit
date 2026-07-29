import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { saveProjectAsTemplate } from '../data/templates'
import type { ProjectKind } from '../data/types'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    areas, projects, tasks, addTask, patchTask, patchProject, removeProject, reload,
  } = useData()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState('')

  const project = projects.find((p) => p.id === id)
  if (!project) {
    return (
      <main className="screen">
        <ScreenHeader title="Not found" />
        <EmptyState icon="missing" title="No such project" hint="It may have been archived." />
      </main>
    )
  }

  const isList = project.kind === 'list'
  const own = tasks.filter((t) => t.project_id === project.id && t.parent_id === null)
  const open = own.filter((t) => t.status === 'open')
  const done = own.filter((t) => t.status === 'done')

  // A list gets its own one-field add: on a grocery run you want to type and
  // hit enter, not think about dates or priorities.
  const quickAdd = async (e: FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await addTask({ title, project_id: project.id, area_id: project.area_id })
  }

  const clearTicked = async () => {
    // Dropped rather than deleted: the history of what you bought stays, and
    // nothing is destroyed by a mis-tap.
    await Promise.all(done.map((t) => patchTask(t.id, { status: 'dropped' })))
  }

  // The inverse of using a template, and the reason any template exists: you
  // save the shape of a job right after doing it, not before.
  const saveAsTemplate = async () => {
    if (!user) return
    const all = tasks.filter((t) => t.project_id === project.id)
    await saveProjectAsTemplate(user.id, project.name, project.area_id, all)
    setSaved(`Saved “${project.name}” as a template`)
    reload()
  }

  return (
    <main className="screen">
      <ScreenHeader
        title={`${project.icon} ${project.name}`}
        sub={isList ? `${open.length} to get` : undefined}
        action={
          <Link className="gear" to="/lists" aria-label="Back">
            ✕
          </Link>
        }
      />

      {isList && (
        <form className="card" onSubmit={quickAdd}>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add to ${project.name.toLowerCase()}…`}
            enterKeyHint="done"
            autoComplete="off"
          />
        </form>
      )}

      {!isList && own.length > 0 && (
        <div className="card">
          <h2>Progress</h2>
          <ProgressBar done={done.length} total={own.length} />
        </div>
      )}

      <div className="card">
        <h2>{isList ? 'To get' : 'Open'}</h2>
        {open.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing open.
          </p>
        ) : (
          open.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)
        )}
      </div>

      {!isList && own.length > 0 && (
        <div className="card">
          <h2>Reuse</h2>
          {saved ? (
            <p className="muted" style={{ margin: 0 }}>
              {saved} · <Link to="/templates">See templates</Link>
            </p>
          ) : (
            <button className="btn btn--small" onClick={() => void saveAsTemplate()}>
              Save as template
            </button>
          )}
        </div>
      )}

      {done.length > 0 && (
        <div className="card">
          <div className="row--between">
            <h2 style={{ margin: 0 }}>Ticked off</h2>
            <button className="btn btn--small" onClick={() => void clearTicked()}>
              Clear
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            {done.map((t) => (
              <TaskRow key={t.id} task={t} showProject={false} />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Settings</h2>
        <label className="row--between setting-row">
          <span>Name</span>
          <input
            className="input input--time"
            value={project.name}
            onChange={(e) => void patchProject(project.id, { name: e.target.value })}
            aria-label="Name"
          />
        </label>
        <label className="row--between setting-row">
          <span>Icon</span>
          <input
            className="input input--number"
            value={project.icon}
            onChange={(e) => void patchProject(project.id, { icon: e.target.value })}
            aria-label="Icon"
          />
        </label>
        <label className="row--between setting-row">
          <span>Area</span>
          <select
            className="input input--time"
            value={project.area_id ?? ''}
            onChange={(e) => void patchProject(project.id, { area_id: e.target.value || null })}
            aria-label="Area"
          >
            <option value="">None</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="row--between setting-row">
          <span>Kind</span>
          <SegmentedControl
            value={project.kind}
            options={[
              { value: 'list' as ProjectKind, label: 'List' },
              { value: 'project' as ProjectKind, label: 'Project' },
            ]}
            onChange={(v) => void patchProject(project.id, { kind: v })}
          />
        </label>
      </div>

      <button
        className="btn"
        style={{ color: 'var(--danger-strong)' }}
        onClick={async () => {
          await removeProject(project.id)
          navigate('/lists')
        }}
      >
        Archive this {isList ? 'list' : 'project'}
      </button>
      <p className="hint" style={{ marginTop: 8 }}>
        Archiving hides it without deleting anything. The {own.length} item
        {own.length === 1 ? '' : 's'} in it stay exactly where they are.
      </p>
    </main>
  )
}
