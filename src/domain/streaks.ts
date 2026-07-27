// Streaks over an arbitrary cadence.
//
// The rule that matters: a streak counts consecutive SCHEDULED occurrences, not
// consecutive calendar days. A Mon/Wed/Fri habit is not broken by Tuesday,
// because Tuesday was never asked for. Counting days would punish you for the
// schedule you chose.

import { compareISO } from './day'
import type { ISODate } from './day'

/** Scheduled days up to and including `today`, most recent first. */
function pastFirst(scheduled: ISODate[], today: ISODate): ISODate[] {
  return scheduled
    .filter((d) => compareISO(d, today) <= 0)
    .sort(compareISO)
    .reverse()
}

/**
 * The current run, ending at the most recent scheduled day.
 *
 * Today gets grace: at nine in the morning you haven't done it yet, and a
 * streak that reads as already lost is a streak you stop trying to keep.
 * Yesterday gets none — that one really was missed.
 */
export function currentStreak(
  scheduled: ISODate[],
  completed: Set<string>,
  today: ISODate,
): number {
  const days = pastFirst(scheduled, today)
  if (days.length === 0) return 0

  // Only today may be outstanding without breaking the run.
  const start = days[0] === today && !completed.has(days[0]) ? 1 : 0

  let streak = 0
  for (let i = start; i < days.length; i++) {
    if (!completed.has(days[i])) break
    streak++
  }
  return streak
}

/** The longest run anywhere in the history. */
export function bestStreak(scheduled: ISODate[], completed: Set<string>): number {
  let best = 0
  let run = 0
  for (const day of [...scheduled].sort(compareISO)) {
    run = completed.has(day) ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

/**
 * Share of scheduled days already past that were done, 0–1.
 *
 * The future is excluded, so a habit created today doesn't open at 0% just
 * because it has occurrences on the books for next month.
 */
export function completionRate(
  scheduled: ISODate[],
  completed: Set<string>,
  today: ISODate,
): number {
  const days = pastFirst(scheduled, today)
  if (days.length === 0) return 0
  return days.filter((d) => completed.has(d)).length / days.length
}
