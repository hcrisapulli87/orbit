import { describe, it, expect } from 'vitest'
import { planOccurrences } from './occurrences'
import type { Rule } from './recurrence'

const rule = (patch: Partial<Rule> & Pick<Rule, 'rule_type' | 'anchor_on'>): Rule => ({
  step: 1,
  weekdays: [],
  month_day: null,
  nth: null,
  month: null,
  after_n: null,
  after_unit: null,
  until_on: null,
  ...patch,
})

const TODAY = '2026-07-27' // Monday
const keysOf = (drafts: { occurrence_key: string }[]) => drafts.map((d) => d.occurrence_key)

describe('planOccurrences', () => {
  const tuesdays = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-27' })

  it('fills the horizon from today', () => {
    // 21 days from Mon 27 Jul reaches Mon 17 Aug, so three Tuesdays fit.
    const drafts = planOccurrences(tuesdays, [], TODAY, 21)
    expect(keysOf(drafts)).toEqual(['2026-07-28', '2026-08-04', '2026-08-11'])
  })

  it('uses the occurrence date as both key and due date', () => {
    const [first] = planOccurrences(tuesdays, [], TODAY, 7)
    expect(first).toEqual({ occurrence_key: '2026-07-28', due_on: '2026-07-28' })
  })

  it('skips occurrences that already exist', () => {
    const drafts = planOccurrences(tuesdays, ['2026-07-28', '2026-08-04'], TODAY, 21)
    expect(keysOf(drafts)).toEqual(['2026-08-11'])
  })

  // The property that makes it safe to run this on every app open, from any
  // device, forever — backed by unique (series_id, occurrence_key) in the DB.
  it('is idempotent: planning again over its own output yields nothing', () => {
    const first = planOccurrences(tuesdays, [], TODAY, 60)
    const second = planOccurrences(tuesdays, keysOf(first), TODAY, 60)
    expect(second).toEqual([])
  })

  it('includes an occurrence landing exactly on the horizon edge', () => {
    const daily = rule({ rule_type: 'daily', anchor_on: '2026-07-27' })
    expect(keysOf(planOccurrences(daily, [], TODAY, 2))).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29',
    ])
  })

  // A missed week should show up as overdue, not vanish. This is what replaces
  // the bot's Monday chore wipe, which deleted the fact that a chore was never
  // done along with the chore itself.
  it('backfills recently missed occurrences so they read as overdue', () => {
    const running = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-06-30' })
    const drafts = planOccurrences(running, [], TODAY, 7, 21)
    expect(keysOf(drafts)).toEqual(['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28'])
  })

  it('never backfills earlier than the anchor', () => {
    const started = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-21' })
    expect(keysOf(planOccurrences(started, [], TODAY, 7, 60))).toEqual([
      '2026-07-21', '2026-07-28',
    ])
  })

  it('stops at until_on', () => {
    const ending = rule({ ...tuesdays, until_on: '2026-08-04' })
    expect(keysOf(planOccurrences(ending, [], TODAY, 60))).toEqual(['2026-07-28', '2026-08-04'])
  })

  it('returns nothing for a series whose end date has passed', () => {
    const done = rule({ ...tuesdays, until_on: '2026-06-01' })
    expect(planOccurrences(done, [], TODAY, 60)).toEqual([])
  })
})

describe('planOccurrences — after_completion', () => {
  // These never fill a horizon: the next date isn't knowable until the previous
  // one is actually ticked off, so exactly one occurrence exists at a time.
  const service = rule({
    rule_type: 'after_completion',
    after_n: 6,
    after_unit: 'month',
    anchor_on: '2026-08-01',
  })

  it('seeds exactly one occurrence when the series is brand new', () => {
    expect(planOccurrences(service, [], TODAY, 60)).toEqual([
      { occurrence_key: '2026-08-01', due_on: '2026-08-01' },
    ])
  })

  it('adds nothing once an occurrence exists', () => {
    expect(planOccurrences(service, ['2026-08-01'], TODAY, 60)).toEqual([])
  })

  it('adds nothing once one has been completed and its successor created', () => {
    expect(planOccurrences(service, ['2026-08-01', '2027-02-01'], TODAY, 60)).toEqual([])
  })
})
