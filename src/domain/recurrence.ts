// The recurrence engine: turning a stored rule into calendar days.
//
// Everything here is string-date arithmetic from ./day, so a daylight-saving
// transition can never shift, duplicate or drop an occurrence. There is no
// RRULE parsing and no date library: two of the seven rules Orbit needs
// (nth-weekday-of-month is awkward, interval-after-completion is impossible)
// aren't RRULE concepts at all, so the arithmetic has to be owned here anyway.

import {
  addDays,
  addMonthsClamped,
  compareISO,
  daysBetween,
  isoOf,
  lastDayOfMonth,
  nthWeekdayOfMonth,
  startOfWeek,
  weekdayOf,
} from './day'
import type { ISODate } from './day'
import type { RuleType } from './capture'

export type { RuleType }

export interface Rule {
  rule_type: RuleType
  /** "every N" — weeks, months or years depending on the type. */
  step: number
  /** 0 = Sunday … 6 = Saturday. Empty on a weekly rule means "the anchor's weekday". */
  weekdays: number[]
  /** Day of month for monthly_day / yearly. Falls back to the anchor's day. */
  month_day: number | null
  /** 1–4, or -1 for last, on monthly_nth. */
  nth: number | null
  /** 1–12 for yearly. Falls back to the anchor's month. */
  month: number | null
  after_n: number | null
  after_unit: 'day' | 'week' | 'month' | null
  /** The date the series is measured from; also its first possible occurrence. */
  anchor_on: ISODate
  /** Inclusive last date, or null for open-ended. */
  until_on: ISODate | null
}

const parts = (iso: ISODate): [number, number, number] =>
  iso.split('-').map(Number) as [number, number, number]

/** Months since year zero — makes "every N months" a modulo test. */
const monthIndex = (iso: ISODate): number => {
  const [y, m] = parts(iso)
  return y * 12 + (m - 1)
}

/**
 * All occurrences in [from, to] inclusive.
 *
 * after_completion rules return nothing: their next date only exists once the
 * previous one has actually been ticked, so there is no horizon to fill. That
 * is what keeps them to exactly one open occurrence at a time.
 */
export function occurrencesBetween(rule: Rule, from: ISODate, to: ISODate): ISODate[] {
  if (rule.rule_type === 'after_completion') return []

  // Never before the anchor, never after until_on.
  const start = compareISO(from, rule.anchor_on) < 0 ? rule.anchor_on : from
  const end = rule.until_on && compareISO(rule.until_on, to) < 0 ? rule.until_on : to
  if (compareISO(start, end) > 0) return []

  switch (rule.rule_type) {
    case 'daily':
      return daily(rule, start, end)
    case 'weekly':
      return weekly(rule, start, end)
    case 'monthly_day':
    case 'monthly_last':
    case 'monthly_nth':
      return monthly(rule, start, end)
    case 'yearly':
      return yearly(rule, start, end)
  }
}

function daily(rule: Rule, start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  // Step from the anchor so the phase is right even when `start` is later.
  let date = rule.anchor_on
  while (compareISO(date, start) < 0) date = addDays(date, rule.step)
  while (compareISO(date, end) <= 0) {
    out.push(date)
    date = addDays(date, rule.step)
  }
  return out
}

function weekly(rule: Rule, start: ISODate, end: ISODate): ISODate[] {
  const days = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(rule.anchor_on)]
  const anchorWeek = startOfWeek(rule.anchor_on, 1)
  const out: ISODate[] = []

  // Walk whole weeks; the step selects which of them are "on".
  let week = startOfWeek(start, 1)
  if (compareISO(week, anchorWeek) < 0) week = anchorWeek

  while (compareISO(week, end) <= 0) {
    const weeksIn = daysBetween(anchorWeek, week) / 7
    if (weeksIn % rule.step === 0) {
      for (const weekday of [...days].sort((a, b) => a - b)) {
        // Weeks start Monday, so Sunday is the 7th day, not the 1st.
        const date = addDays(week, (weekday - 1 + 7) % 7)
        if (compareISO(date, start) >= 0 && compareISO(date, end) <= 0) out.push(date)
      }
    }
    week = addDays(week, 7)
  }
  return out
}

