import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { DayColumn, HOUR_PX, timedEntriesFor } from '../components/calendar/DayColumn'
import { BlockSheet, blockRange } from '../components/calendar/BlockSheet'
import { useData } from '../data/DataProvider'
import { monthGrid, monthLabel, visibleWindow, weekDays } from '../domain/calendarGrid'
import { withinHorizon } from '../domain/planner'
import {
  addDays, addMonthsClamped, compareISO, formatTime, minutesToTime, parseTimeToMinutes,
  relativeLabel, todayISO,
} from '../domain/day'
import type { Block, Task } from '../data/types'
import type { TimedEntry } from '../components/calendar/DayColumn'

type View = 'day' | 'week' | 'month'

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "27 Jul" — used for week spans, where a relative label would read oddly. */
const shortDate = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

/** A block becomes a timed entry; its title is its label or its task's. */
function blockEntries(blocks: Block[], tasks: Task[]): TimedEntry[] {
  return blocks.flatMap((b) => {
    const start = parseTimeToMinutes(b.start_time)
    const end = parseTimeToMinutes(b.end_time)
    if (start === null || end === null) return []
    const task = b.task_id ? tasks.find((t) => t.id === b.task_id) : undefined
    return [{
      id: b.id,
      title: b.label || task?.title || 'Blocked',
      startMin: start,
      endMin: end,
      kind: 'block' as const,
    }]
  })
}

export default function Calendar() {
  const { tasks, blocks, settings } = useData()
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

  const blocksByDay = useMemo(() => {
    const map = new Map<string, Block[]>()
    for (const b of blocks) {
      const list = map.get(b.on_date) ?? []
      list.push(b)
      map.set(b.on_date, list)
    }
    return map
  }, [blocks])

  const dayStartMin = parseTimeToMinutes(settings.day_start) ?? 480
  const dayEndMin = parseTimeToMinutes(settings.day_end) ?? 1260

  const step = (dir: number) => {
    if (view === 'month') setCursor(addMonthsClamped(cursor, dir, 1))
    else setCursor(addDays(cursor, dir * (view === 'week' ? 7 : 1)))
  }

  // "Week of Today" is what relativeLabel gives you when the week starts today,
  // which reads like a bug. Weeks get an explicit span instead.
  const week = weekDays(cursor)
  const heading =
    view === 'month' ? monthLabel(cursor)
    : view === 'week' ? `${shortDate(week[0])} – ${shortDate(week[6])}`
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
        <button className="btn btn--pager" onClick={() => step(-1)} aria-label="Previous">
          ‹
        </button>
        <strong>{heading}</strong>
        <button className="btn btn--pager" onClick={() => step(1)} aria-label="Next">
          ›
        </button>
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          today={today}
          byDay={byDay}
          blocksByDay={blocksByDay}
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
          blocksByDay={blocksByDay}
          tasks={tasks}
          dayStartMin={dayStartMin}
          dayEndMin={dayEndMin}
          onPick={(d) => {
            setCursor(d)
            setView('day')
          }}
        />
      )}

      {view === 'day' && (
        <DayView
          date={cursor}
          byDay={byDay}
          blocks={blocksByDay.get(cursor) ?? []}
          tasks={tasks}
          dayStartMin={dayStartMin}
          dayEndMin={dayEndMin}
        />
      )}
    </main>
  )
}

