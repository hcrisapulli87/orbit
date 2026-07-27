import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { saveProjectAsTemplate } from '../data/templates'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { projects, tasks, addTask, patchTask, reload } = useData()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState('')

  const project = projects.find((p) => p.id === id)
  if (!project) {
    return (
      <main className="screen">
        <ScreenHeader title="Not found" />
        <EmptyState icon="🤷" title="No such project" hint="It may have been archived." />
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
    </main>
  )
}
