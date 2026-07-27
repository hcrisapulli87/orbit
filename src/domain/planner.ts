// The Today planner: deciding what actually matters this morning.
//
// Two constraints shape this. First, nothing here may depend on a field the
// user has to remember to fill in — there is no energy picker, no context tag,
// and an absent estimate gets a sensible default rather than a prompt. Second,
// the plan must never quietly hide a commitment: when the day doesn't fit, it
// says by how much instead of trimming the list.

import { compareISO, daysBetween, toLocalISODate } from './day'
import type { ISODate } from './day'

/** The shape the planner needs. A stored Task satisfies it. */
export interface Plannable {
  id: string
  kind: 'task' | 'habit' | 'event'
  status: 'open' | 'done' | 'dropped'
  priority: number
  due_on: string | null
  starts_on: string | null
  estimate_min: number | null
  created_at: string
  /** Inherited from the series: how early this should start surfacing. */
  lead_days?: number
}

export interface TodayPlan<T extends Plannable = Plannable> {
  /** Already missed. Broken out so the screen can lead with it. */
  overdue: T[]
  /** Commitments: overdue or due today. Included regardless of capacity. */
  must: T[]
  /** Fits in what's left of the day. */
  should: T[]
  /** Real work that simply doesn't fit today. */
  ifTime: T[]
  /** Dates to be aware of. No checkbox, no time cost. */
  events: T[]
  plannedMin: number
  capacityMin: number
  /** Minutes by which the commitments exceed the day. 0 when it fits. */
  overCapacity: number
}

// Scoring weights. Tiered rather than a smooth curve so the ordering is
// explainable: "overdue, then today, then tomorrow" is what a person expects.
const DUE_TODAY = 400
const PER_DAY_OVERDUE = 60
const DUE_TOMORROW = 250
const WITHIN_LEAD = 200
const PRIORITY_WEIGHT = 30
const AGE_WEIGHT = 0.3
const AGE_CAP_DAYS = 90

/** Default minutes by kind and priority, used when no estimate was given. */
const ESTIMATE_BY_PRIORITY = [20, 25, 30, 45]
const HABIT_ESTIMATE = 10

/** A task with a future start date is not today's problem. */
export function isDeferred(task: Plannable, today: ISODate): boolean {
  return task.starts_on !== null && compareISO(task.starts_on, today) > 0
}

export function defaultEstimateFor(task: Plannable): number {
  if (task.estimate_min !== null) return task.estimate_min
  if (task.kind === 'event') return 0
  if (task.kind === 'habit') return HABIT_ESTIMATE
  return ESTIMATE_BY_PRIORITY[task.priority] ?? ESTIMATE_BY_PRIORITY[0]
}

/**
 * How much this wants attention today. Higher is more urgent.
 *
 * Order of dominance: overdue → due today → due tomorrow → inside its lead time
 * → soon → someday, with priority as the tie-break within a day and a small
 * age nudge so an undated item can't rot at the bottom of the Inbox forever.
 */
export function scoreTask(task: Plannable, today: ISODate): number {
  let score = task.priority * PRIORITY_WEIGHT

  if (task.due_on === null) {
    // Undated: the only lever is age, deliberately capped well below the score
    // of anything with a real due date.
    const ageDays = Math.max(0, daysBetween(toLocalISODate(new Date(task.created_at)), today))
    return score + Math.min(ageDays, AGE_CAP_DAYS) * AGE_WEIGHT
  }

  const until = daysBetween(today, task.due_on)

  if (until < 0) score += DUE_TODAY + -until * PER_DAY_OVERDUE
  else if (until === 0) score += DUE_TODAY
  else if (until === 1) score += DUE_TOMORROW
  else if (until <= (task.lead_days ?? 0)) score += WITHIN_LEAD
  else if (until <= 7) score += 120 - until * 5
  else if (until <= 30) score += 60 - until
  else score += 20

  return score
}

/**
 * Build the day.
 *
 * Commitments (overdue or due today) always land in `must`, even when they
 * overflow the day — telling you it's forty minutes more than you have is the
 * useful output, and silently truncating the list is how a planner starts
 * lying. Whatever capacity is left is filled greedily in score order; the rest
 * drops to `ifTime`.
 */
export function buildToday<T extends Plannable>(
  tasks: T[],
  opts: { today: ISODate; capacityMin: number },
): TodayPlan<T> {
  const { today, capacityMin } = opts

  const live = tasks.filter((t) => t.status === 'open' && !isDeferred(t, today))
  const byScore = (a: T, b: T) => scoreTask(b, today) - scoreTask(a, today)

  // Events are dates to know about, not work: no checkbox, no minutes. They
  // appear once inside their lead time and disappear once they've passed.
  const events = live
    .filter((t) => {
      if (t.kind !== 'event' || t.due_on === null) return false
      const until = daysBetween(today, t.due_on)
      return until >= 0 && until <= (t.lead_days ?? 0)
    })
    .sort((a, b) => compareISO(a.due_on!, b.due_on!))

  const work = live.filter((t) => t.kind !== 'event').sort(byScore)

  const isCommitment = (t: T) => t.due_on !== null && compareISO(t.due_on, today) <= 0
  const must = work.filter(isCommitment)
  const overdue = must.filter((t) => compareISO(t.due_on!, today) < 0)

  const committedMin = must.reduce((sum, t) => sum + defaultEstimateFor(t), 0)
  let remaining = capacityMin - committedMin

  const should: T[] = []
  const ifTime: T[] = []
  for (const t of work) {
    if (isCommitment(t)) continue
    const cost = defaultEstimateFor(t)
    if (cost <= remaining) {
      should.push(t)
      remaining -= cost
    } else {
      ifTime.push(t)
    }
  }

  const plannedMin = committedMin + should.reduce((sum, t) => sum + defaultEstimateFor(t), 0)

  return {
    overdue,
    must,
    should,
    ifTime,
    events,
    plannedMin,
    capacityMin,
    overCapacity: Math.max(0, committedMin - capacityMin),
  }
}
