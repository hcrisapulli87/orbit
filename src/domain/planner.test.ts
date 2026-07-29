import { describe, it, expect } from 'vitest'
import {
  TODAY_HORIZON_DAYS,
  buildToday,
  defaultEstimateFor,
  isDeferred,
  scoreTask,
  suggestBlocks,
  withinHorizon,
} from './planner'
import type { Plannable } from './planner'

const TODAY = '2026-07-27'

let seq = 0
const task = (patch: Partial<Plannable> = {}): Plannable => ({
  id: `t${++seq}`,
  kind: 'task',
  status: 'open',
  priority: 0,
  due_on: null,
  starts_on: null,
  estimate_min: null,
  created_at: '2026-07-27T00:00:00Z',
  lead_days: 0,
  ...patch,
})

const ids = (list: Plannable[]) => list.map((t) => t.id)

describe('isDeferred', () => {
  it('hides a task that has not started yet', () => {
    expect(isDeferred(task({ starts_on: '2026-08-01' }), TODAY)).toBe(true)
  })

  it('shows one starting today', () => {
    expect(isDeferred(task({ starts_on: TODAY }), TODAY)).toBe(false)
  })

  it('shows one with no start date', () => {
    expect(isDeferred(task(), TODAY)).toBe(false)
  })
})

describe('scoreTask', () => {
  // Overdue dominates everything: a thing you have already missed outranks a
  // flagged thing that isn't due yet.
  it('ranks overdue above high priority that is not yet due', () => {
    const late = task({ due_on: '2026-07-26' })
    const flagged = task({ priority: 3, due_on: '2026-08-30' })
    expect(scoreTask(late, TODAY)).toBeGreaterThan(scoreTask(flagged, TODAY))
  })

  it('ranks longer-overdue above just-overdue', () => {
    const week = task({ due_on: '2026-07-20' })
    const yesterday = task({ due_on: '2026-07-26' })
    expect(scoreTask(week, TODAY)).toBeGreaterThan(scoreTask(yesterday, TODAY))
  })

  it('ranks today above tomorrow above next week', () => {
    const today = scoreTask(task({ due_on: TODAY }), TODAY)
    const tomorrow = scoreTask(task({ due_on: '2026-07-28' }), TODAY)
    const later = scoreTask(task({ due_on: '2026-08-05' }), TODAY)
    expect(today).toBeGreaterThan(tomorrow)
    expect(tomorrow).toBeGreaterThan(later)
  })

  it('breaks ties on the same day by priority', () => {
    const urgent = task({ due_on: TODAY, priority: 3 })
    const plain = task({ due_on: TODAY, priority: 0 })
    expect(scoreTask(urgent, TODAY)).toBeGreaterThan(scoreTask(plain, TODAY))
  })

  it('surfaces a dated item early when its series asked for lead time', () => {
    const withLead = task({ due_on: '2026-08-01', lead_days: 14 })
    const without = task({ due_on: '2026-08-01', lead_days: 0 })
    expect(scoreTask(withLead, TODAY)).toBeGreaterThan(scoreTask(without, TODAY))
  })

  // Nothing should rot silently at the bottom of the Inbox.
  it('nudges an undated task that has been open a long time', () => {
    const stale = task({ created_at: '2026-06-01T00:00:00Z' })
    const fresh = task({ created_at: '2026-07-26T00:00:00Z' })
    expect(scoreTask(stale, TODAY)).toBeGreaterThan(scoreTask(fresh, TODAY))
  })

  it('keeps the age nudge small enough not to outrank a real due date', () => {
    const ancient = task({ created_at: '2024-01-01T00:00:00Z' })
    const dueNextWeek = task({ due_on: '2026-08-03' })
    expect(scoreTask(dueNextWeek, TODAY)).toBeGreaterThan(scoreTask(ancient, TODAY))
  })
})

describe('defaultEstimateFor', () => {
  // An estimate field would go unfilled, so the planner supplies one by kind
  // and priority rather than asking.
  it('uses the task estimate when there is one', () => {
    expect(defaultEstimateFor(task({ estimate_min: 90 }))).toBe(90)
  })

  it('gives a bigger default to a higher priority', () => {
    expect(defaultEstimateFor(task({ priority: 3 }))).toBeGreaterThan(
      defaultEstimateFor(task({ priority: 0 })),
    )
  })

  it('treats habits as quick and events as taking no time at all', () => {
    expect(defaultEstimateFor(task({ kind: 'habit' }))).toBeLessThan(defaultEstimateFor(task()))
    expect(defaultEstimateFor(task({ kind: 'event' }))).toBe(0)
  })
})

