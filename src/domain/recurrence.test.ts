import { describe, it, expect } from 'vitest'
import {
  describeRule, nextAfterCompletion, nextOccurrenceAfter, nthOccurrenceDate, occurrencesBetween,
} from './recurrence'
import type { Rule } from './recurrence'

/** A rule with everything defaulted, so each test states only what it means. */
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

describe('daily', () => {
  it('runs every day from the anchor', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-07-27' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-07-31')).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
    ])
  })

  it('honours a step', () => {
    const r = rule({ rule_type: 'daily', step: 3, anchor_on: '2026-07-27' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-06')).toEqual([
      '2026-07-27', '2026-07-30', '2026-08-02', '2026-08-05',
    ])
  })

  it('never emits anything before the anchor', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-07-29' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-07-30')).toEqual(['2026-07-29', '2026-07-30'])
  })

  // Proves the string day model, not local Date arithmetic, drives the engine.
  it('emits exactly one day per day across the Melbourne DST start', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-10-01' })
    expect(occurrencesBetween(r, '2026-10-01', '2026-10-08')).toHaveLength(8)
  })

  it('emits exactly one day per day across the Melbourne DST end', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-04-02' })
    expect(occurrencesBetween(r, '2026-04-02', '2026-04-09')).toHaveLength(8)
  })
})

describe('weekly', () => {
  it('runs every Tuesday', () => {
    const r = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-27' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-31')).toEqual([
      '2026-07-28', '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25',
    ])
  })

  it('falls back to the anchor weekday when none is named', () => {
    // Anchored on a Monday, so "every week" means Mondays.
    const r = rule({ rule_type: 'weekly', anchor_on: '2026-07-27' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-17')).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17',
    ])
  })

  it('runs Mon/Wed/Fri', () => {
    const r = rule({ rule_type: 'weekly', weekdays: [1, 3, 5], anchor_on: '2026-07-27' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-02')).toEqual([
      '2026-07-27', '2026-07-29', '2026-07-31',
    ])
  })

  // The phase of an every-2-weeks rule comes from its anchor, so two rules with
  // the same weekday can legitimately fall on alternating weeks.
  it('takes the phase of an every-2-weeks rule from the anchor', () => {
    const a = rule({ rule_type: 'weekly', step: 2, weekdays: [2], anchor_on: '2026-07-28' })
    expect(occurrencesBetween(a, '2026-07-27', '2026-08-31')).toEqual([
      '2026-07-28', '2026-08-11', '2026-08-25',
    ])

    const b = rule({ rule_type: 'weekly', step: 2, weekdays: [2], anchor_on: '2026-08-04' })
    expect(occurrencesBetween(b, '2026-07-27', '2026-08-31')).toEqual(['2026-08-04', '2026-08-18'])
  })

  it('spans a year boundary', () => {
    const r = rule({ rule_type: 'weekly', weekdays: [5], anchor_on: '2026-12-01' })
    expect(occurrencesBetween(r, '2026-12-20', '2027-01-10')).toEqual([
      '2026-12-25', '2027-01-01', '2027-01-08',
    ])
  })
})

describe('monthly_day', () => {
  it('clamps the 31st to the end of shorter months', () => {
    const r = rule({ rule_type: 'monthly_day', month_day: 31, anchor_on: '2026-01-31' })
    expect(occurrencesBetween(r, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
    ])
  })

  it('recovers the original day after a clamped month', () => {
    // The March occurrence must be the 31st, not stuck on February's 28th.
    const r = rule({ rule_type: 'monthly_day', month_day: 31, anchor_on: '2026-01-31' })
    expect(occurrencesBetween(r, '2026-03-01', '2026-03-31')).toEqual(['2026-03-31'])
  })

  it('takes the day from the anchor when none is set', () => {
    const r = rule({ rule_type: 'monthly_day', anchor_on: '2026-07-15' })
    expect(occurrencesBetween(r, '2026-07-01', '2026-09-30')).toEqual([
      '2026-07-15', '2026-08-15', '2026-09-15',
    ])
  })

  it('honours a step of 3 months', () => {
    const r = rule({ rule_type: 'monthly_day', step: 3, month_day: 1, anchor_on: '2026-01-01' })
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01',
    ])
  })
})

