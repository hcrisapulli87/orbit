// A task pinned to a time that overlaps something else already in that time.
//
// Auto-plan never moves a pinned task — the time you chose is a fact about the
// day — so when a meeting lands on top of one, nothing in the plan will fix
// it. The least it can do is say so, on the task itself.

export interface Span {
  start: number
  end: number
  title: string
}

/**
 * The titles of everything in `others` that overlaps [start, end), in the
 * order they begin. Touching ends don't count: a task at 11:00 doesn't clash
 * with a meeting that finishes at 11:00.
 */
export function clashesWith(start: number, end: number, others: Span[]): string[] {
  return others
    .filter((o) => o.start < end && o.end > start)
    .sort((a, b) => a.start - b.start)
    .map((o) => o.title)
}

/** "Design review", "Design review and Stand-up", "Design review and 2 more". */
export function clashLabel(titles: string[]): string {
  if (titles.length === 0) return ''
  if (titles.length === 1) return titles[0]
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`
  return `${titles[0]} and ${titles.length - 1} more`
}
