// Calendar geometry: which days go in which cell, and how overlapping blocks
// share the width of a day column. Pure arithmetic, no rendering.

import { addDays, isoOf, startOfWeek } from './day'
import type { ISODate } from './day'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * A month as 6 rows of 7 days, including the leading and trailing days that
 * belong to neighbouring months.
 *
 * Always six rows, even for a 28-day February that only needs four or five.
 * A grid that changes height as you page through months makes everything below
 * it jump, which on a phone means the thing you were about to tap moves.
 */
export function monthGrid(anyDayInMonth: ISODate, weekStartsOn = 1): ISODate[][] {
  const [year, month] = anyDayInMonth.split('-').map(Number)
  const first = startOfWeek(isoOf(year, month, 1), weekStartsOn)

  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(first, row * 7 + col)),
  )
}

/** The seven days of the week containing `iso`. */
export function weekDays(iso: ISODate, weekStartsOn = 1): ISODate[] {
  const first = startOfWeek(iso, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

export function monthLabel(iso: ISODate): string {
  const [year, month] = iso.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export interface TimedItem {
  id: string
  /** Minutes from midnight. */
  start: number
  end: number
}

export interface TimedLayout {
  id: string
  /** Which column within its overlap group, 0-based. */
  column: number
  /** How many columns that group needs — the item's width is 1/columns. */
  columns: number
}

/**
 * Interval-overlap column packing: the standard day-view layout.
 *
 * Items are grouped into clusters of things that actually collide, each cluster
 * is packed into the fewest columns that keep them apart, and every item in a
 * cluster reports the cluster's width. Two meetings at opposite ends of the day
 * therefore stay full width instead of both shrinking to half.
 *
 * Touching intervals (one ends exactly when the next begins) do not overlap.
 */
export function layoutTimedItems(items: TimedItem[]): TimedLayout[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: TimedLayout[] = []

  let cluster: { item: TimedItem; column: number }[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const columns = Math.max(...cluster.map((c) => c.column)) + 1
    for (const { item, column } of cluster) out.push({ id: item.id, column, columns })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    // A gap with nothing running means the previous cluster is closed.
    if (item.start >= clusterEnd) flush()

    // First column free at this instant; a column frees up as soon as the item
    // occupying it has ended.
    const taken = new Set(
      cluster.filter((c) => c.item.end > item.start).map((c) => c.column),
    )
    let column = 0
    while (taken.has(column)) column++

    cluster.push({ item, column })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()

  return out
}
