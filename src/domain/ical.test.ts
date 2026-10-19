import { describe, it, expect } from 'vitest'
import {
  daySlices, expandEvents, feedToSlices, parseDuration, parseICal, parseRRule, parseTime,
  resolveZone, ruleDates,
} from './ical'
import type { RRule } from './ical'

const MEL = 'Australia/Melbourne'

/** A feed around some VEVENT bodies, CRLF-terminated like the real thing. */
const feed = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e.trim().split('\n').map((l) => l.trim()), 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n')

const rule = (value: string): RRule => {
  const r = parseRRule(value)
  if (!r) throw new Error(`bad rule ${value}`)
  return r
}

describe('parseTime', () => {
  it('reads date, local, UTC and zoned values', () => {
    expect(parseTime('20261020', { VALUE: 'DATE' })).toEqual({ date: '2026-10-20', minutes: null, zone: null })
    expect(parseTime('20261020T093000')).toEqual({ date: '2026-10-20', minutes: 570, zone: null })
    expect(parseTime('20261020T093000Z')).toEqual({ date: '2026-10-20', minutes: 570, zone: 'UTC' })
    expect(parseTime('20261020T093000', { TZID: 'Australia/Sydney' })?.zone).toBe('Australia/Sydney')
    expect(parseTime('nonsense')).toBeNull()
  })
})

describe('resolveZone', () => {
  it('accepts IANA, maps Windows names, strips vendor prefixes', () => {
    expect(resolveZone('Europe/London')).toBe('Europe/London')
    expect(resolveZone('AUS Eastern Standard Time')).toBe('Australia/Sydney')
    expect(resolveZone('/mozilla.org/20050126_1/Australia/Melbourne')).toBe(MEL)
    expect(resolveZone('Made Up Time')).toBeNull()
  })
})

describe('parseDuration', () => {
  it('reads weeks, days, hours and minutes', () => {
    expect(parseDuration('PT1H30M')).toBe(90)
    expect(parseDuration('P1D')).toBe(1440)
    expect(parseDuration('P1W')).toBe(10080)
    expect(parseDuration('junk')).toBeNull()
  })
})

describe('parseICal', () => {
  it('unfolds lines, unescapes text, and ignores alarms', () => {
    const [e] = parseICal(feed(`
      UID:abc
      SUMMARY:Lunch\\, with Sam
      DTSTART;TZID=Australia/Melbourne:20261020T123000
      DTEND;TZID=Australia/Melbourne:20261020T133000
      BEGIN:VALARM
      TRIGGER:-PT15M
      DTSTART:19700101T000000
      END:VALARM
    `).replace('Lunch\\, with Sam', 'Lunch\\, with\r\n  Sam'))
    expect(e.summary).toBe('Lunch, with Sam')
    expect(e.start).toEqual({ date: '2026-10-20', minutes: 750, zone: MEL })
    expect(e.end?.minutes).toBe(810)
  })

  it('reads cancelled and free events', () => {
    const [a, b] = parseICal(feed('UID:a\nDTSTART:20261020\nSTATUS:CANCELLED', 'UID:b\nDTSTART:20261020\nTRANSP:TRANSPARENT'))
    expect(a.cancelled).toBe(true)
    expect(b.busy).toBe(false)
  })
})

