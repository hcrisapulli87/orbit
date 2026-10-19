// The Logbook: what you've already done, a day at a time.
//
// Completions were recorded all along (completed_on is the local calendar day,
// completed_at the instant) but nothing ever showed them past the end of today.
// Seeing the pile of finished things is a large part of why a list feels worth
// keeping.

import { addDays, compareISO, startOfWeek } from './day'
import type { ISODate } from './day'

/** The fields the Logbook reads. A stored Task satisfies it. */
export interface Completed {
  id: string
  status: 'open' | 'done' | 'dropped'
  completed_on: string | null
  completed_at: string | null
}

export interface LogDay<T> {
  day: ISODate
  tasks: T[]
}

const isDone = <T extends Completed>(t: T): t is T & { completed_on: string } =>
  t.status === 'done' && t.completed_on !== null

/**
 * Done tasks grouped by the day they were done, newest day first and newest
 * tick first within it. Duplicates by id are dropped, so a page fetched from
 * the server can be merged over the in-memory window without double-counting
 * the day where the two meet.
 */
export function groupByDay<T extends Completed>(tasks: T[]): LogDay<T>[] {
  const seen = new Set<string>()
  const byDay = new Map<ISODate, T[]>()

  for (const t of tasks) {
    if (!isDone(t) || seen.has(t.id)) continue
    seen.add(t.id)
    const list = byDay.get(t.completed_on) ?? []
    list.push(t)
    byDay.set(t.completed_on, list)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => compareISO(b, a))
    .map(([day, list]) => ({
      day,
      tasks: list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    }))
}

/** How many things were done this week and last, Monday-start like the rest of the app. */
export function weekTally<T extends Completed>(
  tasks: T[],
  today: ISODate,
  weekStartsOn = 1,
): { thisWeek: number; lastWeek: number } {
  const thisStart = startOfWeek(today, weekStartsOn)
  const lastStart = addDays(thisStart, -7)
  let thisWeek = 0
  let lastWeek = 0
  for (const t of tasks) {
    if (!isDone(t)) continue
    if (compareISO(t.completed_on, thisStart) >= 0 && compareISO(t.completed_on, today) <= 0) thisWeek++
    else if (compareISO(t.completed_on, lastStart) >= 0 && compareISO(t.completed_on, thisStart) < 0) lastWeek++
  }
  return { thisWeek, lastWeek }
}

/**
 * Turn one page of history into whole days.
 *
 * The page comes back newest first and cut at `limit` rows, so its oldest day
 * may be only partly there. That day is held back and becomes the cursor for
 * the next page, where it arrives complete. A short page means history has run
 * out. A full page that is all one day can't be split that way, so it is kept
 * whole and the cursor moves past it.
 *
 * The cursor is inclusive: the next page asks for completed_on <= cursor.
 */
export function wholeDays<T extends Completed>(
  page: T[],
  limit: number,
): { kept: T[]; cursor: ISODate | null; exhausted: boolean } {
  if (page.length < limit) return { kept: page, cursor: null, exhausted: true }

  const oldest = page[page.length - 1].completed_on
  if (oldest === null) return { kept: page, cursor: null, exhausted: true }

  const kept = page.filter((t) => t.completed_on !== oldest)
  if (kept.length === 0) return { kept: page, cursor: addDays(oldest, -1), exhausted: false }
  return { kept, cursor: oldest, exhausted: false }
}
