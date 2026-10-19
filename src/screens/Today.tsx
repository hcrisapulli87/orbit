import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/ui/EmptyState'
import { BlockSheet, blockRange } from '../components/calendar/BlockSheet'
import { useData } from '../data/DataProvider'
import { useDayCapacity } from '../data/useDayCapacity'
import { EventList } from '../components/calendar/EventList'
import { buildToday, splitForReplan } from '../domain/planner'
import { collapsesSections, usesSpine } from '../domain/appearance'
import { formatTime, minutesToTime, parseTimeToMinutes, relativeLabel, todayISO, weekdayOf } from '../domain/day'
import { weekTally } from '../domain/logbook'
import TodaySpine from './TodaySpine'
import { DoneCard, OverdueBanner, ReviewPrompts } from '../components/TodayCards'
import type { Block, Task } from '../data/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Dismissal of the first-run card. localStorage, the same mirror the
    appearance uses — it's a preference about chrome, not data worth a row. */
const INTRO_KEY = 'orbit.introDismissed'

const hours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`

export default function Today() {
  const {
    tasks, series, blocks, settings, error, planDay, clearPlan, rescheduleOverdue, calendarSlices,
  } = useData()
  const today = todayISO()
  const todayBlocks = blocks.filter((b) => b.on_date === today)
  const [editing, setEditing] = useState<Block | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(INTRO_KEY) === '1')

  // lead_days lives on the series, so occurrences borrow it for scoring: a
  // birthday with a week of lead should surface a week out, not on the day.
  const plannable = useMemo(() => {
    const leadById = new Map(series.map((s) => [s.id, s.lead_days]))
    return tasks.map((t) => ({ ...t, lead_days: t.series_id ? leadById.get(t.series_id) ?? 0 : 0 }))
  }, [tasks, series])

  // Capacity is the smaller of the task time Settings gives this weekday and
  // what today's meetings actually leave free. A Tuesday with five hours of
  // meetings is not a normal Tuesday.
  const todayEvents = calendarSlices.filter((s) => s.day === today)
  const { capacityMin, meetingMin } = useDayCapacity()(today)
  const plan = useMemo(
    () => buildToday(plannable, { today, capacityMin }),
    [plannable, today, capacityMin],
  )

  const doneToday = tasks.filter((t) => t.status === 'done' && t.completed_on === today)
  const nothing =
    plan.must.length + plan.should.length + plan.comingUp.length + plan.ifTime.length === 0

  // Three of the four themes restyle this list; Transit is a different view of
  // the same plan, so it gets its own component rather than a pile of CSS.
  // The plan itself is built above either way — the two can't disagree.
  if (usesSpine(settings.ui_theme)) {
    return <TodaySpine plan={plan} blocks={todayBlocks} doneToday={doneToday} />
  }

  const { thisWeek } = weekTally(tasks, today)

  // Suggested blocks whose time has passed with the task still open: the day
  // ran late. Counted, not acted on — re-planning is offered, never imposed.
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const { slipped } = splitForReplan(
    todayBlocks
      .filter((b) => b.source === 'planner' && !b.all_day)
      .map((b) => ({
        taskId: b.task_id,
        startMin: parseTimeToMinutes(b.start_time) ?? 0,
        endMin: parseTimeToMinutes(b.end_time) ?? 0,
      })),
    // A task pinned to a time is placed there by every plan — a re-plan can't
    // move it, so it isn't offered as something that slipped.
    (id) => tasks.some((t) => t.id === id && t.status === 'open' && !(t.due_on === today && t.due_time)),
    nowMin,
  )

  // Terrain shows only what must happen; Should and If-there's-time fold behind
  // a summary line. It's a prop on the section, not a second screen.
  const collapse = collapsesSections(settings.ui_theme)

  return (
    <main className="screen">
      <ScreenHeader
        title={WEEKDAYS[weekdayOf(today)]}
        sub={relativeLabel(today, today)}
        action={
          <span className="row">
            <Link className="gear" to="/search" aria-label="Search">
              <Icon name="search" />
            </Link>
            <Link className="gear" to="/help" aria-label="How Orbit works">
              <Icon name="help" />
            </Link>
            <Link className="gear" to="/settings" aria-label="Settings">
              <Icon name="gear" />
            </Link>
          </span>
        }
      />
      {error && <p className="error">{error}</p>}

      <ReviewPrompts dayEndMin={parseTimeToMinutes(settings.day_end) ?? 1260} />

      {plan.overdue.length > 0 && (
        <OverdueBanner
          count={plan.overdue.length}
          note="oldest first below"
          onMove={(date) => void rescheduleOverdue(plan.overdue, date)}
        />
      )}

      {/* The capacity bar is a statement of fact, not a nag: when the day
          doesn't fit it says by how much rather than hiding anything. */}
      {plan.must.length + plan.should.length > 0 && (
        <div className="card">
          <h2>The day</h2>
          <div className="meter">
            <div
              className={`meter__fill${plan.overCapacity > 0 ? ' meter__fill--over' : ''}`}
              style={{ width: `${Math.min(100, (plan.plannedMin / Math.max(1, capacityMin)) * 100)}%` }}
            />
          </div>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
            {hours(plan.plannedMin)} planned of {hours(capacityMin)}
            {plan.overCapacity > 0 && (
              <span className="warn"> · {hours(plan.overCapacity)} more than you have</span>
            )}
            {meetingMin > 0 && <> · {hours(meetingMin)} in meetings</>}
          </p>
          <button
            className="btn btn--small"
            style={{ marginTop: 12 }}
            onClick={() => void planDay(today)}
          >
            Auto-plan my day
          </button>
        </div>
      )}

      {todayEvents.length > 0 && (
        <div className="card">
          <h2>On your calendar</h2>
          <EventList slices={todayEvents} />
        </div>
      )}

      {todayBlocks.length > 0 && (
        <div className="card">
          <h2>Blocked out</h2>
          <p className="hint">Tap one to change the time, rename it or remove it.</p>
          {todayBlocks.map((b) => (
            <button key={b.id} className="blockrow" onClick={() => setEditing(b)}>
              <span className="blockrow__when">{blockRange(b)}</span>
              <span className="blockrow__what">
                {b.label || tasks.find((t) => t.id === b.task_id)?.title || 'Blocked'}
              </span>
              {b.source === 'planner' && <span className="muted">suggested</span>}
            </button>
          ))}
          {slipped.length > 0 && (
            <div className="slipped">
              <p className="hint" style={{ margin: 0 }}>
                {slipped.length === 1 ? 'One suggested block' : `${slipped.length} suggested blocks`} went
                by without being done.
              </p>
              <button className="btn btn--small" onClick={() => void planDay(today, nowMin)}>
                Re-plan from {formatTime(minutesToTime(Math.ceil(nowMin / 15) * 15))}
              </button>
            </div>
          )}
          {todayBlocks.some((b) => b.source === 'planner') && (
            <button
              className="btn btn--small"
              style={{ marginTop: 10 }}
              onClick={() => void clearPlan(today)}
            >
              Clear the auto-plan
            </button>
          )}
        </div>
      )}

      {editing && <BlockSheet block={editing} onClose={() => setEditing(null)} />}

      {/* First run. Shown while there is genuinely nothing in the app rather
          than on any empty day, and dismissible for good — an onboarding card
          that outstays its welcome is worse than none. */}
      {tasks.length === 0 && !dismissed && (
        <div className="card">
          <div className="row--between">
            <h2 style={{ margin: 0 }}>Start here</h2>
            <button
              className="btn btn--small"
              onClick={() => {
                localStorage.setItem(INTRO_KEY, '1')
                setDismissed(true)
              }}
            >
              Got it
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Everything goes in through the bar at the bottom, and it reads what
            you type — try <code>pay rego fri 3pm !high @car</code>, or{' '}
            <code>stretch every day</code> to make something repeat.
          </p>
          <p className="hint" style={{ margin: 0 }}>
            Today then sorts itself: overdue and flagged work first, the rest of
            today under it, the week ahead below that.
          </p>
          <Link className="btn btn--small" style={{ marginTop: 12 }} to="/help">
            How the rest of it works
          </Link>
        </div>
      )}

      {nothing && tasks.length > 0 && (
        <EmptyState icon="today" title="Nothing needs you today" hint="Capture something and it will show up here." />
      )}

      {/* Four sections, four different questions — each decided by the task's
          date, not by how much room is left in the day. The hints are on
          screen because a section whose rule you have to guess is a section
          you stop trusting. */}
      <Section title="Must" hint="Overdue, and today's flagged work." tasks={plan.must} />
      <Section
        title="Should"
        hint="Also due today."
        tasks={plan.should}
        collapsed={collapse}
      />
      <Section
        title="Coming up"
        hint="The next seven days, and the dates worth knowing about."
        tasks={plan.comingUp}
        collapsed={collapse}
      />
      <Section
        title="If there's time"
        hint="Open work with no date on it."
        tasks={plan.ifTime}
        collapsed={collapse}
      />

      {/* Shown from the first tick of the week, so the Logbook is always a
          tap away — even on a morning when nothing is done yet. */}
      {(doneToday.length > 0 || thisWeek > 0) && (
        <DoneCard doneToday={doneToday} thisWeek={thisWeek} />
      )}
    </main>
  )
}

/**
 * `collapsed` starts the section folded rather than hiding it: the count is
 * still on screen, and opening it is one tap. Nothing is ever removed from
 * Today — the whole point of the plan is that it tells you the truth about
 * how much there is.
 */
function Section({
  title,
  hint,
  tasks,
  collapsed = false,
}: {
  title: string
  hint: string
  tasks: Task[]
  collapsed?: boolean
}) {
  // Starts false rather than `!collapsed`: the settings row arrives a moment
  // after mount, so the theme — and with it `collapsed` — flips from under us.
  // Initial state would have been captured before the flip and stuck open.
  const [open, setOpen] = useState(false)
  if (tasks.length === 0) return null

  if (!collapsed) {
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    )
  }

  return (
    <div className="card">
      <button className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {title} · {tasks.length}
        </span>
        <Icon name="plus" small />
      </button>
      {open && (
        <>
          <p className="hint">{hint}</p>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </>
      )}
    </div>
  )
}
