import { describe, it, expect } from 'vitest'
import {
  toLocalISODate,
  todayISO,
  isoOf,
  addDays,
  daysBetween,
  weekdayOf,
  startOfWeek,
  lastDayOfMonth,
  addMonthsClamped,
  nthWeekdayOfMonth,
  lastNDates,
  compareISO,
  relativeLabel,
  parseTimeToMinutes,
  formatTime,
} from './day'

describe('toLocalISODate / todayISO', () => {
  it('formats a Date by its LOCAL calendar day', () => {
    expect(toLocalISODate(new Date(2026, 6, 27))).toBe('2026-07-27')
  })

  it('pads single-digit months and days', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses the local day even late at night, where toISOString() would roll over', () => {
    // 23:30 local. In any timezone east of UTC, toISOString() would report the
    // NEXT day — the exact bug this module exists to avoid.
    expect(todayISO(new Date(2026, 6, 27, 23, 30))).toBe('2026-07-27')
  })
})

describe('isoOf', () => {
  it('builds an ISO day from 1-based month parts', () => {
    expect(isoOf(2026, 7, 4)).toBe('2026-07-04')
  })
})

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-07-27', 3)).toBe('2026-07-30')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('subtracts with a negative delta', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  // These two exist to PROVE the YYYY-MM-DD string model is immune to DST.
  // A Date-arithmetic or UTC-based implementation drops or repeats a day here,
  // which is the whole reason this app has no date library.
  it('produces exactly 7 consecutive days across the Melbourne DST start', () => {
    // AEST → AEDT: clocks jump forward at 02:00 on Sun 4 Oct 2026.
    const days = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays('2026-10-01', n))
    expect(days).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ])
  })

  it('produces exactly 7 consecutive days across the Melbourne DST end', () => {
    // AEDT → AEST: clocks fall back at 03:00 on Sun 5 Apr 2026.
    const days = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => addDays('2026-04-02', n))
    expect(days).toEqual([
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
    ])
  })
})

describe('daysBetween', () => {
  it('counts forward', () => {
    expect(daysBetween('2026-07-27', '2026-07-30')).toBe(3)
  })

  it('is negative when the target is in the past', () => {
    expect(daysBetween('2026-07-30', '2026-07-27')).toBe(-3)
  })

  it('is zero for the same day', () => {
    expect(daysBetween('2026-07-27', '2026-07-27')).toBe(0)
  })

  it('spans a DST transition without a half-day rounding error', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7)
    expect(daysBetween('2026-04-02', '2026-04-09')).toBe(7)
  })
})

describe('weekdayOf', () => {
  it('returns 0 for Sunday through 6 for Saturday', () => {
    expect(weekdayOf('2026-07-26')).toBe(0) // Sunday
    expect(weekdayOf('2026-07-27')).toBe(1) // Monday
    expect(weekdayOf('2026-07-28')).toBe(2) // Tuesday
    expect(weekdayOf('2026-08-01')).toBe(6) // Saturday
  })
})

describe('startOfWeek', () => {
  it('defaults to a Monday-start week', () => {
    expect(startOfWeek('2026-07-30')).toBe('2026-07-27')
  })

  it('returns the day itself when it is already the start', () => {
    expect(startOfWeek('2026-07-27')).toBe('2026-07-27')
  })

  it('handles Sunday correctly on a Monday-start week (goes back 6 days)', () => {
    expect(startOfWeek('2026-07-26')).toBe('2026-07-20')
  })

  it('supports a Sunday-start week', () => {
    expect(startOfWeek('2026-07-30', 0)).toBe('2026-07-26')
  })
})

describe('lastDayOfMonth', () => {
  it('knows the 30-day months', () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30)
    expect(lastDayOfMonth(2026, 11)).toBe(30)
  })

  it('knows the 31-day months', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31)
    expect(lastDayOfMonth(2026, 12)).toBe(31)
  })

  it('knows February in a common year and a leap year', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28)
    expect(lastDayOfMonth(2028, 2)).toBe(29)
  })

  it('applies the 100/400 century rules', () => {
    expect(lastDayOfMonth(2100, 2)).toBe(28)
    expect(lastDayOfMonth(2000, 2)).toBe(29)
  })
})

