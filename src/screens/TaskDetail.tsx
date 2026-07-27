import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { ProgressBar } from '../components/ui/ProgressBar'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useData } from '../data/DataProvider'
import { describeRule } from '../domain/recurrence'
import { ruleOf } from '../data/series'
import { addDays, startOfWeek, todayISO } from '../domain/day'

const PRIORITIES = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Med' },
  { value: '3', label: 'High' },
]

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tasks, series, projects, addTask, patchTask, removeTask } = useData()
  const [subtask, setSubtask] = useState('')

  const task = tasks.find((t) => t.id === id)
  if (!task) {
    return (
      <main className="screen">
        <ScreenHeader title="Not found" />
        <p className="muted">That task no longer exists.</p>
      </main>
    )
  }

  const children = tasks.filter((t) => t.parent_id === task.id)
  const childrenDone = children.filter((t) => t.status === 'done').length
  const parentSeries = task.series_id ? series.find((s) => s.id === task.series_id) : undefined
  const today = todayISO()

  const addSubtask = async (e: FormEvent) => {
    e.preventDefault()
    const title = subtask.trim()
    if (!title) return
    setSubtask('')
    // A subtask inherits its parent's filing, so it shows up in the same places.
    await addTask({
      title,
      parent_id: task.id,
      project_id: task.project_id,
      area_id: task.area_id,
    })
  }

  return (
    <main className="screen">
      <ScreenHeader
        title="Task"
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <div className="card">
        <input
          className="input"
          value={task.title}
          onChange={(e) => void patchTask(task.id, { title: e.target.value })}
          aria-label="Title"
        />
        <textarea
          className="input"
          style={{ marginTop: 10, minHeight: 72 }}
          value={task.notes}
          onChange={(e) => void patchTask(task.id, { notes: e.target.value })}
          placeholder="Notes"
        />
      </div>

      <div className="card">
        <h2>When</h2>
        <label className="row--between setting-row">
          <span>Due</span>
          <input
            className="input input--time"
            type="date"
            value={task.due_on ?? ''}
            onChange={(e) => void patchTask(task.id, { due_on: e.target.value || null })}
          />
        </label>
        <label className="row--between setting-row">
          <span>Time</span>
          <input
            className="input input--time"
            type="time"
            value={task.due_time?.slice(0, 5) ?? ''}
            onChange={(e) => void patchTask(task.id, { due_time: e.target.value || null })}
          />
        </label>
        <div className="triage">
          <button className="chip chip--action" onClick={() => void patchTask(task.id, { due_on: today })}>
            Today
          </button>
          <button
            className="chip chip--action"
            onClick={() => void patchTask(task.id, { due_on: addDays(today, 1) })}
          >
            Tomorrow
          </button>
          <button
            className="chip chip--action"
            onClick={() => void patchTask(task.id, { due_on: addDays(startOfWeek(today, 1), 7) })}
          >
            Next week
          </button>
        </div>

        {parentSeries && (
          // Editing one occurrence must never rewrite the rule — that is the
          // whole reason series and occurrences are separate rows.
          <p className="muted" style={{ margin: '12px 0 0', fontSize: '0.78rem' }}>
            🔁 {describeRule(ruleOf(parentSeries))} · changes here affect this one only
          </p>
        )}
      </div>

      <div className="card">
        <h2>Priority</h2>
        <SegmentedControl
          value={String(task.priority)}
          options={PRIORITIES}
          onChange={(v) => void patchTask(task.id, { priority: Number(v) })}
        />

        <h2 style={{ marginTop: 16 }}>Project</h2>
        <select
          className="input"
          value={task.project_id ?? ''}
          onChange={(e) => {
            const project = projects.find((p) => p.id === e.target.value)
            void patchTask(task.id, {
              project_id: project?.id ?? null,
              area_id: project?.area_id ?? task.area_id,
            })
          }}
        >
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="row--between">
          <h2 style={{ margin: 0 }}>Subtasks</h2>
          {children.length > 0 && (
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {childrenDone}/{children.length}
            </span>
          )}
        </div>
        {children.length > 0 && (
          <div style={{ margin: '10px 0' }}>
            <ProgressBar done={childrenDone} total={children.length} />
          </div>
        )}
        {children.map((c) => (
          <TaskRow key={c.id} task={c} showProject={false} />
        ))}
        <form onSubmit={addSubtask} style={{ marginTop: 10 }}>
          <input
            className="input"
            value={subtask}
            onChange={(e) => setSubtask(e.target.value)}
            placeholder="Add a step…"
            enterKeyHint="done"
          />
        </form>
      </div>

      <button
        className="btn"
        style={{ color: 'var(--danger-strong)' }}
        onClick={async () => {
          await removeTask(task.id)
          navigate(-1)
        }}
      >
        Delete task
      </button>
    </main>
  )
}