describe('buildToday', () => {
  const plan = (tasks: Plannable[], capacityMin = 180) =>
    buildToday(tasks, { today: TODAY, capacityMin })

  it('puts overdue and today’s flagged work in must, whatever the capacity', () => {
    const late = task({ due_on: '2026-07-20', estimate_min: 120 })
    const flagged = task({ due_on: TODAY, priority: 3, estimate_min: 120 })
    const p = plan([late, flagged], 60)
    expect(ids(p.must)).toEqual([late.id, flagged.id])
  })

  it('puts the rest of today in should', () => {
    const flagged = task({ due_on: TODAY, priority: 2 })
    const plain = task({ due_on: TODAY, priority: 1 })
    const p = plan([flagged, plain])
    expect(ids(p.must)).toEqual([flagged.id])
    expect(ids(p.should)).toEqual([plain.id])
  })

  // Priority decides Must vs Should only for work due today. Something already
  // missed is a must whatever you flagged it.
  it('keeps an overdue task in must however low its priority', () => {
    const late = task({ due_on: '2026-07-20', priority: 0 })
    const p = plan([late])
    expect(ids(p.must)).toEqual([late.id])
    expect(p.should).toEqual([])
  })

  it('reports the shortfall rather than silently dropping anything', () => {
    const p = plan([task({ due_on: TODAY, estimate_min: 120 })], 80)
    expect(p.plannedMin).toBe(120)
    expect(p.capacityMin).toBe(80)
    expect(p.overCapacity).toBe(40)
  })

  it('has no shortfall when the day fits', () => {
    expect(plan([task({ due_on: TODAY, estimate_min: 30 })], 180).overCapacity).toBe(0)
  })

  it('counts both must and should towards the day', () => {
    const flagged = task({ due_on: TODAY, priority: 3, estimate_min: 60 })
    const plain = task({ due_on: TODAY, priority: 0, estimate_min: 30 })
    expect(plan([flagged, plain]).plannedMin).toBe(90)
  })

  // The whole point of the four sections: an undated someday task and a task
  // due on Friday are different things and never share a bucket.
  it('sends a future-dated task to coming up and an undated one to if-time', () => {
    const friday = task({ due_on: '2026-07-31' })
    const someday = task()
    const p = plan([friday, someday])
    expect(ids(p.comingUp)).toEqual([friday.id])
    expect(ids(p.ifTime)).toEqual([someday.id])
    expect(p.should).toEqual([])
  })

  // Capacity used to decide this split, which meant a quiet day promoted the
  // backlog into Should and a busy one demoted Friday's work into If-there's-
  // time. Neither is a thing the section names claim.
  it('never moves undated work out of if-time, however empty the day', () => {
    const someday = task({ estimate_min: 15 })
    expect(ids(plan([someday], 600).ifTime)).toEqual([someday.id])
  })

  it('never moves a dated task out of coming up, however full the day', () => {
    const friday = task({ due_on: '2026-07-31', estimate_min: 240 })
    expect(ids(plan([friday], 30).comingUp)).toEqual([friday.id])
  })

  // A daily habit materialises sixty days of occurrences up front. Without a
  // horizon every one of them lands on Today, and one habit is enough to bury
  // the screen under identical rows.
  it('keeps work due beyond the horizon off today altogether', () => {
    const soon = task({ due_on: '2026-08-01' })
    const far = task({ due_on: '2026-09-15' })
    expect(ids(plan([soon, far]).comingUp)).toEqual([soon.id])
  })

  it('never drops a commitment for being far away — it cannot be', () => {
    const overdueLongAgo = task({ due_on: '2026-01-01' })
    expect(ids(plan([overdueLongAgo]).must)).toEqual([overdueLongAgo.id])
  })

  // lead_days is the series saying "start surfacing this early". A rule that
  // asks for more warning than the default horizon gets it.
  it('respects a lead time longer than the horizon', () => {
    const renewal = task({ due_on: '2026-08-20', lead_days: 30 })
    expect(ids(plan([renewal]).comingUp)).toEqual([renewal.id])
  })

  it('excludes deferred tasks entirely', () => {
    const later = task({ due_on: TODAY, starts_on: '2026-08-01' })
    const p = plan([later])
    expect([...p.must, ...p.should, ...p.comingUp, ...p.ifTime]).toEqual([])
  })

  it('excludes anything already done', () => {
    const p = plan([task({ due_on: TODAY, status: 'done' }), task({ status: 'dropped' })])
    expect([...p.must, ...p.should, ...p.comingUp, ...p.ifTime]).toEqual([])
  })

  it('keeps events out of the work lists and out of the capacity sum', () => {
    const birthday = task({ kind: 'event', due_on: TODAY })
    const job = task({ due_on: TODAY, estimate_min: 30 })
    const p = plan([birthday, job])
    expect(ids(p.comingUp)).toEqual([birthday.id])
    expect(ids(p.should)).toEqual([job.id])
    expect(p.plannedMin).toBe(30)
  })

  it('shows an upcoming event once it is inside its lead time', () => {
    const soon = task({ kind: 'event', due_on: '2026-08-01', lead_days: 7 })
    const distant = task({ kind: 'event', due_on: '2026-12-01', lead_days: 7 })
    expect(ids(plan([soon, distant]).comingUp)).toEqual([soon.id])
  })

  it('orders coming up by date, tasks and events together', () => {
    const friday = task({ due_on: '2026-07-31', priority: 3 })
    const birthday = task({ kind: 'event', due_on: '2026-07-29', lead_days: 7 })
    expect(ids(plan([friday, birthday]).comingUp)).toEqual([birthday.id, friday.id])
  })

  it('separates overdue so the screen can shout about it', () => {
    const late = task({ due_on: '2026-07-20' })
    const now = task({ due_on: TODAY, priority: 3 })
    const p = plan([late, now])
    expect(ids(p.overdue)).toEqual([late.id])
    expect(ids(p.must)).toContain(late.id)
  })

  it('sorts the work lists by score, worst-overdue first', () => {
    const a = task({ due_on: '2026-07-25' })
    const b = task({ due_on: '2026-07-20' })
    const c = task({ due_on: TODAY, priority: 3 })
    expect(ids(plan([a, b, c]).must)).toEqual([b.id, a.id, c.id])
  })
})