describe('monthly_last', () => {
  it('lands on the last day of each month through a common-year February', () => {
    const r = rule({ rule_type: 'monthly_last', anchor_on: '2026-01-31' })
    expect(occurrencesBetween(r, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31',
    ])
  })

  it('lands on 29 February in a leap year', () => {
    const r = rule({ rule_type: 'monthly_last', anchor_on: '2028-01-31' })
    expect(occurrencesBetween(r, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-31', '2028-02-29', '2028-03-31',
    ])
  })
})

describe('monthly_nth', () => {
  it('finds the 2nd Tuesday of each month', () => {
    const r = rule({ rule_type: 'monthly_nth', nth: 2, weekdays: [2], anchor_on: '2026-07-01' })
    expect(occurrencesBetween(r, '2026-07-01', '2026-09-30')).toEqual([
      '2026-07-14', '2026-08-11', '2026-09-08',
    ])
  })

  it('finds the last Friday of each month', () => {
    const r = rule({ rule_type: 'monthly_nth', nth: -1, weekdays: [5], anchor_on: '2026-07-01' })
    expect(occurrencesBetween(r, '2026-07-01', '2026-09-30')).toEqual([
      '2026-07-31', '2026-08-28', '2026-09-25',
    ])
  })

  it('skips a month that has no 5th occurrence rather than inventing one', () => {
    // February 2026 has only four Mondays.
    const r = rule({ rule_type: 'monthly_nth', nth: 5, weekdays: [1], anchor_on: '2026-01-01' })
    expect(occurrencesBetween(r, '2026-02-01', '2026-02-28')).toEqual([])
  })
})

describe('yearly', () => {
  it('repeats a birthday each year', () => {
    const r = rule({ rule_type: 'yearly', month: 6, month_day: 15, anchor_on: '2026-06-15' })
    expect(occurrencesBetween(r, '2026-01-01', '2028-12-31')).toEqual([
      '2026-06-15', '2027-06-15', '2028-06-15',
    ])
  })

  it('clamps 29 February to the 28th in common years', () => {
    const r = rule({ rule_type: 'yearly', month: 2, month_day: 29, anchor_on: '2028-02-29' })
    expect(occurrencesBetween(r, '2028-01-01', '2031-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28',
    ])
  })

  it('takes month and day from the anchor when unset', () => {
    const r = rule({ rule_type: 'yearly', anchor_on: '2026-03-01' })
    expect(occurrencesBetween(r, '2026-01-01', '2027-12-31')).toEqual(['2026-03-01', '2027-03-01'])
  })
})

describe('until_on', () => {
  it('stops the series at its end date', () => {
    const r = rule({
      rule_type: 'weekly',
      weekdays: [2],
      anchor_on: '2026-07-27',
      until_on: '2026-08-11',
    })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-31')).toEqual([
      '2026-07-28', '2026-08-04', '2026-08-11',
    ])
  })

  it('includes the until date itself', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-07-27', until_on: '2026-07-29' })
    expect(occurrencesBetween(r, '2026-07-27', '2026-08-31')).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29',
    ])
  })
})

describe('nextOccurrenceAfter', () => {
  it('finds the next weekly date strictly after the given day', () => {
    const r = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-27' })
    expect(nextOccurrenceAfter(r, '2026-07-28')).toBe('2026-08-04')
  })

  it('rolls a birthday that has already passed into next year', () => {
    const r = rule({ rule_type: 'yearly', month: 6, month_day: 15, anchor_on: '2026-06-15' })
    expect(nextOccurrenceAfter(r, '2026-07-27')).toBe('2027-06-15')
  })

  it('returns null once the series has ended', () => {
    const r = rule({ rule_type: 'daily', anchor_on: '2026-07-27', until_on: '2026-07-29' })
    expect(nextOccurrenceAfter(r, '2026-07-29')).toBeNull()
  })
})

