import { useMemo } from 'react'
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

  const habits = series.filter(isHabitCadence)
  const upkeep = series.filter((s) => !isHabitCadence(s))

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

      {upkeep.length > 0 && (
        <div className="card">
          <h2>Upkeep</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.78rem' }}>
            Slower-running series — maintenance, renewals, important dates.
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