describe('suggestBlocks', () => {
  // 9am–5pm.
  const DAY = { today: TODAY, dayStartMin: 540, dayEndMin: 1020 }
  const suggest = (tasks: Plannable[], busy: { start: number; end: number }[] = [], blocked: string[] = []) =>
    suggestBlocks(tasks, { ...DAY, busy, alreadyBlocked: blocked })

  it('places the first task at the start of the day', () => {
    const t = task({ due_on: TODAY, estimate_min: 60 })
    expect(suggest([t])).toEqual([{ taskId: t.id, startMin: 540, endMin: 600 }])
  })

  it('stacks the next task straight after the previous one', () => {
    const a = task({ due_on: TODAY, estimate_min: 60 })
    const b = task({ due_on: TODAY, estimate_min: 30, priority: 0 })
    const out = suggest([a, b])
    expect(out[1]).toEqual({ taskId: b.id, startMin: 600, endMin: 630 })
  })

  it('works around time that is already committed', () => {
    const t = task({ due_on: TODAY, estimate_min: 60 })
    // Something already runs 9–10:30.
    expect(suggest([t], [{ start: 540, end: 630 }])).toEqual([
      { taskId: t.id, startMin: 630, endMin: 690 },
    ])
  })

  it('uses a gap between commitments when the task fits', () => {
    const t = task({ due_on: TODAY, estimate_min: 30 })
    const busy = [{ start: 540, end: 600 }, { start: 630, end: 720 }]
    expect(suggest([t], busy)).toEqual([{ taskId: t.id, startMin: 600, endMin: 630 }])
  })

  it('skips a gap too small and takes the next one that fits', () => {
    const t = task({ due_on: TODAY, estimate_min: 60 })
    const busy = [{ start: 540, end: 570 }, { start: 600, end: 660 }]
    expect(suggest([t], busy)).toEqual([{ taskId: t.id, startMin: 660, endMin: 720 }])
  })

  it('places nothing once the day is full', () => {
    const t = task({ due_on: TODAY, estimate_min: 60 })
    expect(suggest([t], [{ start: 540, end: 1020 }])).toEqual([])
  })

  it('never runs past the end of the day', () => {
    const t = task({ due_on: TODAY, estimate_min: 120 })
    expect(suggest([t], [{ start: 540, end: 960 }])).toEqual([])
  })

  it('leaves alone anything already blocked by hand', () => {
    const t = task({ due_on: TODAY, estimate_min: 60 })
    expect(suggest([t], [], [t.id])).toEqual([])
  })

  it('follows the plan order, so the most overdue is scheduled first', () => {
    const late = task({ due_on: '2026-07-20', estimate_min: 60 })
    const now = task({ due_on: TODAY, estimate_min: 60 })
    expect(suggest([now, late]).map((b) => b.taskId)).toEqual([late.id, now.id])
  })

  it('never schedules events, deferred work or anything already done', () => {
    const birthday = task({ kind: 'event', due_on: TODAY })
    const later = task({ due_on: TODAY, starts_on: '2026-08-01' })
    const finished = task({ due_on: TODAY, status: 'done' })
    expect(suggest([birthday, later, finished])).toEqual([])
  })

  // The planner used to route around a task that already had a time, so the
  // one thing you had definitely committed to was the one thing that never
  // appeared on the calendar. It's pinned now.
  it('pins a task that already has a time to the time it was given', () => {
    const appointment = task({ due_on: TODAY, due_time: '14:00', estimate_min: 45 })
    expect(suggest([appointment])).toEqual([
      { taskId: appointment.id, startMin: 840, endMin: 885 },
    ])
  })

  it('fills the gaps around a pin rather than through it', () => {
    const appointment = task({ due_on: TODAY, due_time: '10:00', estimate_min: 60 })
    const loose = task({ due_on: TODAY, estimate_min: 90 })
    const out = suggest([appointment, loose])
    expect(out).toContainEqual({ taskId: appointment.id, startMin: 600, endMin: 660 })
    // 9:00–10:00 is only sixty minutes, so ninety goes after the appointment.
    expect(out).toContainEqual({ taskId: loose.id, startMin: 660, endMin: 750 })
  })

  it('pins even outside the working day, because a pin is a fact not a suggestion', () => {
    const earlyStart = task({ due_on: TODAY, due_time: '07:00', estimate_min: 30 })
    expect(suggest([earlyStart])).toEqual([
      { taskId: earlyStart.id, startMin: 420, endMin: 450 },
    ])
  })

  // Only today gets laid out. Asking to plan today used to scatter the undated
  // backlog across it, which is the opposite of a plan.
  it('places only today’s work, never the backlog or a later day', () => {
    const today = task({ due_on: TODAY, estimate_min: 30 })
    const someday = task({ estimate_min: 30 })
    const friday = task({ due_on: '2026-07-31', estimate_min: 30 })
    expect(suggest([today, someday, friday]).map((b) => b.taskId)).toEqual([today.id])
  })

  it('ignores a time belonging to another day', () => {
    const tomorrow = task({ due_on: '2026-07-28', due_time: '09:00' })
    expect(suggest([tomorrow])).toEqual([])
  })
})

