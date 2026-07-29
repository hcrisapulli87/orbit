import { useState } from 'react'
import { useData } from '../../data/DataProvider'
import { formatTime, minutesToTime, parseTimeToMinutes } from '../../domain/day'
import type { Block } from '../../data/types'

/**
 * Edit one block: what it is, when it runs, and whether it should exist.
 *
 * Shared by the calendar and by Today's "Blocked out" card, so a block behaves
 * the same wherever you meet it. Everything here goes through patchBlock, which
 * promotes a planner suggestion to a hand-placed block on the way out — moving
 * a suggestion is how you adopt it, and the next auto-plan has to leave it
 * alone afterwards.
 *
 * A block with a title and no task is an ordinary calendar event. That's the
 * whole of "use the calendar as a calendar": the row already had a start, an
 * end and a label, and nothing needed inventing.
 */
export function BlockSheet({ block, onClose }: { block: Block; onClose: () => void }) {
  const { tasks, patchBlock, removeBlock } = useData()

  const linked = block.task_id ? tasks.find((t) => t.id === block.task_id) : undefined
  const [title, setTitle] = useState(block.label)
  const [start, setStart] = useState(block.start_time.slice(0, 5))
  const [end, setEnd] = useState(block.end_time.slice(0, 5))
  const [allDay, setAllDay] = useState(block.all_day)

  const save = async () => {
    const startMin = parseTimeToMinutes(start)
    const endMin = parseTimeToMinutes(end)
    // An all-day block still carries times, so the database's end-after-start
    // check needs nothing special and the grid has something to lay out if the
    // flag is ever turned back off.
    const times = allDay
      ? { start_time: '00:00', end_time: '23:59' }
      : startMin !== null && endMin !== null && endMin > startMin
        ? { start_time: minutesToTime(startMin), end_time: minutesToTime(endMin) }
        : {}

    await patchBlock(block.id, { label: title.trim(), all_day: allDay, ...times })
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Edit this block">
      <div className="sheet__panel">
        <div className="row--between">
          <strong>{linked ? linked.title : title || 'Blocked time'}</strong>
          <button className="btn btn--small" onClick={onClose}>
            Cancel
          </button>
        </div>

        {block.source === 'planner' && (
          <p className="hint" style={{ marginTop: 10 }}>
            Auto-planned. Changing it here makes it yours, and the next auto-plan
            will leave it where you put it.
          </p>
        )}

        <label className="row--between setting-row">
          <span>Title</span>
          <input
            className="input input--time"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={linked ? linked.title : 'Busy'}
            aria-label="Title"
          />
        </label>

        <label className="row--between setting-row">
          <span>All day</span>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            aria-label="All day"
          />
        </label>

        {!allDay && (
          <>
            <label className="row--between setting-row">
              <span>From</span>
              <input
                className="input input--time"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="row--between setting-row">
              <span>To</span>
              <input
                className="input input--time"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </>
        )}

        {linked && (
          <p className="hint" style={{ marginTop: 10 }}>
            Held for “{linked.title}”. Removing this block doesn't touch the task.
          </p>
        )}

        <div className="row--between" style={{ marginTop: 14 }}>
          <button
            className="btn btn--small"
            style={{ color: 'var(--danger-strong)' }}
            onClick={async () => {
              await removeBlock(block.id)
              onClose()
            }}
          >
            Delete
          </button>
          <button className="btn btn--small" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/** "9:00 am – 10:30 am", or "All day". One label, used by every block list. */
export function blockRange(block: Block): string {
  if (block.all_day) return 'All day'
  return `${formatTime(block.start_time)}–${formatTime(block.end_time)}`
}
