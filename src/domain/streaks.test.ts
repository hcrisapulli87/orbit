import { describe, it, expect } from 'vitest'
import { bestStreak, completionRate, currentStreak } from './streaks'

const set = (...dates: string[]) => new Set(dates)

// Mon 27 Jul 2026 is "today" throughout.
const TODAY = '2026-07-27'

describe('currentStreak', () => {
  it('counts consecutive completed days for a daily habit', () => {
    const scheduled = ['2026-07-25', '2026-07-26', '2026-07-27']
    expect(currentStreak(scheduled, set(...scheduled), TODAY)).toBe(3)
  })

  // The whole point: a Mon/Wed/Fri habit is not broken by Tuesday, because
  // Tuesday was never scheduled. Counting calendar days would report 1.
  it('counts scheduled occurrences, not calendar days', () => {
    const scheduled = ['2026-07-17', '2026-07-20', '2026-07-22', '2026-07-24', '2026-07-27']
    expect(currentStreak(scheduled, set(...scheduled), TODAY)).toBe(5)
  })

  it('breaks on a scheduled day that was missed', () => {
    const scheduled = ['2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27']
    expect(currentStreak(scheduled, set('2026-07-24', '2026-07-26', '2026-07-27'), TODAY)).toBe(2)
  })

  // Grace for today: at 9am you haven't done it yet, and yesterday's streak
  // shouldn't read as already lost.
  it('does not break the streak just because today is still outstanding', () => {
    const scheduled = ['2026-07-25', '2026-07-26', '2026-07-27']
    expect(currentStreak(scheduled, set('2026-07-25', '2026-07-26'), TODAY)).toBe(2)
  })

  it('includes today once it is done', () => {
    const scheduled = ['2026-07-25', '2026-07-26', '2026-07-27']
    expect(currentStreak(scheduled, set('2026-07-25', '2026-07-26', '2026-07-27'), TODAY)).toBe(3)
  })

  it('gives no grace to yesterday', () => {
    const scheduled = ['2026-07-25', '2026-07-26', '2026-07-27']
    expect(currentStreak(scheduled, set('2026-07-25'), TODAY)).toBe(0)
  })

  it('ignores occurrences scheduled in the future', () => {
    const scheduled = ['2026-07-26', '2026-07-27', '2026-07-28', '2026-08-04']
    expect(currentStreak(scheduled, set('2026-07-26', '2026-07-27'), TODAY)).toBe(2)
  })

  it('is zero with nothing scheduled or nothing done', () => {
    expect(currentStreak([], set(), TODAY)).toBe(0)
    expect(currentStreak(['2026-07-26'], set(), TODAY)).toBe(0)
  })

  it('does not care what order the scheduled dates arrive in', () => {
    const scheduled = ['2026-07-27', '2026-07-25', '2026-07-26']
    expect(currentStreak(scheduled, set(...scheduled), TODAY)).toBe(3)
  })
})

describe('bestStreak', () => {
  it('finds the longest run anywhere in the history', () => {
    const scheduled = [
      '2026-07-01', '2026-07-02', '2026-07-03', // 3 done
      '2026-07-04',                             // missed
      '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', // 4 done
    ]
    const done = set(
      '2026-07-01', '2026-07-02', '2026-07-03',
      '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
    )
    expect(bestStreak(scheduled, done)).toBe(4)
  })

  it('is zero when nothing was ever done', () => {
    expect(bestStreak(['2026-07-01', '2026-07-02'], set())).toBe(0)
  })
})

describe('completionRate', () => {
  it('is the share of past scheduled days that were done', () => {
    const scheduled = ['2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27']
    expect(completionRate(scheduled, set('2026-07-24', '2026-07-26'), TODAY)).toBeCloseTo(0.5)
  })

  it('ignores the future, so a new habit does not start at zero percent', () => {
    const scheduled = ['2026-07-26', '2026-08-01', '2026-08-08']
    expect(completionRate(scheduled, set('2026-07-26'), TODAY)).toBe(1)
  })

  it('is zero when nothing is scheduled yet', () => {
    expect(completionRate([], set(), TODAY)).toBe(0)
  })
})
