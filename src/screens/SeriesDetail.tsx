import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { RepeatEditor } from '../components/RepeatEditor'
import type { EndMode } from '../components/RepeatEditor'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useData } from '../data/DataProvider'
import { ruleOf } from '../data/series'
import { nthOccurrenceDate } from '../domain/recurrence'
import { compareISO, todayISO } from '../domain/day'
import type { Rule } from '../domain/recurrence'
import type { Series } from '../data/types'

const PRIORITIES = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Med' },
  { value: '3', label: 'High' },
]

/**
 * Edit a repeating thing: what it is, how often, and when it stops.
 *
 * The one screen where changing something reaches beyond the row in front of
 * you, which is exactly what was missing — a habit could be created by typing
 * "stretch every day" and then never touched again. Everything here is applied
 * to every future occurrence and to none of the past ones, and the screen says
 * so rather than leaving you to find out.
 *
 * Saving is explicit, unlike TaskDetail's live patches: an edit here rewrites
 * up to sixty rows and re-materialises the schedule, which is not something to
 * do on every keystroke.
 */
export default function SeriesDetail() {
  const { id } = useParams()
  const { series, loading } = useData()
  const stored = series.find((s) => s.id === id)

  // The editor holds a draft, so it must not mount until the row it is
  // drafting from exists — on a cold deep link the provider's first render has
  // no series at all. Keyed by id so switching series rebuilds the draft
  // rather than editing one series' fields into another's.
  if (!stored) {
    return (
      <main className="screen">
        <ScreenHeader title={loading ? 'Repeating' : 'Not found'} />
        <p className="muted">{loading ? 'Loading…' : 'That repeat no longer exists.'}</p>
      </main>
    )
  }

  return <SeriesEditor key={stored.id} stored={stored} />
}

function SeriesEditor({ stored }: { stored: Series }) {
  const navigate = useNavigate()
  const { tasks, projects, patchSeries, removeSeries } = useData()
  const today = todayISO()

  const [draft, setDraft] = useState<Series>(stored)
  const [endMode, setEndMode] = useState<EndMode>(stored.until_on ? 'on' : 'never')
  const [endCount, setEndCount] = useState(10)
  const [saving, setSaving] = useState(false)

  const occurrences = useMemo(
    () =>
      tasks
        .filter((t) => t.series_id === stored.id)
        .sort((a, b) => compareISO(a.due_on ?? '', b.due_on ?? '')),
    [tasks, stored.id],
  )

  const upcoming = occurrences.filter(
    (t) => t.status === 'open' && t.due_on !== null && compareISO(t.due_on, today) >= 0,
  )
  const done = occurrences.filter((t) => t.status === 'done').slice(-5).reverse()

  const patchRule = (patch: Partial<Rule>) => setDraft({ ...draft, ...patch })

  const changeEnd = (mode: EndMode, count: number) => {
    setEndMode(mode)
    setEndCount(count)
    // "After N times" is resolved to a date the moment it's chosen, so every
    // reader sees one representation of an ending rather than two.
    if (mode === 'never') setDraft({ ...draft, until_on: null })
    if (mode === 'after') setDraft({ ...draft, until_on: nthOccurrenceDate(ruleOf(draft), count) })
  }

  const save = async () => {
    setSaving(true)
    const until =
      endMode === 'after' ? nthOccurrenceDate(ruleOf(draft), endCount)
      : endMode === 'never' ? null
      : draft.until_on
    await patchSeries(draft.id, { ...draft, until_on: until })
    setSaving(false)
    navigate(-1)
  }

  return (
    <main className="screen">
      <ScreenHeader
        title="Repeating"
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <div className="card">
        <input
          className="input"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          aria-label="Title"
        />
        <textarea
          className="input"
          style={{ marginTop: 10, minHeight: 64 }}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Notes"
        />
      </div>

      <div className="card">
        <RepeatEditor
          rule={ruleOf(draft)}
          onChange={patchRule}
          endMode={endMode}
          endCount={endCount}
          onEndChange={changeEnd}
        />
      </div>

      <div className="card">
        <h2>Every occurrence gets</h2>
        <p className="hint">
          Changes here reach every future one. The ones already done keep the
          name, time and priority they were done under — that history is what
          the streak counts.
        </p>

        <label className="row--between setting-row">
          <span>Time of day</span>
          <input
            className="input input--time"
            type="time"
            value={draft.due_time?.slice(0, 5) ?? ''}
            onChange={(e) => setDraft({ ...draft, due_time: e.target.value || null })}
          />
        </label>

        <label className="row--between setting-row">
          <span>Warn me this many days early</span>
          <input
            className="input input--number"
            type="number"
            min={0}
            value={draft.lead_days}
            onChange={(e) => setDraft({ ...draft, lead_days: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Lead days"
          />
        </label>

        <h2 style={{ marginTop: 16 }}>Priority</h2>
        <SegmentedControl
          value={String(draft.priority)}
          options={PRIORITIES}
          onChange={(v) => setDraft({ ...draft, priority: Number(v) })}
        />

        <h2 style={{ marginTop: 16 }}>Project</h2>
        <select
          className="input"
          value={draft.project_id ?? ''}
          onChange={(e) => {
            const project = projects.find((p) => p.id === e.target.value)
            setDraft({
              ...draft,
              project_id: project?.id ?? null,
              area_id: project?.area_id ?? draft.area_id,
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

      <button className="btn btn--primary" disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save — applies to every future one'}
      </button>

      {upcoming.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Still to come · {upcoming.length}</h2>
          <p className="hint">Tap one to change just that occurrence.</p>
          {upcoming.slice(0, 6).map((t) => (
            <TaskRow key={t.id} task={t} showProject={false} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="card">
          <h2>Recently done</h2>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} showProject={false} />
          ))}
        </div>
      )}

      <button
        className="btn"
        style={{ color: 'var(--danger-strong)' }}
        onClick={async () => {
          await removeSeries(draft.id)
          navigate('/habits')
        }}
      >
        Stop this repeating
      </button>
      <p className="hint" style={{ marginTop: 8 }}>
        Deletes the rule and every occurrence of it, done ones included.
      </p>
    </main>
  )
}
