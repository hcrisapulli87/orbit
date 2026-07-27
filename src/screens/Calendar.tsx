import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { DayColumn, HOUR_PX, minutesToTime, timedEntriesFor } from '../components/calendar/DayColumn'
import { useData } from '../data/DataProvider'
import { monthGrid, monthLabel, weekDays } from '../domain/calendarGrid'
import { addDays, addMonthsClamped, formatTime, parseTimeToMinutes, relativeLabel, todayISO } from '../domain/day'
import type { Task } from '../data/types'

type View = 'day' | 'week' | 'month'

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function Calendar() {
  const { tasks, settings } = useData()
  const today = todayISO()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(today)

  // One pass over the working set; every view reads from this.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_on) continue
      const list = map.get(t.due_on) ?? []
      list.push(t)
      map.set(t.due_on, list)
    }
    return map
  }, [tasks])

  const dayStartMin = parseTimeToMinutes(settings.day_start) ?? 480
  const dayEndMin = parseTimeToMinutes(settings.day_end) ?? 1260

  const step = (dir: number) => {
    if (view === 'month') setCursor(addMonthsClamped(cursor, dir, 1))
    else setCursor(addDays(cursor, dir * (view === 'week' ? 7 : 1)))
  }

  const heading =
    view === 'month' ? monthLabel(cursor)
    : view === 'week' ? `Week of ${relativeLabel(weekDays(cursor)[0], today)}`
    : relativeLabel(cursor, today)

  return (
    <main className="screen">
      <ScreenHeader title="Calendar" />

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />

      <div className="row--between pager">
        <button className="btn btn--small" onClick={() => step(-1)} aria-label="Previous">
          ‹
        </button>
        <strong>{heading}</strong>
        <button className="btn btn--small" onClick={() => step(1)} aria-label="Next">
          ›
        </button>
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          today={today}
          byDay={byDay}
          onPick={(d) => {
            setCursor(d)
            setView('day')
          }}
        />
      )}

      {view === 'week' && (
        <WeekView
          cursor={cursor}
          today={today}
          byDay={byDay}
          dayStartMin={dayStartMin}
          dayEndMin={dayEndMin}
          onPick={(d) => {
            setCursor(d)
            setView('day')
          }}
        />
      )}

      {view === 'day' && (
        <DayView date={cursor} byDay={byDay} dayStartMin={dayStartMin} dayEndMin={dayEndMin} />
      )}
    </main>
  )
}

function MonthView({
  cursor,
  today,
  byDay,
  onPick,
}: {
  cursor: string
  today: string
  byDay: Map<string, Task[]>
  onPick: (date: string) => void
}) {
  const grid = monthGrid(cursor)
  const cursorMonth = cursor.slice(0, 7)

  return (
    <div className="card">
      <div className="monthgrid monthgrid--head">
        {DAY_INITIALS.map((d, i) => (
          <span key={i} className="muted">
            {d}
          </span>
        ))}
      </div>
      <div className="monthgrid">
        {grid.flat().map((date) => {
          const items = byDay.get(date) ?? []
          const open = items.filter((t) => t.status === 'open')
          return (
            <button
              key={date}
              className={[
                'monthcell',
                date.slice(0, 7) === cursorMonth ? '' : 'monthcell--outside',
                date === today ? 'monthcell--today' : '',
              ].join(' ')}
              onClick={() => onPick(date)}
            >
              <span className="monthcell__num">{Number(date.slice(8))}</span>
              {/* Pips rather than titles: at this size a truncated title tells
                  you less than "three things, one of them a birthday". */}
              <span className="monthcell__pips">
                {items.slice(0, 3).map((t) => (
                  <i
                    key={t.id}
                    className={`pip pip--cal${t.kind === 'event' ? ' pip--event' : ''}${
                      t.status === 'done' ? ' pip--done' : ''
                    }`}
                  />
                ))}
                {open.length > 3 && <em className="monthcell__more">+{open.length - 3}</em>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  cursor,
  today,
  byDay,
  dayStartMin,
  dayEndMin,
  onPick,
}: {
  cursor: string
  today: string
  byDay: Map<string, Task[]>
  dayStartMin: number
  dayEndMin: number
  onPick: (date: string) => void
}) {
  const days = weekDays(cursor)

  return (
    <div className="card">
      <div className="weekgrid">
        <div className="weekgrid__gutter">
          {hourLabels(dayStartMin, dayEndMin).map((label, i) => (
            <span key={label} className="weekgrid__hour" style={{ top: i * HOUR_PX - 7 }}>
              {label}
            </span>
          ))}
        </div>
        {days.map((date) => {
          const items = byDay.get(date) ?? []
          return (
            <div className="weekgrid__day" key={date}>
              <button
                className={`weekgrid__head${date === today ? ' weekgrid__head--today' : ''}`}
                onClick={() => onPick(date)}
              >
                {DAY_INITIALS[days.indexOf(date)]}
                <strong>{Number(date.slice(8))}</strong>
              </button>
              <DayColumn
                entries={timedEntriesFor(items)}
                dayStartMin={dayStartMin}
                dayEndMin={dayEndMin}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({
  date,
  byDay,
  dayStartMin,
  dayEndMin,
}: {
  date: string
  byDay: Map<string, Task[]>
  dayStartMin: number
  dayEndMin: number
}) {
  const items = byDay.get(date) ?? []
  const untimed = items.filter((t) => !t.due_time)
  const entries = timedEntriesFor(items)

  return (
    <>
      <div className="card">
        <h2>All day</h2>
        {untimed.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing without a time.
          </p>
        ) : (
          untimed.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>

      <div className="card">
        <h2>{formatTime(minutesToTime(dayStartMin))} – {formatTime(minutesToTime(dayEndMin))}</h2>
        <div className="weekgrid weekgrid--single">
          <div className="weekgrid__gutter">
            {hourLabels(dayStartMin, dayEndMin).map((label, i) => (
              <span key={label} className="weekgrid__hour" style={{ top: i * HOUR_PX - 7 }}>
                {label}
              </span>
            ))}
          </div>
          <div className="weekgrid__day">
            <DayColumn entries={entries} dayStartMin={dayStartMin} dayEndMin={dayEndMin} />
          </div>
        </div>
      </div>
    </>
  )
}

function hourLabels(startMin: number, endMin: number): string[] {
  const count = Math.max(1, Math.ceil((endMin - startMin) / 60))
  return Array.from({ length: count }, (_, i) => formatTime(minutesToTime(startMin + i * 60)))
}