describe('ruleDates', () => {
  it('weekly on several days, with an interval', () => {
    // A Monday start; every second week on Mon and Wed.
    expect(ruleDates(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'), '2026-10-05', '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-05', '2026-10-07', '2026-10-19', '2026-10-21'])
  })

  it('monthly on the second Tuesday and the last Friday', () => {
    expect(ruleDates(rule('FREQ=MONTHLY;BYDAY=2TU'), '2026-01-13', '2026-09-01', '2026-11-30'))
      .toEqual(['2026-09-08', '2026-10-13', '2026-11-10'])
    expect(ruleDates(rule('FREQ=MONTHLY;BYDAY=-1FR'), '2026-01-30', '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-30'])
  })

  it('monthly on the 31st skips short months', () => {
    expect(ruleDates(rule('FREQ=MONTHLY'), '2026-01-31', '2026-01-01', '2026-05-31'))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })

  it('respects COUNT from the very start, not from the window', () => {
    expect(ruleDates(rule('FREQ=DAILY;COUNT=5'), '2026-10-01', '2026-10-04', '2026-10-31'))
      .toEqual(['2026-10-04', '2026-10-05'])
  })

  it('stops at UNTIL', () => {
    expect(ruleDates(rule('FREQ=DAILY'), '2026-10-01', '2026-10-01', '2026-10-31', (d) => d > '2026-10-03'))
      .toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('skips ahead cheaply for a rule that started years ago', () => {
    expect(ruleDates(rule('FREQ=DAILY'), '2015-01-01', '2026-10-20', '2026-10-21'))
      .toEqual(['2026-10-20', '2026-10-21'])
  })

  it('yearly on a date, and refuses rules it would misread', () => {
    expect(ruleDates(rule('FREQ=YEARLY'), '2020-03-14', '2026-01-01', '2027-12-31'))
      .toEqual(['2026-03-14', '2027-03-14'])
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1')).toBeNull()
    expect(parseRRule('FREQ=HOURLY')).toBeNull()
  })
})

describe('expandEvents', () => {
  it('puts a zoned meeting at the right local time', () => {
    // 9am in Perth (+8) is noon in Melbourne (+11 in October).
    const events = parseICal(feed('UID:p\nDTSTART;TZID=Australia/Perth:20261020T090000\nDURATION:PT1H'))
    const [s] = feedToSlices(feed('UID:p\nDTSTART;TZID=Australia/Perth:20261020T090000\nDURATION:PT1H'), '2026-10-20', '2026-10-20', MEL)
    expect(events).toHaveLength(1)
    expect(s).toMatchObject({ day: '2026-10-20', startMin: 720, endMin: 780, allDay: false })
  })

  it('keeps a weekly meeting at 9am local across a daylight-saving change', () => {
    const text = feed('UID:w\nDTSTART;TZID=Australia/Melbourne:20260928T090000\nDTEND;TZID=Australia/Melbourne:20260928T093000\nRRULE:FREQ=WEEKLY')
    const slices = feedToSlices(text, '2026-09-28', '2026-10-12', MEL)
    expect(slices.map((s) => [s.day, s.startMin])).toEqual([
      ['2026-09-28', 540], ['2026-10-05', 540], ['2026-10-12', 540],
    ])
  })

  it('drops excluded dates and moves overridden occurrences', () => {
    const text = feed(
      'UID:s\nDTSTART;TZID=Australia/Melbourne:20261019T100000\nDURATION:PT15M\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE;TZID=Australia/Melbourne:20261020T100000',
      'UID:s\nRECURRENCE-ID;TZID=Australia/Melbourne:20261021T100000\nDTSTART;TZID=Australia/Melbourne:20261021T140000\nDURATION:PT15M\nSUMMARY:Moved',
      'UID:s\nRECURRENCE-ID;TZID=Australia/Melbourne:20261022T100000\nDTSTART;TZID=Australia/Melbourne:20261022T100000\nSTATUS:CANCELLED',
    )
    const slices = feedToSlices(text, '2026-10-19', '2026-10-25', MEL)
    expect(slices.map((s) => [s.day, s.startMin, s.title])).toEqual([
      ['2026-10-19', 600, ''],
      ['2026-10-21', 840, 'Moved'],
    ])
  })

  it('stops a timed rule at a UTC UNTIL', () => {
    const text = feed('UID:u\nDTSTART;TZID=Australia/Melbourne:20261019T090000\nDURATION:PT30M\nRRULE:FREQ=DAILY;UNTIL=20261020T220000Z')
    // 22:00Z on the 20th is 09:00 on the 21st, so the 21st is the last one.
    expect(feedToSlices(text, '2026-10-19', '2026-10-31', MEL).map((s) => s.day))
      .toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('skips cancelled one-off events', () => {
    expect(expandEvents(parseICal(feed('UID:c\nDTSTART:20261020T090000Z\nSTATUS:CANCELLED')), '2026-10-19', '2026-10-21', MEL)).toEqual([])
  })
})

describe('daySlices', () => {
  it('splits an event that runs past midnight', () => {
    const text = feed('UID:n\nDTSTART;TZID=Australia/Melbourne:20261020T230000\nDTEND;TZID=Australia/Melbourne:20261021T010000')
    expect(feedToSlices(text, '2026-10-19', '2026-10-22', MEL).map((s) => [s.day, s.startMin, s.endMin])).toEqual([
      ['2026-10-20', 1380, 1440],
      ['2026-10-21', 0, 60],
    ])
  })

  it('ends an event at midnight on the day it started', () => {
    const text = feed('UID:m\nDTSTART;TZID=Australia/Melbourne:20261020T220000\nDTEND;TZID=Australia/Melbourne:20261021T000000')
    expect(feedToSlices(text, '2026-10-19', '2026-10-22', MEL).map((s) => [s.day, s.endMin])).toEqual([['2026-10-20', 1440]])
  })

  it('lays an all-day event over each of its days, end exclusive', () => {
    const text = feed('UID:a\nDTSTART;VALUE=DATE:20261020\nDTEND;VALUE=DATE:20261023\nSUMMARY:Conference')
    expect(feedToSlices(text, '2026-10-01', '2026-10-31', MEL).map((s) => [s.day, s.allDay])).toEqual([
      ['2026-10-20', true], ['2026-10-21', true], ['2026-10-22', true],
    ])
  })

  it('keeps only days inside the window', () => {
    const occ = expandEvents(parseICal(feed('UID:a\nDTSTART;VALUE=DATE:20261020\nDTEND;VALUE=DATE:20261023')), '2026-10-01', '2026-10-31', MEL)
    expect(daySlices(occ, '2026-10-21', '2026-10-21', MEL).map((s) => s.day)).toEqual(['2026-10-21'])
  })
})
