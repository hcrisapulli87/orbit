import { useData } from '../data/DataProvider'
import { compareISO, daysBetween, formatTime, relativeLabel, todayISO } from '../domain/day'
import type { Task } from '../data/types'

/**
 * One task line: tap target, title, and only the metadata that exists.
 *
 * Events (birthdays, anniversaries) get no checkbox and never read as overdue —
 * that is the whole behavioural difference between kind='event' and kind='task'.
 */
export function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const { projects, toggleTask } = useData()
  const today = todayISO()
  const done = task.status === 'done'
  const isEvent = task.kind === 'event'
  const project = showProject ? projects.find((p) => p.id === task.project_id) : undefined
  const overdue = !done && !isEvent && task.due_on !== null && compareISO(task.due_on, today) < 0

  return (
    <div className={`task-row${done ? ' task-row--done' : ''}`}>
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
        <p className="task-row__title">{task.title}</p>
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
          {task.parse_confidence === 'low' && <span className="chip chip--guess">guess</span>}
        </p>
      </div>
    </div>
  )
}
