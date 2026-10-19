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
 * already has a later one waiting — another open occurrence, dated after this
 * one and not itself in the past. Tuesday's bins moved onto Wednesday would
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
  // The latest open, not-yet-past occurrence of each series.
  const latest = new Map<string, string>()
  for (const t of all) {
    if (t.series_id === null || t.status !== 'open' || t.due_on === null) continue
    if (compareISO(t.due_on, today) < 0) continue
    const held = latest.get(t.series_id)
    if (!held || compareISO(t.due_on, held) > 0) latest.set(t.series_id, t.due_on)
  }

  const move: T[] = []
  const skip: T[] = []
  for (const t of overdue) {
    const next = t.series_id !== null ? latest.get(t.series_id) : undefined
    if (next && t.due_on !== null && compareISO(next, t.due_on) > 0) skip.push(t)
    else move.push(t)
  }
  return { move, skip }
}