describe('after_completion', () => {
  const car = rule({
    rule_type: 'after_completion',
    after_n: 6,
    after_unit: 'month',
    anchor_on: '2026-02-28',
  })

  // The car-service case: six months from 31 August is the end of February,
  // with the same day-of-month semantics as every other monthly rule.
  it('measures six months from the completion date, clamping the target month', () => {
    expect(nextAfterCompletion(car, '2026-08-31')).toBe('2027-02-28')
    expect(nextAfterCompletion(car, '2027-08-31')).toBe('2028-02-29')
  })

  it('measures in days and weeks too', () => {
    const days = rule({ rule_type: 'after_completion', after_n: 10, after_unit: 'day', anchor_on: '2026-07-27' })
    expect(nextAfterCompletion(days, '2026-07-27')).toBe('2026-08-06')

    const weeks = rule({ rule_type: 'after_completion', after_n: 10, after_unit: 'week', anchor_on: '2026-07-27' })
    expect(nextAfterCompletion(weeks, '2026-07-27')).toBe('2026-10-05')
  })

  it('respects until_on', () => {
    const ending = rule({ ...car, until_on: '2026-12-31' })
    expect(nextAfterCompletion(ending, '2026-08-31')).toBeNull()
  })

  // These series are not enumerable: the next date only exists once the
  // previous one has actually been ticked off, so there is no horizon to fill.
  it('yields nothing from occurrencesBetween', () => {
    expect(occurrencesBetween(car, '2026-01-01', '2027-12-31')).toEqual([])
  })
})

describe('describeRule', () => {
  it('states each rule in plain English', () => {
    expect(describeRule(rule({ rule_type: 'daily', anchor_on: '2026-07-27' }))).toBe('Every day')
    expect(describeRule(rule({ rule_type: 'daily', step: 3, anchor_on: '2026-07-27' })))
      .toBe('Every 3 days')
    expect(describeRule(rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-27' })))
      .toBe('Every Tuesday')
    expect(describeRule(rule({ rule_type: 'weekly', weekdays: [1, 3, 5], anchor_on: '2026-07-27' })))
      .toBe('Every Monday, Wednesday and Friday')
    expect(describeRule(rule({ rule_type: 'weekly', weekdays: [1, 2, 3, 4, 5], anchor_on: '2026-07-27' })))
      .toBe('Every weekday')
    expect(describeRule(rule({ rule_type: 'weekly', step: 2, weekdays: [2], anchor_on: '2026-07-27' })))
      .toBe('Every 2 weeks on Tuesday')
    expect(describeRule(rule({ rule_type: 'monthly_day', month_day: 15, anchor_on: '2026-07-15' })))
      .toBe('Monthly on the 15th')
    expect(describeRule(rule({ rule_type: 'monthly_last', anchor_on: '2026-07-31' })))
      .toBe('Last day of the month')
    expect(describeRule(rule({ rule_type: 'monthly_nth', nth: 2, weekdays: [2], anchor_on: '2026-07-01' })))
      .toBe('2nd Tuesday of the month')
    expect(describeRule(rule({ rule_type: 'monthly_nth', nth: -1, weekdays: [5], anchor_on: '2026-07-01' })))
      .toBe('Last Friday of the month')
    expect(describeRule(rule({ rule_type: 'yearly', month: 6, month_day: 15, anchor_on: '2026-06-15' })))
      .toBe('Every 15 June')
    expect(
      describeRule(rule({
        rule_type: 'after_completion', after_n: 6, after_unit: 'month', anchor_on: '2026-02-28',
      })),
    ).toBe('6 months after it was last done')
  })
})

describe('nthOccurrenceDate', () => {
  // "Ends after 10 times" is how people describe a finite series; until_on is
  // a date. This is where the one becomes the other.
  const tuesdays = rule({ rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-28' })

  it('counts the anchor as the first', () => {
    expect(nthOccurrenceDate(tuesdays, 1)).toBe('2026-07-28')
  })

  it('walks the rule forward for the nth', () => {
    expect(nthOccurrenceDate(tuesdays, 4)).toBe('2026-08-18')
  })

  it('reaches a long way for a slow rule', () => {
    const yearly = rule({ rule_type: 'yearly', anchor_on: '2026-03-01' })
    expect(nthOccurrenceDate(yearly, 5)).toBe('2030-03-01')
  })

  it('returns null when an existing end date cuts the rule short first', () => {
    const capped = rule({
      rule_type: 'weekly', weekdays: [2], anchor_on: '2026-07-28', until_on: '2026-08-10',
    })
    expect(nthOccurrenceDate(capped, 4)).toBeNull()
  })

  it('returns null for an after-completion rule, whose dates do not exist yet', () => {
    const service = rule({
      rule_type: 'after_completion', after_n: 6, after_unit: 'month', anchor_on: '2026-08-01',
    })
    expect(nthOccurrenceDate(service, 2)).toBeNull()
  })

  it('returns null for a nonsense count', () => {
    expect(nthOccurrenceDate(tuesdays, 0)).toBeNull()
  })
})
