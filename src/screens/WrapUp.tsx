import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EventList } from '../components/calendar/EventList'
import { useData } from '../data/DataProvider'
import { useDayCapacity } from '../data/useDayCapacity'
import { addDays, startOfWeek, todayISO } from '../domain/day'
import { buildToday } from '../domain/planner'
import { dayLoad } from '../domain/review'
import type { Task } from '../data/types'

const hours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`

/**
 * End the day: see what got done, decide about what didn't, look at tomorrow.
 *
 * The decisions are one tap each and every one can be undone, because the
 * point is to close the day in a minute, not to hold a meeting with yourself.
 * Nothing left open is moved without being asked — "Move all to tomorrow" is
 * a button, not a default.
 */
export default function WrapUp() {
  const navigate = useNavigate()
  const { tasks, series, calendarSlices, rescheduleOverdue, snoozeTask, patchTask, dropTask } = useData()
  const capacity = useDayCapacity()
  const today = todayISO()
  const tomorrow = addDays(today, 1)
  const nextWeek = addDays(startOfWeek(today, 1), 7)

  const plannable = useMemo(() => {
    const leadById = new Map(series.map((s) => [s.id, s.lead_days]))
    return tasks.map((t) => ({ ...t, lead_days: t.series_id ? leadById.get(t.series_id) ?? 0 : 0 }))
  }, [tasks, series])

  // Open and due today or earlier: exactly Today's Must and Should.
  const plan = buildToday(plannable, { today, capacityMin: 0 })
  const left = [...plan.must, ...plan.should]
  const done = tasks.filter((t) => t.status === 'done' && t.completed_on === today)

  const tomorrowTasks = tasks.filter((t) => t.status === 'open' && t.due_on === tomorrow && t.kind !== 'event')
  const tomorrowEvents = calendarSlices.filter((s) => s.day === tomorrow)
  const tomorrowCap = capacity(tomorrow)
  const tomorrowLoad = dayLoad(plannable, tomorrow)

  const decide = (t: Task) => (
    <div className="triage" style={{ marginTop: 0, marginBottom: 8 }}>
      <button className="chip chip--action" onClick={() => void snoozeTask(t, tomorrow)}>Tomorrow</button>
      <button className="chip chip--action" onClick={() => void snoozeTask(t, nextWeek)}>Next week</button>
      <button className="chip chip--action" onClick={() => void patchTask(t.id, { due_on: null, due_time: null })}>
        No date
      </button>
      <button className="chip chip--action" onClick={() => void dropTask(t)}>Drop</button>
    </div>
  )

  return (
    <main className="screen">
      <ScreenHeader
        title="Wrap up"
        sub="Close today, glance at tomorrow"
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <div className="card">
        <h2>Done today · {done.length}</h2>
        {done.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Nothing ticked off today. Some days are like that.</p>
        ) : (
          done.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>

      <div className="card">
        <div className="row--between" style={{ marginBottom: left.length ? 4 : 0 }}>
          <h2 style={{ margin: 0 }}>Still open · {left.length}</h2>
          {left.length > 1 && (
            <button className="chip chip--action" onClick={() => void rescheduleOverdue(left, tomorrow)}>
              Move all to tomorrow
            </button>
          )}
        </div>
        {left.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Everything due today is dealt with.</p>
        ) : (
          <>
            <p className="hint">
              Tomorrow, next week, no date for now, or let it go. A missed repeat
              is skipped when its next one is already on the list.
            </p>
            {left.map((t) => (
              <div key={t.id}>
                <TaskRow task={t} />
                {decide(t)}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Tomorrow</h2>
        <p className="hint">
          {hours(tomorrowLoad)} of work due against {hours(tomorrowCap.capacityMin)} of room
          {tomorrowCap.meetingMin > 0 && `, around ${hours(tomorrowCap.meetingMin)} of meetings`}.
          {tomorrowLoad > tomorrowCap.capacityMin && (
            <span className="warn"> That’s {hours(tomorrowLoad - tomorrowCap.capacityMin)} too much already.</span>
          )}
        </p>
        <EventList slices={tomorrowEvents} />
        {tomorrowTasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {tomorrowEvents.length === 0 && tomorrowTasks.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>Nothing on yet.</p>
        )}
      </div>

      <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => navigate('/')}>
        Done for today
      </button>
    </main>
  )
}
