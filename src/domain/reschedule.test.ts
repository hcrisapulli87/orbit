import { describe, it, expect } from 'vitest'
import { planReschedule } from './reschedule'
import type { Reschedulable } from './reschedule'

const TODAY = '2026-07-29'

let seq = 0
const task = (patch: Partial<Reschedulable> = {}): Reschedulable => ({
  id: `t${++seq}`,
  status: 'open',
  due_on: '2026-07-27',
  series_id: null,
  ...patch,
})

const ids = (list: Reschedulable[]) => list.map((t) => t.id)

describe('planReschedule', () => {
  it('moves one-off overdue work', () => {
    const a = task()
    expect(planReschedule([a], [a], TODAY)).toEqual({ move: [a], skip: [] })
  })

  it('skips a missed repeat whose next occurrence is already waiting', () => {
    const missed = task({ series_id: 's' })
    const todays = task({ series_id: 's', due_on: TODAY })
    const out = planReschedule([missed], [missed, todays], TODAY)
    expect(ids(out.skip)).toEqual([missed.id])
    expect(out.move).toEqual([])
  })

  it('moves a repeat with nothing later, like one scheduled from completion', () => {
    const missed = task({ series_id: 's' })
    expect(ids(planReschedule([missed], [missed], TODAY).move)).toEqual([missed.id])
  })

  it('does not count another missed occurrence as waiting', () => {
    const a = task({ series_id: 's', due_on: '2026-07-26' })
    const b = task({ series_id: 's', due_on: '2026-07-27' })
    expect(ids(planReschedule([a, b], [a, b], TODAY).move)).toEqual([a.id, b.id])
  })

  it('does not count a completed later occurrence as waiting', () => {
    const missed = task({ series_id: 's' })
    const later = task({ series_id: 's', due_on: TODAY, status: 'done' })
    expect(ids(planReschedule([missed], [missed, later], TODAY).move)).toEqual([missed.id])
  })
})
