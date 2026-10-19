import { Link } from 'react-router-dom'
import { TaskRow } from './TaskRow'
import { addDays, todayISO, weekdayOf } from '../domain/day'
import { wrapUpTime } from '../domain/review'
import type { Task } from '../data/types'

// Two cards both Today layouts share — the stacked list and Transit's rail —
// so the overdue actions and the way into the Logbook can't drift apart.

/**
 * The overdue count, and the way to clear it. One tap moves the lot; a missed
 * repeat is skipped rather than stacked on its next occurrence, and the toast
 * that follows can undo all of it.
 */
export function OverdueBanner({
  count,
  note,
  onMove,
}: {
  count: number
  note: string
  onMove: (date: string) => void
}) {
  const today = todayISO()
  return (
    <div className="banner">
      <strong>{count} overdue</strong>
      <span className="muted"> — {note}</span>
      <div className="banner__actions">
        <button className="chip chip--action" onClick={() => onMove(today)}>
          Move all to today
        </button>
        <button className="chip chip--action" onClick={() => onMove(addDays(today, 1))}>
          Tomorrow
        </button>
      </div>
    </div>
  )
}

/** What's been ticked off today, with the way into everything before it. */
export function DoneCard({ doneToday, thisWeek }: { doneToday: Task[]; thisWeek: number }) {
  return (
    <div className="card">
      <div className="row--between" style={{ marginBottom: doneToday.length ? 4 : 0 }}>
        <h2 style={{ margin: 0 }}>
          {doneToday.length ? `Done today · ${doneToday.length}` : 'Nothing done yet today'}
        </h2>
        <Link className="chip chip--action" to="/logbook">
          {thisWeek} this week · Logbook
        </Link>
      </div>
      {doneToday.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </div>
  )
}

/**
 * The way into the wrap-up and the weekly review, offered only when they make
 * sense — the wrap-up from late afternoon, the review from Friday to Monday
 * (on a Monday it covers the week just ended) —
 * so the top of Today isn't permanently cluttered with rituals. Both screens
 * are always reachable from Help as well.
 */
export function ReviewPrompts({ dayEndMin }: { dayEndMin: number }) {
  const now = new Date()
  const evening = wrapUpTime(now.getHours() * 60 + now.getMinutes(), dayEndMin)
  const weekday = weekdayOf(todayISO())
  const weekend = weekday === 5 || weekday === 6 || weekday === 0 || weekday === 1
  if (!evening && !weekend) return null
  return (
    <div className="triage" style={{ margin: '0 0 var(--gap)' }}>
      {evening && (
        <Link className="chip chip--action" to="/wrap-up">
          Wrap up the day
        </Link>
      )}
      {weekend && (
        <Link className="chip chip--action" to="/week">
          Review the week
        </Link>
      )}
    </div>
  )
}
