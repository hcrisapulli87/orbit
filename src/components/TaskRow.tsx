import { Link } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { addDays, compareISO, daysBetween, formatTime, relativeLabel, todayISO } from '../domain/day'
import { SWIPE_TRIGGER } from '../domain/swipe'
import { useSwipe } from './useSwipe'
import type { Task } from '../data/types'

/**
 * One task line: tap target, title, and only the metadata that exists.
 *
 * Events (birthdays, anniversaries) get no checkbox and never read as overdue —
 * that is the whole behavioural difference between kind='event' and kind='task'.
 *
 * Swipe right to tick it off (or back on), left to push an open task to
 * tomorrow. Both leave an undo toast behind. Events don't swipe: there's
 * nothing to tick, and a birthday doesn't move.
 */
export function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const { projects, tasks, toggleTask, snoozeTask } = useData()
  const today = todayISO()
  const tomorrow = addDays(today, 1)
  const children = tasks.filter((t) => t.parent_id === task.id)
  const done = task.status === 'done'
  const isEvent = task.kind === 'event'
  const project = showProject ? projects.find((p) => p.id === task.project_id) : undefined
  const overdue = !done && !isEvent && task.due_on !== null && compareISO(task.due_on, today) < 0

  // Snoozing something already due tomorrow would be a swipe that does nothing.
  const canSnooze = !isEvent && !done && task.due_on !== tomorrow
  const swipe = useSwipe({
    onRight: isEvent ? undefined : () => void toggleTask(task),
    onLeft: canSnooze ? () => void snoozeTask(task, tomorrow) : undefined,
  })
  const armed = Math.abs(swipe.offset) >= SWIPE_TRIGGER

  return (
    <div className="swipe" {...swipe.handlers}>
      {swipe.offset !== 0 && (
        <div
          className={`swipe__under swipe__under--${swipe.offset > 0 ? 'right' : 'left'}${armed ? ' swipe__under--armed' : ''}`}
          aria-hidden="true"
        >
          {swipe.offset > 0 ? (done ? 'Not done' : 'Done') : 'Tomorrow'}
        </div>
      )}
      <div
        className={`task-row${done ? ' task-row--done' : ''}${swipe.dragging ? ' task-row--dragging' : ''}`}
        style={swipe.offset !== 0 ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {isEvent ? (
          <span className="check check--event" aria-hidden="true">
            <span className="check__box">🎂</span>
          </span>
        ) : (
          <button
            className={`check${done ? ' check--done' : ''}`}
            onClick={() => void toggleTask(task)}
            aria-pressed={done}
            aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          >
            <span className="check__box">{done ? '✓' : ''}</span>
          </button>
        )}

        <div className="task-row__body">
          <Link className="task-row__title" to={`/task/${task.id}`}>
            {task.title}
          </Link>
          <p className="task-row__meta">
            {task.priority >= 2 && <span className={`pip pip--${task.priority}`} aria-hidden="true" />}
            {task.due_on && (
              <span
                className={`chip${overdue ? ' chip--overdue' : task.due_on === today ? ' chip--today' : ''}`}
              >
                {relativeLabel(task.due_on, today)}
                {task.due_time && ` · ${formatTime(task.due_time)}`}
              </span>
            )}
            {/* A birthday two months out is only useful as a countdown — the
                date alone doesn't tell you how long you have to buy something. */}
            {isEvent && task.due_on && daysBetween(today, task.due_on) > 1 && (
              <span className="chip">in {daysBetween(today, task.due_on)} days</span>
            )}
            {project && (
              <span className="chip">
                {project.icon} {project.name}
              </span>
            )}
            {task.tags.map((tag) => (
              <span className="chip" key={tag}>
                #{tag}
              </span>
            ))}
            {children.length > 0 && (
              <span className="chip">
                ☑ {children.filter((c) => c.status === 'done').length}/{children.length}
              </span>
            )}
            {task.parse_confidence === 'low' && <span className="chip chip--guess">guess</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
