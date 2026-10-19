import { describe, it, expect } from 'vitest'
import { dayLoad, daysAhead, doneBy, reviewWeek, scheduledVsDone, staleUndated, wrapUpTime } from './review'
import type { Reviewable } from './review'

const TODAY = '2026-10-19'

let seq = 0
const task = (patch: Partial<Reviewable> = {}): Reviewable => ({
  id: `t${++seq}`,
  title: 'Something',
  kind: 'task',
  status: 'open',
  priority: 0,
  due_on: null,
  starts_on: null,
  estimate_min: null,
  created_at: '2026-10-19T00:00:00Z',
  parent_id: null,
  series_id: null,
  completed_on: null,
  ...patch,
})

describe('dayLoad', () => {
  it('sums estimates of open work due that day, events excluded', () => {
    const list = [
      task({ due_on: TODAY, estimate_min: 40 }),
      task({ due_on: TODAY }), // default 20 at priority 0
      task({ due_on: TODAY, kind: 'event' }),
      task({ due_on: TODAY, status: 'done', estimate_min: 90 }),
      task({ due_on: '2026-10-20', estimate_min: 90 }),
    ]
    expect(dayLoad(list, TODAY)).toBe(60)
  })
})

describe('daysAhead', () => {
  it('reports each day against its capacity', () => {
    const list = [task({ due_on: '2026-10-20', estimate_min: 200 })]
    const out = daysAhead(list, '2026-10-20', 2, () => 180)
    expect(out).toEqual([
      { day: '2026-10-20', plannedMin: 200, capacityMin: 180, overMin: 20 },
      { day: '2026-10-21', plannedMin: 0, capacityMin: 180, overMin: 0 },
    ])
  })
})

describe('doneBy', () => {
  it('counts completions in the range per group, busiest first', () => {
    const list = [
      task({ status: 'done', completed_on: '2026-10-14', title: 'home' }),
      task({ status: 'done', completed_on: '2026-10-15', title: 'work' }),
      task({ status: 'done', completed_on: '2026-10-16', title: 'work' }),
      task({ status: 'done', completed_on: '2026-10-01', title: 'work' }),
    ]
    expect(doneBy(list, '2026-10-13', '2026-10-19', (t) => t.title)).toEqual([
      { group: 'work', count: 2 },
      { group: 'home', count: 1 },
    ])
  })
})

describe('staleUndated', () => {
  it('finds old undated one-offs, oldest first', () => {
    const old = task({ created_at: '2026-08-01T00:00:00Z' })
    const older = task({ created_at: '2026-06-01T00:00:00Z' })
    const list = [
      old, older,
      task({ created_at: '2026-10-10T00:00:00Z' }),
      task({ created_at: '2026-06-01T00:00:00Z', due_on: TODAY }),
      task({ created_at: '2026-06-01T00:00:00Z', series_id: 's' }),
      task({ created_at: '2026-06-01T00:00:00Z', parent_id: 'p' }),
    ]
    expect(staleUndated(list, TODAY).map((t) => t.id)).toEqual([older.id, old.id])
  })
})

describe('scheduledVsDone', () => {
  it('counts only scheduled days that have arrived', () => {
    const scheduled = ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20']
    expect(scheduledVsDone(scheduled, new Set(['2026-10-13', '2026-10-17']), '2026-10-13', '2026-10-25', TODAY))
      .toEqual({ due: 3, done: 2 })
  })
})

describe('wrapUpTime', () => {
  it('opens four hours before the end of the day', () => {
    expect(wrapUpTime(16 * 60 + 59, 21 * 60)).toBe(false)
    expect(wrapUpTime(17 * 60, 21 * 60)).toBe(true)
  })
})

describe('reviewWeek', () => {
  it('covers the week just ended when opened on a Monday', () => {
    expect(reviewWeek('2026-10-19')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  it('covers the week so far on any other day', () => {
    expect(reviewWeek('2026-10-23')).toEqual({ from: '2026-10-19', to: '2026-10-23' })
  })
})