describe('addMonthsClamped', () => {
  it('keeps the day of month when it exists in the target month', () => {
    expect(addMonthsClamped('2026-07-15', 1)).toBe('2026-08-15')
  })

  it('clamps to the last day when the target month is shorter', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('clamps into a leap February', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
  })

  // The car-service case from the spec.
  it('lands a 6-months-after-completion rule from 31 Aug on the end of February', () => {
    expect(addMonthsClamped('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonthsClamped('2027-08-31', 6)).toBe('2028-02-29')
  })

  it('crosses a year boundary', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('goes backwards with a negative month count', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('honours an explicit preferred day, so a clamped series recovers its original day', () => {
    // A monthly-on-the-31st series: Feb clamps to 28, but March must go back to 31
    // rather than staying stuck on 28 forever.
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31')
  })
})

describe('nthWeekdayOfMonth', () => {
  it('finds the 2nd Tuesday', () => {
    // July 2026: Tuesdays fall on 7, 14, 21, 28.
    expect(nthWeekdayOfMonth(2026, 7, 2, 2)).toBe('2026-07-14')
  })

  it('finds the 1st Monday', () => {
    expect(nthWeekdayOfMonth(2026, 7, 1, 1)).toBe('2026-07-06')
  })

  it('finds the last Friday with nth = -1', () => {
    // July 2026: Fridays fall on 3, 10, 17, 24, 31.
    expect(nthWeekdayOfMonth(2026, 7, 5, -1)).toBe('2026-07-31')
  })

  it('finds the last day-of-week in a short month', () => {
    // February 2026: Mondays fall on 2, 9, 16, 23.
    expect(nthWeekdayOfMonth(2026, 2, 1, -1)).toBe('2026-02-23')
  })

  it('returns null when the nth occurrence does not exist', () => {
    expect(nthWeekdayOfMonth(2026, 2, 1, 5)).toBeNull()
  })

  it('returns the 5th occurrence when the month does have one', () => {
    expect(nthWeekdayOfMonth(2026, 7, 5, 5)).toBe('2026-07-31')
  })
})

describe('lastNDates', () => {
  it('returns n dates ending at today, oldest first', () => {
    expect(lastNDates(3, '2026-07-27')).toEqual(['2026-07-25', '2026-07-26', '2026-07-27'])
  })
})

describe('compareISO', () => {
  it('orders chronologically', () => {
    expect(compareISO('2026-07-27', '2026-07-28')).toBeLessThan(0)
    expect(compareISO('2026-07-28', '2026-07-27')).toBeGreaterThan(0)
    expect(compareISO('2026-07-27', '2026-07-27')).toBe(0)
  })

  it('sorts correctly across year boundaries as plain strings', () => {
    const sorted = ['2027-01-01', '2026-12-31', '2026-02-09'].sort(compareISO)
    expect(sorted).toEqual(['2026-02-09', '2026-12-31', '2027-01-01'])
  })
})

describe('relativeLabel', () => {
  const today = '2026-07-27'

  it('names the days either side of today', () => {
    expect(relativeLabel('2026-07-27', today)).toBe('Today')
    expect(relativeLabel('2026-07-28', today)).toBe('Tomorrow')
    expect(relativeLabel('2026-07-26', today)).toBe('Yesterday')
  })

  it('uses the weekday name inside the coming week', () => {
    expect(relativeLabel('2026-07-30', today)).toBe('Thursday')
  })

  it('uses a short date beyond a week out', () => {
    expect(relativeLabel('2026-08-14', today)).toBe('14 Aug')
  })

  it('includes the year when the date is in a different year', () => {
    expect(relativeLabel('2027-03-01', today)).toBe('1 Mar 2027')
  })

  it('counts overdue days in the recent past', () => {
    expect(relativeLabel('2026-07-24', today)).toBe('3 days ago')
  })
})

describe('parseTimeToMinutes', () => {
  it('parses HH:MM', () => {
    expect(parseTimeToMinutes('15:30')).toBe(930)
    expect(parseTimeToMinutes('00:00')).toBe(0)
  })

  it('tolerates seconds, which Postgres time columns include', () => {
    expect(parseTimeToMinutes('15:30:00')).toBe(930)
  })

  it('returns null for junk', () => {
    expect(parseTimeToMinutes('')).toBeNull()
    expect(parseTimeToMinutes('nope')).toBeNull()
    expect(parseTimeToMinutes('25:00')).toBeNull()
  })
})

describe('formatTime', () => {
  it('drops :00 on the hour', () => {
    expect(formatTime('15:00')).toBe('3pm')
    expect(formatTime('09:00')).toBe('9am')
  })

  it('keeps the minutes otherwise', () => {
    expect(formatTime('15:30')).toBe('3:30pm')
  })

  it('renders the two midnight/midday edge cases as 12', () => {
    expect(formatTime('00:00')).toBe('12am')
    expect(formatTime('12:00')).toBe('12pm')
  })

  it('returns an empty string for junk rather than throwing', () => {
    expect(formatTime('nope')).toBe('')
  })
})
