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
  /** Overdue, plus today's flagged work. The day's non-negotiables. */
  must: T[]
  /** The rest of what's due today. */
  should: T[]
  /** Dated after today and near enough to be worth knowing about. */
  comingUp: T[]
  /** Open work with no date at all. Available if the day allows. */
  ifTime: T[]
  /** Today's total, must + should. Events cost nothing. */
  plannedMin: number
  capacityMin: number
  /** Minutes by which today's work exceeds the day. 0 when it fits. */
  overCapacity: number
}

/**
 * The priority at which today's work stops being "also due" and becomes a
 * non-negotiable. Med and High are things you flagged on the way in; None and
 * Low are the rest of the day.
 */
export const MUST_PRIORITY = 2

// Scoring weights. Tiered rather than a smooth curve so the ordering is
// explainable: "overdue, then today, then tomorrow" is what a person expects.
const DUE_TODAY = 400
const PER_DAY_OVERDUE = 60
const DUE_TOMORROW = 250
const WITHIN_LEAD = 200
const PRIORITY_WEIGHT = 30
const AGE_WEIGHT = 0.3
const AGE_CAP_DAYS = 90

/** How far ahead Today will look for work that isn't yet a commitment. */
export const TODAY_HORIZON_DAYS = 7

/**
 * Is this near enough to be worth showing?
 *
 * Recurring series are materialised sixty days ahead, so without a cutoff a
 * single daily habit puts sixty identical rows on the screen and buries
 * everything that actually matters. Undated work has no horizon to be beyond
 * and stays; a commitment is never dropped, whatever its date; and a series
 * asking for a longer lead time gets the lead time it asked for.
 *
 * Shared by Today and by the Lists counts, so "how much loose work is in this
 * area" answers the same question the plan does. Counting all sixty days there
 * reported eighty-seven open tasks in Health — arithmetically true, and no use
 * to anyone.
 */
export function withinHorizon(task: Plannable, today: ISODate): boolean {
  if (task.due_on === null) return true
  if (compareISO(task.due_on, today) <= 0) return true
  return daysBetween(today, task.due_on) <= Math.max(TODAY_HORIZON_DAYS, task.lead_days ?? 0)
}

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

export interface Interval {
  start: number
  end: number
}

export interface BlockSuggestion {
  taskId: string
  startMin: number
  endMin: number
}

/**
 * Suggest where today's work could actually go.
 *
 * Deliberately conservative: it schedules in plan order, never splits a task
 * across gaps, never overruns the end of the day, and silently gives up on
 * anything that doesn't fit rather than squeezing it in. A suggestion you have
 * to undo is worse than no suggestion.
 *
 * `busy` is everything already committed — manual blocks and tasks that carry
 * a time of day. `alreadyBlocked` keeps it from double-booking work you have
 * placed by hand.
 */
export function suggestBlocks(
  tasks: Plannable[],
  opts: {
    today: ISODate
    dayStartMin: number
    dayEndMin: number
    busy: Interval[]
    alreadyBlocked?: string[]
  },
): BlockSuggestion[] {
  const { today, dayStartMin, dayEndMin, busy, alreadyBlocked = [] } = opts
  const skip = new Set(alreadyBlocked)

  const plan = buildToday(tasks, { today, capacityMin: dayEndMin - dayStartMin })
  const queue = [...plan.must, ...plan.should].filter((t) => !skip.has(t.id))

  // Working copy of what's occupied; each placement adds to it.
  const taken: Interval[] = [...busy].sort((a, b) => a.start - b.start)
  const out: BlockSuggestion[] = []

  for (const task of queue) {
    const need = Math.max(15, defaultEstimateFor(task))
    const slot = firstGap(taken, dayStartMin, dayEndMin, need)
    if (!slot) continue

    out.push({ taskId: task.id, startMin: slot, endMin: slot + need })
    taken.push({ start: slot, end: slot + need })
    taken.sort((a, b) => a.start - b.start)
  }

  return out
}

/** Earliest point in the day with `need` free minutes after it. */
function firstGap(taken: Interval[], dayStart: number, dayEnd: number, need: number): number | null {
  let cursor = dayStart
  for (const interval of taken) {
    if (interval.end <= cursor) continue
    if (interval.start - cursor >= need) return cursor
    cursor = Math.max(cursor, interval.end)
  }
  return dayEnd - cursor >= need ? cursor : null
}

/**
 * Build the day.
 *
 * The four sections answer four different questions, and each one is decided by
 * the task's date rather than by how much room is left:
 *
 *   Must            overdue, plus today's flagged work
 *   Should          the rest of what's due today
 *   Coming up       dated after today, inside the horizon
 *   If there's time no date at all
 *
 * An earlier version split Should and If-there's-time by remaining capacity,
 * which put a task due on Friday and a someday task in the same bucket and made
 * the two sections mean nothing you could act on. Capacity is still reported —
 * it just says how big today is instead of deciding what today contains, so an
 * over-committed day says by how much rather than quietly demoting something.
 */
export function buildToday<T extends Plannable>(
  tasks: T[],
  opts: { today: ISODate; capacityMin: number },
): TodayPlan<T> {
  const { today, capacityMin } = opts

  const live = tasks.filter((t) => t.status === 'open' && !isDeferred(t, today))
  const byScore = (a: T, b: T) => scoreTask(b, today) - scoreTask(a, today)
  const byDate = (a: T, b: T) => compareISO(a.due_on!, b.due_on!)

  const isOverdue = (t: T) => t.due_on !== null && compareISO(t.due_on, today) < 0
  const isToday = (t: T) => t.due_on !== null && compareISO(t.due_on, today) === 0

  // Today is a day, not a backlog. Events are dates to know about, not work:
  // no checkbox, no minutes, and they never enter the work lists.
  const work = live.filter((t) => t.kind !== 'event' && withinHorizon(t, today)).sort(byScore)

  const must = work.filter((t) => isOverdue(t) || (isToday(t) && t.priority >= MUST_PRIORITY))
  const overdue = must.filter(isOverdue)
  const should = work.filter((t) => isToday(t) && t.priority < MUST_PRIORITY)
  const ifTime = work.filter((t) => t.due_on === null)

  // A lookahead reads by date, not by urgency. Events join it on their own
  // terms: a birthday appears inside the lead time its series asked for, and
  // disappears once the day has passed.
  const comingUp = [
    ...work.filter((t) => t.due_on !== null && compareISO(t.due_on, today) > 0),
    ...live.filter((t) => {
      if (t.kind !== 'event' || t.due_on === null) return false
      const until = daysBetween(today, t.due_on)
      return until >= 0 && until <= (t.lead_days ?? 0)
    }),
  ].sort(byDate)

  const plannedMin = [...must, ...should].reduce((sum, t) => sum + defaultEstimateFor(t), 0)

  return {
    overdue,
    must,
    should,
    comingUp,
    ifTime,
    plannedMin,
    capacityMin,
    overCapacity: Math.max(0, plannedMin - capacityMin),
  }
}
