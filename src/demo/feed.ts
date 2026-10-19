// The demo's connected calendar: a work calendar as an .ics feed, built fresh
// for "today" like the rest of the seed.
//
// It is text, not rows, on purpose. The real app receives a feed as text from
// the calendar-feed function and parses it in the browser, so the demo hands
// the same parser the same kind of input: a repeating stand-up with an
// exception, a meeting that clashes with a timed task, a moved occurrence, an
// all-day event that's marked free. Times are floating (no zone), so the demo
// reads the same wherever it's opened.

import { addDays, startOfWeek } from '../domain/day'

const stamp = (date: string, hhmm: string) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`
const day = (date: string) => date.replace(/-/g, '')

export function buildDemoFeed(today: string): string {
  const monday = startOfWeek(today, 1)
  const tomorrow = addDays(today, 1)
  const events = [
    [
      'UID:demo-standup', 'SUMMARY:Stand-up',
      `DTSTART:${stamp(addDays(monday, -14), '09:15')}`, `DTEND:${stamp(addDays(monday, -14), '09:30')}`,
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      // No stand-up the day after tomorrow, and tomorrow's runs late.
      `EXDATE:${stamp(addDays(today, 2), '09:15')}`,
    ],
    [
      'UID:demo-standup', 'SUMMARY:Stand-up (moved)',
      `RECURRENCE-ID:${stamp(tomorrow, '09:15')}`,
      `DTSTART:${stamp(tomorrow, '10:00')}`, `DTEND:${stamp(tomorrow, '10:15')}`,
    ],
    ['UID:demo-review', 'SUMMARY:Design review', `DTSTART:${stamp(today, '11:00')}`, `DTEND:${stamp(today, '12:00')}`],
    ['UID:demo-1on1', 'SUMMARY:1:1 with Priya', `DTSTART:${stamp(today, '14:00')}`, 'DURATION:PT45M'],
    ['UID:demo-client', 'SUMMARY:Client call — Marchetti', `DTSTART:${stamp(tomorrow, '13:30')}`, `DTEND:${stamp(tomorrow, '14:30')}`],
    [
      'UID:demo-offsite', 'SUMMARY:Team offsite', 'TRANSP:TRANSPARENT',
      `DTSTART;VALUE=DATE:${day(addDays(today, 3))}`, `DTEND;VALUE=DATE:${day(addDays(today, 5))}`,
    ],
  ]
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Demo//EN',
    ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n')
}