function monthly(rule: Rule, start: ISODate, end: ISODate): ISODate[] {
  const anchorMonths = monthIndex(rule.anchor_on)
  // The stored day wins over the anchor's, so a run clamped by February
  // recovers: 31 Jan → 28 Feb → 31 Mar, never → 28 Mar.
  const day = rule.month_day ?? parts(rule.anchor_on)[2]
  const out: ISODate[] = []

  for (let mi = monthIndex(start); mi <= monthIndex(end); mi++) {
    const offset = mi - anchorMonths
    if (offset < 0 || offset % rule.step !== 0) continue

    const year = Math.floor(mi / 12)
    const month = (mi % 12) + 1
    const date =
      rule.rule_type === 'monthly_last'
        ? isoOf(year, month, lastDayOfMonth(year, month))
        : rule.rule_type === 'monthly_nth'
          ? nthWeekdayOfMonth(year, month, rule.weekdays[0] ?? weekdayOf(rule.anchor_on), rule.nth ?? 1)
          : isoOf(year, month, Math.min(day, lastDayOfMonth(year, month)))

    // nthWeekdayOfMonth returns null for, say, a 5th Monday that doesn't exist.
    // Skipping the month is the honest answer; inventing a nearby date isn't.
    if (date && compareISO(date, start) >= 0 && compareISO(date, end) <= 0) out.push(date)
  }
  return out
}

function yearly(rule: Rule, start: ISODate, end: ISODate): ISODate[] {
  const [anchorYear, anchorMonth, anchorDay] = parts(rule.anchor_on)
  const month = rule.month ?? anchorMonth
  const day = rule.month_day ?? anchorDay
  const out: ISODate[] = []

  for (let year = parts(start)[0]; year <= parts(end)[0]; year++) {
    const offset = year - anchorYear
    if (offset < 0 || offset % rule.step !== 0) continue
    // 29 February in a common year clamps to the 28th.
    const date = isoOf(year, month, Math.min(day, lastDayOfMonth(year, month)))
    if (compareISO(date, start) >= 0 && compareISO(date, end) <= 0) out.push(date)
  }
  return out
}

/** The first occurrence strictly after `after`, or null if the series has ended. */
export function nextOccurrenceAfter(rule: Rule, after: ISODate): ISODate | null {
  if (rule.rule_type === 'after_completion') return nextAfterCompletion(rule, after)

  // Two years is comfortably past the longest gap any supported rule can leave.
  const horizon = addDays(after, 366 * 2 * rule.step)
  const end = rule.until_on && compareISO(rule.until_on, horizon) < 0 ? rule.until_on : horizon
  const from = addDays(after, 1)
  if (compareISO(from, end) > 0) return null

  return occurrencesBetween(rule, from, end)[0] ?? null
}

/**
 * The next date for an interval-after-completion rule, measured from when the
 * job was actually done rather than from a fixed calendar date. Month intervals
 * clamp exactly like every other monthly rule, so six months from 31 August is
 * the end of February.
 */
export function nextAfterCompletion(rule: Rule, completedOn: ISODate): ISODate | null {
  const n = rule.after_n ?? 1
  const next =
    rule.after_unit === 'week' ? addDays(completedOn, n * 7)
    : rule.after_unit === 'month' ? addMonthsClamped(completedOn, n)
    : addDays(completedOn, n)

  if (rule.until_on && compareISO(next, rule.until_on) > 0) return null
  return next
}

// ── describing a rule ────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const NTH_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' }

function ordinalDay(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** Plain-English summary, shown wherever a series is listed. */
export function describeRule(rule: Rule): string {
  const days = (rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(rule.anchor_on)])
    .map((d) => WEEKDAY_LABELS[d])

  switch (rule.rule_type) {
    case 'daily':
      return rule.step === 1 ? 'Every day' : `Every ${rule.step} days`

    case 'weekly': {
      const isWeekdays =
        rule.weekdays.length === 5 && rule.weekdays.every((d) => d >= 1 && d <= 5)
      if (rule.step === 1) return isWeekdays ? 'Every weekday' : `Every ${joinWords(days)}`
      return `Every ${rule.step} weeks on ${joinWords(days)}`
    }

    case 'monthly_day': {
      const day = rule.month_day ?? parts(rule.anchor_on)[2]
      const every = rule.step === 1 ? 'Monthly' : `Every ${rule.step} months`
      return `${every} on the ${ordinalDay(day)}`
    }

    case 'monthly_last':
      return 'Last day of the month'

    case 'monthly_nth':
      return `${rule.nth === -1 ? 'Last' : NTH_LABELS[rule.nth ?? 1]} ${days[0]} of the month`

    case 'yearly': {
      const [, anchorMonth, anchorDay] = parts(rule.anchor_on)
      const label = `${rule.month_day ?? anchorDay} ${MONTH_LABELS[(rule.month ?? anchorMonth) - 1]}`
      return rule.step === 1 ? `Every ${label}` : `Every ${rule.step} years on ${label}`
    }

    case 'after_completion': {
      const n = rule.after_n ?? 1
      const unit = rule.after_unit ?? 'day'
      return `${n} ${unit}${n === 1 ? '' : 's'} after it was last done`
    }
  }
}
