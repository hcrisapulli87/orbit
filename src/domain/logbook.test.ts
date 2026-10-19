import { describe, it, expect } from 'vitest'
import { groupByDay, weekTally, wholeDays } from './logbook'
import type { Completed } from './logbook'

// A Wednesday.
const TODAY = '2026-07-29'

let seq = 0
const done = (day: string, at = `${day}T09:00:00Z`): Completed => ({
  id: `t${++seq}`,
  status: 'done',
  completed_on: day,
  completed_at: at,
})

describe('groupByDay', () => {
  it('groups by completion day, newest day and newest tick first', () => {
    const a = done('2026-07-28', '2026-07-28T08:00:00Z')
    const b = done('2026-07-29')
    const c = done('2026-07-28', '2026-07-28T17:00:00Z')
    const out = groupByDay([a, b, c])
    expect(out.map((d) => d.day)).toEqual(['2026-07-29', '2026-07-28'])
    expect(out[1].tasks.map((t) => t.id)).toEqual([c.id, a.id])
  })

  it('skips anything not done', () => {
    const open: Completed = { id: 'x', status: 'open', completed_on: null, completed_at: null }
    const dropped: Completed = { id: 'y', status: 'dropped', completed_on: TODAY, completed_at: null }
    expect(groupByDay([open, dropped])).toEqual([])
  })

  it('counts a row once when a fetched page overlaps memory', () => {
    const a = done(TODAY)
    expect(groupByDay([a, { ...a }])[0].tasks).toHaveLength(1)
  })
})

describe('weekTally', () => {
  it('splits this week from last, Monday start', () => {
    const list = [
      done('2026-07-27'), // Monday, this week
      done('2026-07-29'), // today
      done('2026-07-26'), // Sunday, last week
      done('2026-07-20'), // Monday, last week
      done('2026-07-19'), // the week before
    ]
    expect(weekTally(list, TODAY)).toEqual({ thisWeek: 2, lastWeek: 2 })
  })
})

describe('wholeDays', () => {
  it('treats a short page as the end of history', () => {
    const page = [done('2026-06-10'), done('2026-06-09')]
    expect(wholeDays(page, 5)).toEqual({ kept: page, cursor: null, exhausted: true })
  })

  it('holds back the oldest day of a full page for the next one', () => {
    const page = [done('2026-06-10'), done('2026-06-09'), done('2026-06-08')]
    const out = wholeDays(page, 3)
    expect(out.kept.map((t) => t.completed_on)).toEqual(['2026-06-10', '2026-06-09'])
    expect(out.cursor).toBe('2026-06-08')
    expect(out.exhausted).toBe(false)
  })

  it('keeps a full page that is all one day and moves past it', () => {
    const page = [done('2026-06-10'), done('2026-06-10')]
    const out = wholeDays(page, 2)
    expect(out.kept).toHaveLength(2)
    expect(out.cursor).toBe('2026-06-09')
  })
})
