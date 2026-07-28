import { describe, it, expect } from 'vitest'
import { buildToday, defaultEstimateFor, isDeferred, scoreTask, suggestBlocks } from './planner'
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

  it('puts overdue and due-today work in must, whatever the capacity', () => {
    const late = task({ due_on: '2026-07-20', estimate_min: 120 })
    const now = task({ due_on: TODAY, estimate_min: 120 })
    const p = plan([late, now], 60)
    expect(ids(p.must)).toEqual([late.id, now.id])
  })

  it('reports the shortfall rather than silently dropping commitments', () => {
    const p = plan([task({ due_on: TODAY, estimate_min: 120 })], 80)
    expect(p.plannedMin).toBe(120)
    expect(p.capacityMin).toBe(80)
    expect(p.overCapacity).toBe(40)
  })

  it('has no shortfall when the day fits', () => {
    expect(plan([task({ due_on: TODAY, estimate_min: 30 })], 180).overCapacity).toBe(0)
  })

  it('fills the remaining capacity with should, then demotes the rest to if-time', () => {
    const commitment = task({ due_on: TODAY, estimate_min: 60 })
    const big = task({ priority: 3, estimate_min: 90 })
    const small = task({ priority: 2, estimate_min: 60 })
    const p = plan([commitment, big, small], 180)
    expect(ids(p.must)).toEqual([commitment.id])
    expect(ids(p.should)).toEqual([big.id])
    expect(ids(p.ifTime)).toEqual([small.id])
  })

  // A daily habit materialises sixty days of occurrences up front. Without a
  // horizon every one of them lands on Today, and one habit is enough to bury
  // the screen under identical rows.
  it('keeps work due beyond the horizon off today altogether', () => {
    const soon = task({ due_on: '2026-08-01' })
    const far = task({ due_on: '2026-09-15' })
    const p = plan([soon, far])
    expect(ids([...p.should, ...p.ifTime])).toEqual([soon.id])
  })

  it('still shows undated work, which has no horizon to be beyond', () => {
    const someday = task()
    expect(ids(plan([someday]).should)).toEqual([someday.id])
  })

  it('never drops a commitment for being far away — it cannot be', () => {
    const overdueLongAgo = task({ due_on: '2026-01-01' })
    expect(ids(plan([overdueLongAgo]).must)).toEqual([overdueLongAgo.id])
  })

  // lead_days is the series saying "start surfacing this early". A rule that
  // asks for more warning than the default horizon gets it.
  it('respects a lead time longer than the horizon', () => {
    const renewal = task({ due_on: '2026-08-20', lead_days: 30 })
    expect(ids(plan([renewal]).should)).toEqual([renewal.id])
  })

  it('excludes deferred tasks entirely', () => {
    const later = task({ due_on: TODAY, starts_on: '2026-08-01' })
    const p = plan([later])
    expect([...p.must, ...p.should, ...p.ifTime]).toEqual([])
  })

  it('excludes anything already done', () => {
    const p = plan([task({ due_on: TODAY, status: 'done' }), task({ status: 'dropped' })])
    expect([...p.must, ...p.should, ...p.ifTime]).toEqual([])
  })

  it('keeps events out of the work lists and out of the capacity sum', () => {
    const birthday = task({ kind: 'event', due_on: TODAY })
    const job = task({ due_on: TODAY, estimate_min: 30 })
    const p = plan([birthday, job])
    expect(ids(p.events)).toEqual([birthday.id])
    expect(ids(p.must)).toEqual([job.id])
    expect(p.plannedMin).toBe(30)
  })

  it('shows an upcoming event once it is inside its lead time', () => {
    const soon = task({ kind: 'event', due_on: '2026-08-01', lead_days: 7 })
    const distant = task({ kind: 'event', due_on: '2026-12-01', lead_days: 7 })
    expect(ids(plan([soon, distant]).events)).toEqual([soon.id])
  })

  it('separates overdue so the screen can shout about it', () => {
    const late = task({ due_on: '2026-07-20' })
    const now = task({ due_on: TODAY })
    const p = plan([late, now])
    expect(ids(p.overdue)).toEqual([late.id])
    expect(ids(p.must)).toContain(late.id)
  })

  it('sorts every list by score, worst-overdue first', () => {
    const a = task({ due_on: '2026-07-25' })
    const b = task({ due_on: '2026-07-20' })
    const c = task({ due_on: TODAY })
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
})
