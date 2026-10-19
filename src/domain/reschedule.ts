// Moving overdue work in one go.
//
// The overdue banner used to be a count with nothing you could do about it, so
// the Must section filled up and stayed full. Rescheduling everything is one
// tap — with one exception, because moving a missed repeat is wrong.

import { compareISO } from './day'
import type { ISODate } from './day'

/** The fields the decision reads. A stored Task satisfies it. */
export interface Reschedulable {
  id: string
  status: 'open' | 'done' | 'dropped'
  due_on: string | null
  series_id: string | null
}

/**
 * Split the overdue list into what moves to `target` and what is skipped.
 *
 * A missed occurrence of something that repeats is skipped when the series
 * already has a later one waiting — Tuesday's bins moved onto Wednesday would
 * sit next to Wednesday's own, and a daily habit would stack up one copy per
 * missed day. Skipped means marked dropped: it didn't happen, and the streak
 * already counts it that way. A repeat with nothing later (one that schedules
 * itself from completion, or a series that has ended) moves like any task.
 */
export function planReschedule<T extends Reschedulable>(
  overdue: T[],
  all: T[],
  today: ISODate,
): { move: T[]; skip: T[] } {
  const waiting = new Set(
    all
      .filter((t) => t.series_id !== null && t.status === 'open' && t.due_on !== null)
      .filter((t) => compareISO(t.due_on!, today) >= 0)
      .map((t) => t.series_id!),
  )

  const move: T[] = []
  const skip: T[] = []
  for (const t of overdue) {
    if (t.series_id !== null && waiting.has(t.series_id)) skip.push(t)
    else move.push(t)
  }
  return { move, skip }
}