function MonthView({
  cursor,
  today,
  byDay,
  blocksByDay,
  onPick,
}: {
  cursor: string
  today: string
  byDay: Map<string, Task[]>
  blocksByDay: Map<string, Block[]>
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
          // Appointments were invisible at this zoom, which is most of why the
          // month didn't read as a calendar: a day with two meetings and no
          // tasks looked like an empty day.
          const items = [...(byDay.get(date) ?? []), ...(blocksByDay.get(date) ?? [])]
          const open = items.filter((t) => !('status' in t) || t.status === 'open')
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
                    className={`pip pip--cal${
                      'kind' in t && t.kind === 'event' ? ' pip--event' : ''
                    }${'status' in t && t.status === 'done' ? ' pip--done' : ''}${
                      'on_date' in t ? ' pip--block' : ''
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
  blocksByDay,
  tasks,
  dayStartMin,
  dayEndMin,
  onPick,
}: {
  cursor: string
  today: string
  byDay: Map<string, Task[]>
  blocksByDay: Map<string, Block[]>
  tasks: Task[]
  dayStartMin: number
  dayEndMin: number
  onPick: (date: string) => void
}) {
  const days = weekDays(cursor)

  // One window for all seven columns — computed from the whole week, so a
  // 6:30am Monday moves every column's grid rather than knocking Monday out of
  // alignment with the hour labels beside it.
  const entriesByDay = new Map(
    days.map((date) => [
      date,
      [
        ...timedEntriesFor(byDay.get(date) ?? []),
        ...blockEntries((blocksByDay.get(date) ?? []).filter((b) => !b.all_day), tasks),
      ],
    ]),
  )

  // Untimed work and all-day entries had nowhere to go in the week view at all,
  // so a whole day off read as an empty column.
  const allDayByDay = new Map(
    days.map((date) => [
      date,
      (byDay.get(date) ?? []).filter((t) => !t.due_time).length +
        (blocksByDay.get(date) ?? []).filter((b) => b.all_day).length,
    ]),
  )
  const { startMin, endMin } = visibleWindow(
    [...entriesByDay.values()].flat(),
    dayStartMin,
    dayEndMin,
  )

  return (
    <div className="card">
      <div className="weekgrid">
        <div className="weekgrid__gutter">
          {/* Matches the day-header height, so the labels line up with the rows. */}
          <div className="weekgrid__headspacer" aria-hidden="true" />
          <div className="weekgrid__allday weekgrid__allday--label muted">All day</div>
          <HourLabels startMin={startMin} endMin={endMin} />
        </div>
        {days.map((date) => {
          const allDay = allDayByDay.get(date) ?? 0
          return (
            <div className="weekgrid__day" key={date}>
              <button
                className={`weekgrid__head${date === today ? ' weekgrid__head--today' : ''}`}
                onClick={() => onPick(date)}
              >
                {DAY_INITIALS[days.indexOf(date)]}
                <strong>{Number(date.slice(8))}</strong>
              </button>
              <button className="weekgrid__allday" onClick={() => onPick(date)}>
                {allDay > 0 && <span className="weekgrid__alldaypip">{allDay}</span>}
              </button>
              <DayColumn
                entries={entriesByDay.get(date) ?? []}
                dayStartMin={startMin}
                dayEndMin={endMin}
                // Tapping an empty slot opens that day, where the whole
                // blocking-out flow already lives. Seven narrow columns is the
                // wrong place to pick a task off a chip list.
                onSlotTap={() => onPick(date)}
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
  blocks,
  tasks,
  dayStartMin,
  dayEndMin,
}: {
  date: string
  byDay: Map<string, Task[]>
  blocks: Block[]
  tasks: Task[]
  dayStartMin: number
  dayEndMin: number
}) {
  const navigate = useNavigate()
  const { patchBlock, patchTask } = useData()
  const [slot, setSlot] = useState<number | null>(null)
  const [editing, setEditing] = useState<Block | null>(null)

  const items = byDay.get(date) ?? []
  const untimed = items.filter((t) => !t.due_time)
  const allDayBlocks = blocks.filter((b) => b.all_day)
  const timedBlocks = blocks.filter((b) => !b.all_day)
  const entries = [...timedEntriesFor(items), ...blockEntries(timedBlocks, tasks)]
  const { startMin, endMin } = visibleWindow(entries, dayStartMin, dayEndMin)

  // Tap opens the thing itself; hold and drag moves it. A block moves by its
  // whole duration, a task by the time it's due at — the only two things a
  // calendar entry can be.
  const open = (entry: TimedEntry) => {
    if (entry.kind === 'block') {
      const b = blocks.find((x) => x.id === entry.id)
      if (b) setEditing(b)
    } else {
      navigate(`/task/${entry.id}`)
    }
  }

  const move = (entry: TimedEntry, startMin: number) => {
    if (entry.kind === 'block') {
      const length = entry.endMin - entry.startMin
      void patchBlock(entry.id, {
        start_time: minutesToTime(startMin),
        end_time: minutesToTime(Math.min(startMin + length, 24 * 60 - 1)),
      })
    } else {
      void patchTask(entry.id, { due_time: minutesToTime(startMin) })
    }
  }

  return (
    <>
      <div className="card">
        <h2>All day</h2>
        {untimed.length === 0 && allDayBlocks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing without a time.
          </p>
        ) : (
          <>
            {allDayBlocks.map((b) => (
              <button key={b.id} className="blockrow" onClick={() => setEditing(b)}>
                <span className="blockrow__when">All day</span>
                <span className="blockrow__what">{b.label || 'Blocked'}</span>
              </button>
            ))}
            {untimed.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>{formatTime(minutesToTime(startMin))} – {formatTime(minutesToTime(endMin))}</h2>
        <div className="weekgrid weekgrid--single">
          <div className="weekgrid__gutter">
            <HourLabels startMin={startMin} endMin={endMin} />
          </div>
          <div className="weekgrid__day">
            <DayColumn
              entries={entries}
              dayStartMin={startMin}
              dayEndMin={endMin}
              onSlotTap={setSlot}
              onOpen={open}
              onMove={move}
            />
          </div>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Tap an empty half-hour to put something in it. Tap anything already
          there to edit it, or hold and drag it to a new time.
        </p>
      </div>

      {blocks.length > 0 && (
        <div className="card">
          <h2>Blocks</h2>
          <p className="hint">Tap one to change the time, rename it or remove it.</p>
          {blocks.map((b) => (
            <button key={b.id} className="blockrow" onClick={() => setEditing(b)}>
              <span className="blockrow__when">{blockRange(b)}</span>
              <span className="blockrow__what">
                {b.label || tasks.find((t) => t.id === b.task_id)?.title || 'Blocked'}
              </span>
              {b.source === 'planner' && <span className="muted">auto</span>}
            </button>
          ))}
        </div>
      )}

      {editing && <BlockSheet block={editing} onClose={() => setEditing(null)} />}

      {slot !== null && (
        <NewEntrySheet date={date} startMin={slot} tasks={tasks} onClose={() => setSlot(null)} />
      )}
    </>
  )
}

const DURATIONS = [
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '90', label: '1½h' },
  { value: '120', label: '2h' },
]

/**
 * Put something in an empty slot.
 *
 * Three things you might mean, in the order you're likely to mean them: an
 * event with a name ("Dentist"), a task you're about to invent, or time held
 * for a task that already exists. The first is what makes the calendar usable
 * as an ordinary calendar; the second was missing entirely, so blocking out
 * time for something not yet captured meant leaving the screen.
 */
function NewEntrySheet({
  date,
  startMin,
  tasks,
  onClose,
}: {
  date: string
  startMin: number
  tasks: Task[]
  onClose: () => void
}) {
  const { addBlock, addTask, series } = useData()
  const today = todayISO()
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)

  /**
   * What you'd plausibly block out.
   *
   * Two filters the old list was missing, both of which the rest of the app
   * already applies. withinHorizon, because a series is materialised sixty days
   * ahead and twelve chips of the same daily habit is not a choice. And one
   * chip per series, because those sixty rows are the same job — the nearest
   * open one is the one you mean.
   */
  const candidates = useMemo(() => {
    const openWork = tasks
      .filter((t) => t.status === 'open' && t.kind !== 'event' && withinHorizon(t, today))
      .sort((a, b) => {
        // This day's work first, then by date, undated last.
        const own = Number(b.due_on === date) - Number(a.due_on === date)
        if (own !== 0) return own
        if (a.due_on === b.due_on) return 0
        if (a.due_on === null) return 1
        if (b.due_on === null) return -1
        return compareISO(a.due_on, b.due_on)
      })

    const seen = new Set<string>()
    return openWork
      .filter((t) => {
        if (!t.series_id) return true
        if (seen.has(t.series_id)) return false
        seen.add(t.series_id)
        return true
      })
      .slice(0, 12)
  }, [tasks, date, today])

  const place = async (taskId: string | null, label: string) => {
    setBusy(true)
    await addBlock({
      on_date: date,
      start_time: minutesToTime(startMin),
      end_time: minutesToTime(Math.min(startMin + minutes, 24 * 60 - 1)),
      task_id: taskId,
      label,
      source: 'manual',
      all_day: false,
    })
    setBusy(false)
    onClose()
  }

  /**
   * A new task takes the slot as its own due date, time and estimate, and gets
   * no block: a task with a time already occupies the grid, and blocking it as
   * well would draw the same thing twice. Auto-plan will pin it here for the
   * same reason.
   */
  const createTask = async () => {
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    await addTask({
      title: trimmed,
      due_on: date,
      due_time: minutesToTime(startMin),
      estimate_min: minutes,
    })
    setBusy(false)
    onClose()
  }

  const seriesTitles = new Map(series.map((s) => [s.id, s.title]))

  return (
    <div className="sheet" role="dialog" aria-label="Block out time">
      <div className="sheet__panel">
        <div className="row--between">
          <strong>{formatTime(minutesToTime(startMin))}</strong>
          <button className="btn btn--small" onClick={onClose}>
            Cancel
          </button>
        </div>

        <SegmentedControl
          value={String(minutes)}
          options={DURATIONS}
          onChange={(v) => setMinutes(Number(v))}
        />

        <label className="row--between setting-row">
          <span>Name it</span>
          <input
            className="input input--time"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dentist"
            aria-label="Name"
          />
        </label>

        <div className="row--between" style={{ marginTop: 10, gap: 8 }}>
          <button
            className="btn btn--small"
            disabled={busy || !title.trim()}
            onClick={() => void place(null, title.trim())}
          >
            Add as an event
          </button>
          <button
            className="btn btn--small"
            disabled={busy || !title.trim()}
            onClick={() => void createTask()}
          >
            Add as a task
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          An event just holds the time. A task gets a checkbox and shows up on
          Today.
        </p>

        <h2 style={{ marginTop: 16 }}>Or hold it for something already on the list</h2>
        <p className="hint">
          Open work from the next week. A repeating job appears once, not once
          per occurrence.
        </p>
        <div className="triage">
          <button className="chip chip--action" disabled={busy} onClick={() => void place(null, 'Busy')}>
            Just busy
          </button>
          {candidates.map((t) => (
            <button
              key={t.id}
              className="chip chip--action"
              disabled={busy}
              onClick={() => void place(t.id, '')}
            >
              {t.series_id && '🔁 '}
              {t.series_id ? seriesTitles.get(t.series_id) ?? t.title : t.title}
              {t.due_on && t.due_on !== date && (
                <span className="muted"> · {relativeLabel(t.due_on, today)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function HourLabels({ startMin, endMin }: { startMin: number; endMin: number }) {
  const count = Math.max(1, Math.ceil((endMin - startMin) / 60))
  return (
    <div className="weekgrid__hours">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="weekgrid__hour"
          // The nudge centres each label on its gridline, except the first,
          // which would otherwise be clipped by the top of the card.
          style={{ top: Math.max(0, i * HOUR_PX - 7) }}
        >
          {formatTime(minutesToTime(startMin + i * 60))}
        </span>
      ))}
    </div>
  )
}
