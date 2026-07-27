import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { DayColumn, HOUR_PX, timedEntriesFor } from '../components/calendar/DayColumn'
import { useData } from '../data/DataProvider'
import { monthGrid, monthLabel, weekDays } from '../domain/calendarGrid'
import {
  addDays, addMonthsClamped, formatTime, minutesToTime, parseTimeToMinutes, relativeLabel, todayISO,
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

  return (
    <div className="card">
      <div className="weekgrid">
        <div className="weekgrid__gutter">
          {/* Matches the day-header height, so the labels line up with the rows. */}
          <div className="weekgrid__headspacer" aria-hidden="true" />
          <HourLabels startMin={dayStartMin} endMin={dayEndMin} />
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
                entries={[
                  ...timedEntriesFor(items),
                  ...blockEntries(blocksByDay.get(date) ?? [], tasks),
                ]}
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
  const { addBlock, removeBlock } = useData()
  const [slot, setSlot] = useState<number | null>(null)

  const items = byDay.get(date) ?? []
  const untimed = items.filter((t) => !t.due_time)
  const entries = [...timedEntriesFor(items), ...blockEntries(blocks, tasks)]

  // What you'd plausibly block out: this day's open work, then anything else
  // still open. No search box — the list is short enough to scan.
  const candidates = [
    ...items.filter((t) => t.status === 'open' && t.kind !== 'event'),
    ...tasks.filter((t) => t.status === 'open' && t.kind !== 'event' && t.due_on !== date),
  ].slice(0, 12)

  const block = async (task: Task | null) => {
    if (slot === null) return
    await addBlock({
      on_date: date,
      start_time: minutesToTime(slot),
      end_time: minutesToTime(Math.min(slot + 60, 24 * 60 - 1)),
      task_id: task?.id ?? null,
      label: task ? '' : 'Busy',
      source: 'manual',
    })
    setSlot(null)
  }

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
            <HourLabels startMin={dayStartMin} endMin={dayEndMin} />
          </div>
          <div className="weekgrid__day">
            <DayColumn
              entries={entries}
              dayStartMin={dayStartMin}
              dayEndMin={dayEndMin}
              onSlotTap={setSlot}
            />
          </div>
        </div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.75rem' }}>
          Tap an empty hour to block it out.
        </p>
      </div>

      {blocks.length > 0 && (
        <div className="card">
          <h2>Blocks</h2>
          {blocks.map((b) => (
            <div className="row--between setting-row" key={b.id}>
              <span>
                <strong>{formatTime(b.start_time)}</strong>{' '}
                {b.label || tasks.find((t) => t.id === b.task_id)?.title || 'Blocked'}
                {b.source === 'planner' && <span className="muted"> · auto</span>}
              </span>
              <button className="btn btn--small" onClick={() => void removeBlock(b.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {slot !== null && (
        <div className="sheet" role="dialog" aria-label="Block out time">
          <div className="sheet__panel">
            <div className="row--between">
              <strong>Block {formatTime(minutesToTime(slot))}</strong>
              <button className="btn btn--small" onClick={() => setSlot(null)}>
                Cancel
              </button>
            </div>
            <div className="triage" style={{ marginTop: 12 }}>
              <button className="chip chip--action" onClick={() => void block(null)}>
                Busy
              </button>
              {candidates.map((t) => (
                <button key={t.id} className="chip chip--action" onClick={() => void block(t)}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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
