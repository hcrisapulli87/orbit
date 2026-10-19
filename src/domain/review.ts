// The arithmetic behind the evening wrap-up and the weekly review.
//
// Both screens are things you can open, not rituals you're marched through:
// nothing here asks for an estimate, a rating or a reflection. They only
// answer questions the data already holds — what got done, what's left, how
// full the coming days are, what has been sitting untouched.

import { addDays, compareISO, daysBetween, startOfWeek, toLocalISODate } from './day'
import type { ISODate } from './day'
import { defaultEstimateFor, isDeferred } from './planner'
import type { Plannable } from './planner'

export interface Reviewable extends Plannable {
  title: string
  parent_id: string | null
  series_id: string | null
  completed_on: string | null
}

/** Minutes of open work due on `day`, by the same estimates Today uses. */
export function dayLoad(tasks: Reviewable[], day: ISODate): number {
  return tasks
    .filter((t) => t.status === 'open' && t.kind !== 'event' && t.due_on === day && !isDeferred(t, day))
    .reduce((sum, t) => sum + defaultEstimateFor(t), 0)
}

export interface DayAhead {
  day: ISODate
  plannedMin: number
  capacityMin: number
  /** Minutes over capacity; 0 when it fits. */
  overMin: number
}

/**
 * The next `count` days, each with its planned minutes against its capacity.
 * `capacityFor` is the caller's — it knows the weekday budgets and the
 * meetings — so this stays a plain sum.
 */
export function daysAhead(
  tasks: Reviewable[],
  from: ISODate,
  count: number,
  capacityFor: (day: ISODate) => number,
): DayAhead[] {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(from, i)
    const plannedMin = dayLoad(tasks, day)
    const capacityMin = capacityFor(day)
    return { day, plannedMin, capacityMin, overMin: Math.max(0, plannedMin - capacityMin) }
  })
}

/**
 * Done tasks in [from, to], counted by whatever `groupOf` says they belong to
 * (an area, in practice), busiest first. Null is "not filed anywhere".
 */
export function doneBy<T extends Reviewable>(
  tasks: T[],
  from: ISODate,
  to: ISODate,
  groupOf: (t: T) => string | null,
): { group: string | null; count: number }[] {
  const counts = new Map<string | null, number>()
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completed_on) continue
    if (compareISO(t.completed_on, from) < 0 || compareISO(t.completed_on, to) > 0) continue
    const g = groupOf(t)
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Undated one-off work that has been sitting for `olderThan` days or more —
 * the backlog that quietly stops meaning anything. Oldest first, so the
 * review starts with what's most likely to be dropped.
 */
export function staleUndated<T extends Reviewable>(tasks: T[], today: ISODate, olderThan = 30): T[] {
  const age = (t: T) => daysBetween(toLocalISODate(new Date(t.created_at)), today)
  return tasks
    .filter((t) =>
      t.status === 'open' && t.kind === 'task' && t.due_on === null &&
      t.parent_id === null && t.series_id === null && age(t) >= olderThan,
    )
    .sort((a, b) => age(b) - age(a))
}

/**
 * For one repeating thing: of the days it was scheduled in [from, to] that
 * have already arrived, how many were done.
 */
export function scheduledVsDone(
  scheduled: ISODate[],
  completed: Set<string>,
  from: ISODate,
  to: ISODate,
  today: ISODate,
): { due: number; done: number } {
  const last = compareISO(to, today) < 0 ? to : today
  const days = scheduled.filter((d) => compareISO(d, from) >= 0 && compareISO(d, last) <= 0)
  return { due: days.length, done: days.filter((d) => completed.has(d)).length }
}

/**
 * Which week a review covers. Opened on a Monday, "the week" would be a few
 * hours old, so it means the week that just ended; any other day, the week so
 * far. Inclusive bounds, Monday start.
 */
export function reviewWeek(today: ISODate): { from: ISODate; to: ISODate } {
  const monday = startOfWeek(today, 1)
  return monday === today
    ? { from: addDays(monday, -7), to: addDays(monday, -1) }
    : { from: monday, to: today }
}

/**
 * Whether to offer the wrap-up on Today: from four hours before the day's
 * end, which is late afternoon for the default 21:00.
 */
export function wrapUpTime(nowMin: number, dayEndMin: number): boolean {
  return nowMin >= dayEndMin - 240
}