describe('withinHorizon', () => {
  // The rule Today and the Lists counts share. Both answer "is this near
  // enough to be worth showing", and they have to answer it the same way.
  it('keeps undated work, which has no horizon to be beyond', () => {
    expect(withinHorizon(task({ due_on: null }), TODAY)).toBe(true)
  })

  it('keeps anything already due, however old', () => {
    expect(withinHorizon(task({ due_on: '2026-07-27' }), TODAY)).toBe(true)
    expect(withinHorizon(task({ due_on: '2025-01-01' }), TODAY)).toBe(true)
  })

  it('keeps work inside the horizon and drops work beyond it', () => {
    expect(withinHorizon(task({ due_on: '2026-08-03' }), TODAY)).toBe(true)  // +7
    expect(withinHorizon(task({ due_on: '2026-08-04' }), TODAY)).toBe(false) // +8
  })

  it('honours a longer lead time when a series asks for one', () => {
    // A birthday with a month of lead should surface a month out, not a week.
    const birthday = task({ due_on: '2026-08-20', lead_days: 30 })
    expect(withinHorizon(birthday, TODAY)).toBe(true)
    expect(withinHorizon({ ...birthday, lead_days: 0 }, TODAY)).toBe(false)
  })

  it('never shortens the horizon for a series with a small lead', () => {
    expect(withinHorizon(task({ due_on: '2026-08-01', lead_days: 1 }), TODAY)).toBe(true)
  })

  it('is the cutoff buildToday actually applies', () => {
    // Sixty materialised occurrences of one daily habit: the case the horizon
    // exists for. Only the ones inside it reach the screen.
    const daily = Array.from({ length: 60 }, (_, i) =>
      task({ id: `d${i}`, kind: 'habit', due_on: addDaysISO(TODAY, i + 1) }),
    )
    const plan = buildToday(daily, { today: TODAY, capacityMin: 180 })
    const shown = [...plan.must, ...plan.should, ...plan.comingUp, ...plan.ifTime]
    expect(shown).toHaveLength(TODAY_HORIZON_DAYS)
  })
})

/** Local to this block: the planner's own date maths is what's under test. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
