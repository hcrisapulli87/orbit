import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { ruleOf } from '../data/series'
import { describeRule, nextOccurrenceAfter } from '../domain/recurrence'
import { bestStreak, completionRate, currentStreak } from '../domain/streaks'
import { addDays, compareISO, lastNDates, relativeLabel, todayISO } from '../domain/day'
import type { Series, Task } from '../data/types'

/**
 * A birthday's default warning. Long enough to actually buy something, which
 * is the only reason to know about it before the day.
 */
const DEFAULT_LEAD_DAYS = 7

/**
 * What counts as a habit here is the CADENCE, not a flag.
 *
 * Nothing sets kind='habit' today: inferring it from the words would be
 * guessing, and a manual toggle is exactly the optional field that never gets
 * filled in. A rule that comes round at least weekly behaves like a habit and
 * is worth a streak; anything rarer is upkeep, and a streak on a six-monthly
 * car service would be meaningless.
 */
const isHabitCadence = (s: Series) =>
  s.rule_type === 'daily' || (s.rule_type === 'weekly' && s.step === 1)

export default function Habits() {
  const { series, tasks } = useData()
  const today = todayISO()
  const [addingDate, setAddingDate] = useState(false)

  const occurrencesBySeries = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.series_id) continue
      const list = map.get(t.series_id) ?? []
      list.push(t)
      map.set(t.series_id, list)
    }
    return map
  }, [tasks])

  /** The next open occurrence, or what the rule says comes next. */
  const nextFor = (s: Series) => {
    const nextOpen = (occurrencesBySeries.get(s.id) ?? [])
      .filter((o) => o.status === 'open' && o.due_on && compareISO(o.due_on, today) >= 0)
      .sort((a, b) => compareISO(a.due_on!, b.due_on!))[0]
    return nextOpen?.due_on ?? nextOccurrenceAfter(ruleOf(s), addDays(today, -1))
  }

  const habits = series.filter(isHabitCadence)
  // Important dates get their own card: they behave differently from upkeep
  // (no checkbox, no minutes) and they are the thing most likely to be added
  // deliberately rather than captured in passing.
  const dates = series.filter((s) => s.kind === 'event')
  const upkeep = series.filter((s) => !isHabitCadence(s) && s.kind !== 'event')

  return (
    <main className="screen">
      <ScreenHeader title="Habits" />

      {habits.length === 0 && upkeep.length === 0 && (
        <EmptyState
          icon="habits"
          title="Nothing repeating yet"
          hint="Capture something like “stretch every day” or “bins every tue”."
        />
      )}

      {habits.map((s) => {
        const occurrences = occurrencesBySeries.get(s.id) ?? []
        const scheduled = occurrences.map((o) => o.due_on).filter((d): d is string => d !== null)
        const done = new Set(
          occurrences.filter((o) => o.status === 'done' && o.due_on).map((o) => o.due_on as string),
        )
        const streak = currentStreak(scheduled, done, today)
        const rate = completionRate(scheduled, done, today)

        return (
          <div className="card" key={s.id}>
            <Link className="row--between habitlink" to={`/series/${s.id}`}>
              <strong>{s.title}</strong>
              <span className="row">
                {streak > 0 && <span className="streak">🔥 {streak}</span>}
                <span className="muted" aria-hidden="true">›</span>
              </span>
            </Link>
            <p className="muted" style={{ margin: '4px 0 10px', fontSize: '0.78rem' }}>
              {describeRule(ruleOf(s))} · best {bestStreak(scheduled, done)} ·{' '}
              {Math.round(rate * 100)}% kept
            </p>

            {/* 30 days at a glance. The legend below is on screen rather than
                only in this comment — a strip of dots nobody can read is
                decoration, not information. */}
            <div className="dots" aria-hidden="true">
              {lastNDates(30, today).map((d) => {
                const wasScheduled = scheduled.includes(d)
                const wasDone = done.has(d)
                return (
                  <i
                    key={d}
                    className={`dot${wasDone ? ' dot--done' : wasScheduled ? ' dot--missed' : ''}`}
                  />
                )
              })}
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Last 30 days · <i className="dot dot--done" /> done ·{' '}
              <i className="dot dot--missed" /> missed · <i className="dot" /> not scheduled
            </p>
          </div>
        )
      })}

      <div className="card">
        <div className="row--between">
          <h2 style={{ margin: 0 }}>Important dates</h2>
          <button className="btn btn--small" onClick={() => setAddingDate(true)}>
            Add a birthday
          </button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Birthdays and anniversaries. No checkbox and no minutes against your
          day — they show up on Today and on the calendar, and you get a nudge
          in time to buy something.
        </p>
        {dates.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            None yet.
          </p>
        ) : (
          dates.map((s) => (
            <Link className="row--between setting-row habitlink" to={`/series/${s.id}`} key={s.id}>
              <span>
                🎂 {s.title}
                <br />
                <span className="muted" style={{ fontSize: '0.72rem' }}>
                  {describeRule(ruleOf(s))} · {s.lead_days} days' notice
                </span>
              </span>
              <span className="muted" style={{ fontSize: '0.78rem', textAlign: 'right' }}>
                {nextFor(s) ? relativeLabel(nextFor(s) as string, today) : '—'} ›
              </span>
            </Link>
          ))
        )}
      </div>

      {addingDate && <NewBirthdaySheet onClose={() => setAddingDate(false)} />}

      {upkeep.length > 0 && (
        <div className="card">
          <h2>Upkeep</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.78rem' }}>
            Slower-running series — maintenance and renewals.
          </p>
          {upkeep.map((s) => {
            const occurrences = occurrencesBySeries.get(s.id) ?? []
            const nextOpen = occurrences
              .filter((o) => o.status === 'open' && o.due_on)
              .sort((a, b) => compareISO(a.due_on!, b.due_on!))[0]
            // An after-completion series has no occurrence until the last one
            // is ticked, so fall back to what the rule says comes next.
            const next = nextOpen?.due_on ?? nextOccurrenceAfter(ruleOf(s), addDays(today, -1))

            return (
              <Link className="row--between setting-row habitlink" to={`/series/${s.id}`} key={s.id}>
                <span>
                  {s.kind === 'event' ? '🎂 ' : ''}
                  {s.title}
                  <br />
                  <span className="muted" style={{ fontSize: '0.72rem' }}>
                    {describeRule(ruleOf(s))}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: '0.78rem', textAlign: 'right' }}>
                  {next ? relativeLabel(next, today) : '—'} ›
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

/**
 * Add someone's birthday.
 *
 * Stored as a yearly series with kind='event', which is the shape the app
 * already had: no checkbox, no minutes against the day, materialised four
 * hundred days ahead so the whole year of calendar shows it, and surfaced
 * `lead_days` early. Capture can already do this if you happen to type the
 * word "birthday"; this is the same thing, on purpose, with the notice period
 * as a real question rather than a default nobody sees.
 */
function NewBirthdaySheet({ onClose }: { onClose: () => void }) {
  const { areas, addSeries } = useData()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [leadDays, setLeadDays] = useState(DEFAULT_LEAD_DAYS)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const who = name.trim()
    if (!who || !date) return
    setSaving(true)
    await addSeries({
      title: who.toLowerCase().includes('birthday') ? who : `${who}'s birthday`,
      notes: '',
      project_id: null,
      area_id: areas.find((a) => a.name === 'Dates')?.id ?? null,
      kind: 'event',
      priority: 0,
      tags: [],
      estimate_min: null,
      due_time: null,
      rule_type: 'yearly',
      step: 1,
      weekdays: [],
      // Left null so the engine reads the day and month off the anchor — one
      // source of truth rather than two that can drift.
      month_day: null,
      nth: null,
      month: null,
      after_n: null,
      after_unit: null,
      anchor_on: date,
      until_on: null,
      lead_days: leadDays,
      active: true,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Add a birthday">
      <div className="sheet__panel">
        <div className="row--between">
          <strong>Add a birthday</strong>
          <button className="btn btn--small" onClick={onClose}>
            Cancel
          </button>
        </div>

        <label className="row--between setting-row">
          <span>Whose</span>
          <input
            className="input input--time"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rowan"
            aria-label="Whose birthday"
            autoFocus
          />
        </label>

        <label className="row--between setting-row">
          <span>The date</span>
          <input
            className="input input--time"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
          />
        </label>

        <label className="row--between setting-row">
          <span>Warn me this many days early</span>
          <input
            className="input input--number"
            type="number"
            min={0}
            value={leadDays}
            onChange={(e) => setLeadDays(Math.max(0, Number(e.target.value) || 0))}
            aria-label="Days of notice"
          />
        </label>

        <p className="hint" style={{ marginTop: 10 }}>
          Repeats every year, and you'll get a reminder {leadDays === 0 ? 'on the day' : `${leadDays} days before`}
          {leadDays > 0 && ' — long enough to sort a present'}.
        </p>

        <button
          className="btn btn--primary"
          style={{ marginTop: 12 }}
          disabled={saving || !name.trim() || !date}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Add it'}
        </button>
      </div>
    </div>
  )
}
