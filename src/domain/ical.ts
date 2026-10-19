// Reading a calendar feed: the .ics text Google, Outlook and iCloud publish
// at a private address.
//
// Orbit only ever reads these. The output is a list of events in a window
// around today, and from them, slices of time on local calendar days — which
// is all the planner, Today and the calendar grid need to know about a meeting.
//
// The parser covers what real feeds actually contain rather than all of RFC
// 5545: events, all-day events, durations, time zones by IANA or Windows name,
// and repeat rules (daily, weekly, monthly, yearly; interval, count, until,
// by-day with "2nd Tuesday" ordinals, by-month-day, by-month), with excluded
// dates and moved occurrences. Anything it doesn't understand is skipped
// rather than guessed at.

import { addDays, compareISO, isoOf, lastDayOfMonth, nthWeekdayOfMonth, startOfWeek, weekdayOf } from './day'
import type { ISODate } from './day'
import { instantFromWall, isKnownZone, wallInZone } from './zone'

// ── the raw shape ────────────────────────────────────────────────────────────

/** A DTSTART-style value: a day, and a time of day unless it's all-day. */
export interface ICalTime {
  date: ISODate
  /** Minutes since midnight; null for a date-only (all-day) value. */
  minutes: number | null
  /** IANA zone; 'UTC' for a Z suffix; null for floating local time. */
  zone: string | null
}

export interface ByDay {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  /** 2 for 2TU, -1 for -1FR; null for a plain weekday. */
  nth: number | null
}

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: ICalTime | null
  byDay: ByDay[]
  byMonthDay: number[]
  byMonth: number[]
}

export interface ICalEvent {
  uid: string
  summary: string
  start: ICalTime
  end: ICalTime | null
  /** From DURATION, when there is no DTEND. */
  durationMin: number | null
  rrule: RRule | null
  exdates: ICalTime[]
  recurrenceId: ICalTime | null
  cancelled: boolean
  /** TRANSP:TRANSPARENT means "show as free". */
  busy: boolean
}

// ── lines and values ─────────────────────────────────────────────────────────

interface Line {
  name: string
  params: Record<string, string>
  value: string
}

/** RFC 5545 folds long lines by starting the continuation with a space or tab. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

/** `DTSTART;TZID="Australia/Sydney":20261020T090000` → name, params, value. */
function parseLine(raw: string): Line | null {
  let inQuotes = false
  let colon = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') inQuotes = !inQuotes
    else if (raw[i] === ':' && !inQuotes) {
      colon = i
      break
    }
  }
  if (colon < 0) return null

  const head = raw.slice(0, colon)
  const value = raw.slice(colon + 1)
  const pieces = head.match(/(?:[^;"]|"[^"]*")+/g) ?? []
  const params: Record<string, string> = {}
  for (const piece of pieces.slice(1)) {
    const eq = piece.indexOf('=')
    if (eq > 0) params[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: (pieces[0] ?? '').toUpperCase(), params, value }
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

/**
 * Outlook writes Windows zone names. These are the common ones; an unknown
 * name falls back to floating time, which is right whenever the feed's zone
 * is the one you live in — by far the usual case for a personal calendar.
 */
const WINDOWS_ZONES: Record<string, string> = {
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  UTC: 'UTC',
}

export function resolveZone(tzid: string | undefined): string | null {
  if (!tzid) return null
  const name = tzid.trim()
  if (isKnownZone(name)) return name
  if (WINDOWS_ZONES[name]) return WINDOWS_ZONES[name]
  // Some exporters prefix the IANA name with a vendor path:
  // "/mozilla.org/20050126_1/Australia/Melbourne".
  const tail = /([A-Za-z_]+\/[A-Za-z_+-]+)$/.exec(name)?.[1]
  return tail && isKnownZone(tail) ? tail : null
}

/** `20261020`, `20261020T090000`, `20261020T090000Z`, with an optional TZID. */
export function parseTime(value: string, params: Record<string, string> = {}): ICalTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const date = isoOf(Number(m[1]), Number(m[2]), Number(m[3]))
  if (m[4] === undefined || params.VALUE === 'DATE') return { date, minutes: null, zone: null }
  const minutes = Number(m[4]) * 60 + Number(m[5])
  return { date, minutes, zone: m[7] ? 'UTC' : resolveZone(params.TZID) }
}

/** `PT1H30M`, `P1D`, `P2W` → minutes. Seconds are dropped. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim())
  if (!m) return null
  const [, sign, w, d, h, mi] = m
  const total = (Number(w ?? 0) * 7 + Number(d ?? 0)) * 1440 + Number(h ?? 0) * 60 + Number(mi ?? 0)
  return sign === '-' ? -total : total
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function parseRRule(value: string): RRule | null {
  const parts = new Map(
    value.split(';').map((p) => {
      const [k, v = ''] = p.split('=')
      return [k.toUpperCase(), v] as const
    }),
  )
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  // BYSETPOS and the sub-daily rules change which days are chosen in ways a
  // partial reading would get wrong, so a rule using them isn't expanded.
  if (parts.has('BYSETPOS') || parts.has('BYWEEKNO') || parts.has('BYYEARDAY')) return null

  const list = (key: string) => (parts.get(key) ?? '').split(',').filter(Boolean)
  const byDay: ByDay[] = []
  for (const code of list('BYDAY')) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(code.toUpperCase())
    if (!m) return null
    byDay.push({ weekday: WEEKDAY_CODES.indexOf(m[2]), nth: m[1] ? Number(m[1]) : null })
  }
  const until = parts.get('UNTIL')
  return {
    freq,
    interval: Math.max(1, Number(parts.get('INTERVAL') ?? 1) || 1),
    count: parts.has('COUNT') ? Number(parts.get('COUNT')) : null,
    until: until ? parseTime(until) : null,
    byDay,
    byMonthDay: list('BYMONTHDAY').map(Number).filter((n) => n !== 0 && Number.isFinite(n)),
    byMonth: list('BYMONTH').map(Number).filter((n) => n >= 1 && n <= 12),
  }
}

/** Every VEVENT in a feed. Events without a start are dropped. */
export function parseICal(text: string): ICalEvent[] {
  const events: ICalEvent[] = []
  let current: Partial<ICalEvent> & { exdates: ICalTime[] } | null = null
  // Nested components (VALARM) carry their own DTSTART-like lines that must
  // not leak into the event around them.
  let depth = 0

  for (const raw of unfold(text)) {
    const line = parseLine(raw)
    if (!line) continue

    if (line.name === 'BEGIN') {
      if (line.value.toUpperCase() === 'VEVENT' && current === null) {
        current = { exdates: [], busy: true, cancelled: false, summary: '' }
        depth = 0
      } else if (current) depth++
      continue
    }
    if (line.name === 'END') {
      if (current && depth > 0) depth--
      else if (current && line.value.toUpperCase() === 'VEVENT') {
        if (current.start && current.uid !== undefined) {
          events.push({
            uid: current.uid,
            summary: current.summary ?? '',
            start: current.start,
            end: current.end ?? null,
            durationMin: current.durationMin ?? null,
            rrule: current.rrule ?? null,
            exdates: current.exdates,
            recurrenceId: current.recurrenceId ?? null,
            cancelled: current.cancelled ?? false,
            busy: current.busy ?? true,
          })
        }
        current = null
      }
      continue
    }
    if (!current || depth > 0) continue

    switch (line.name) {
      case 'UID': current.uid = line.value; break
      case 'SUMMARY': current.summary = unescapeText(line.value); break
      case 'DTSTART': current.start = parseTime(line.value, line.params) ?? undefined; break
      case 'DTEND': current.end = parseTime(line.value, line.params) ?? undefined; break
      case 'DURATION': current.durationMin = parseDuration(line.value) ?? undefined; break
      case 'RRULE': current.rrule = parseRRule(line.value) ?? undefined; break
      case 'RECURRENCE-ID': current.recurrenceId = parseTime(line.value, line.params) ?? undefined; break
      case 'STATUS': current.cancelled = line.value.toUpperCase() === 'CANCELLED'; break
      case 'TRANSP': current.busy = line.value.toUpperCase() !== 'TRANSPARENT'; break
      case 'EXDATE':
        for (const v of line.value.split(',')) {
          const t = parseTime(v, line.params)
          if (t) current.exdates.push(t)
        }
        break
    }
  }
  // A feed with a UID-less event is malformed, but the event is still real.
  return events.map((e, i) => (e.uid ? e : { ...e, uid: `orbit-anon-${i}` }))
}

// ── repeat rules ─────────────────────────────────────────────────────────────

/** Every date in a month that is the given weekday. */
function weekdaysInMonth(year: number, month: number, weekday: number): ISODate[] {
  const out: ISODate[] = []
  for (let n = 1; n <= 5; n++) {
    const d = nthWeekdayOfMonth(year, month, weekday, n)
    if (d) out.push(d)
  }
  return out
}

/** The days a MONTHLY (or one month of a YEARLY) rule picks in a month. */
function daysInMonthFor(year: number, month: number, rule: RRule, defaultDay: number): ISODate[] {
  const last = lastDayOfMonth(year, month)
  let days: ISODate[]

  if (rule.byMonthDay.length > 0) {
    days = rule.byMonthDay
      .map((n) => (n > 0 ? n : last + 1 + n))
      .filter((n) => n >= 1 && n <= last)
      .map((n) => isoOf(year, month, n))
    // Together, BYDAY narrows BYMONTHDAY: "Friday the 13th".
    if (rule.byDay.length > 0) {
      const allowed = new Set(rule.byDay.map((b) => b.weekday))
      days = days.filter((d) => allowed.has(weekdayOf(d)))
    }
  } else if (rule.byDay.length > 0) {
    days = rule.byDay.flatMap((b) => {
      const all = weekdaysInMonth(year, month, b.weekday)
      if (b.nth === null) return all
      const pick = b.nth > 0 ? all[b.nth - 1] : all[all.length + b.nth]
      return pick ? [pick] : []
    })
  } else {
    // "Monthly on the 31st" skips the months without one, per RFC 5545.
    days = defaultDay <= last ? [isoOf(year, month, defaultDay)] : []
  }
  return [...new Set(days)].sort(compareISO)
}

/** The dates in the k-th period of a rule (the k-th day, week, month or year). */
function periodDates(rule: RRule, start: ISODate, k: number): ISODate[] {
  const [sy, sm, sd] = start.split('-').map(Number)
  const step = k * rule.interval
  const months = rule.byMonth

  switch (rule.freq) {
    case 'DAILY': {
      const d = addDays(start, step)
      if (rule.byDay.length && !rule.byDay.some((b) => b.weekday === weekdayOf(d))) return []
      if (months.length && !months.includes(Number(d.slice(5, 7)))) return []
      if (rule.byMonthDay.length && !rule.byMonthDay.includes(Number(d.slice(8)))) return []
      return [d]
    }
    case 'WEEKLY': {
      const weekStart = addDays(startOfWeek(start, 1), 7 * step)
      const weekdays = rule.byDay.length ? rule.byDay.map((b) => b.weekday) : [weekdayOf(start)]
      return [...new Set(weekdays)]
        .map((wd) => addDays(weekStart, (wd + 6) % 7))
        .filter((d) => !months.length || months.includes(Number(d.slice(5, 7))))
        .sort(compareISO)
    }
    case 'MONTHLY': {
      const total = sy * 12 + (sm - 1) + step
      const year = Math.floor(total / 12)
      const month = (total % 12) + 1
      if (months.length && !months.includes(month)) return []
      return daysInMonthFor(year, month, rule, sd)
    }
    case 'YEARLY': {
      const year = sy + step
      const inMonths = months.length ? months : [sm]
      // A plain yearly rule repeats the start date; a 29 February start skips
      // the years without one.
      return inMonths.flatMap((month) => daysInMonthFor(year, month, rule, sd))
    }
  }
}

/** Whole periods between the start and a later date, for skipping ahead. */
function periodsUntil(rule: RRule, start: ISODate, date: ISODate): number {
  const [sy, sm] = start.split('-').map(Number)
  const [y, m] = date.split('-').map(Number)
  const raw =
    rule.freq === 'DAILY' ? Math.round((Date.parse(date) - Date.parse(start)) / 86_400_000)
    : rule.freq === 'WEEKLY' ? Math.round((Date.parse(startOfWeek(date, 1)) - Date.parse(startOfWeek(start, 1))) / (7 * 86_400_000))
    : rule.freq === 'MONTHLY' ? (y - sy) * 12 + (m - sm)
    : y - sy
  return Math.floor(raw / rule.interval)
}

/** A hard ceiling, so a malformed rule can never spin. */
const MAX_PERIODS = 20_000

/**
 * The dates a rule produces, from its start through `through`.
 *
 * `isAfterUntil` is given each date and decides the UNTIL cut-off, because
 * UNTIL compares as an instant for timed events and as a date for all-day
 * ones — something only the caller knows.
 *
 * With no COUNT, whole periods before `from` are skipped arithmetically: a
 * daily stand-up that started in 2019 shouldn't cost two thousand iterations
 * every time the feed loads. COUNT has to be walked from the start.
 */
export function ruleDates(
  rule: RRule,
  start: ISODate,
  from: ISODate,
  through: ISODate,
  isAfterUntil: (date: ISODate) => boolean = () => false,
): ISODate[] {
  const out: ISODate[] = []
  let counted = 0
  const first = rule.count === null ? Math.max(0, periodsUntil(rule, start, from) - 1) : 0

  for (let k = first; k < first + MAX_PERIODS; k++) {
    const dates = periodDates(rule, start, k)
    for (const d of dates) {
      if (compareISO(d, start) < 0) continue
      if (isAfterUntil(d)) return out
      if (rule.count !== null && counted >= rule.count) return out
      counted++
      if (compareISO(d, through) > 0) return out
      if (compareISO(d, from) >= 0) out.push(d)
    }
    // Past the end with nothing left to count: stop. Checked on the period's
    // nominal position so an empty period (no 31st in June) doesn't end it.
    const probe = periodDates({ ...rule, byDay: [], byMonthDay: [], byMonth: [] }, start, k)[0]
    if (probe && compareISO(probe, addDays(through, 31)) > 0) return out
  }
  return out
}

// ── occurrences ──────────────────────────────────────────────────────────────

/** One concrete occurrence of an event. */
export type Occurrence =
  | { key: string; uid: string; title: string; busy: boolean; allDay: true; startDate: ISODate; endDate: ISODate }
  | { key: string; uid: string; title: string; busy: boolean; allDay: false; start: number; end: number }

/** The instant a timed value names. Floating time reads as `localZone`. */
function instantOf(t: ICalTime, fallbackZone: string): number {
  return instantFromWall(t.date, t.minutes ?? 0, t.zone ?? fallbackZone)
}

/**
 * Every occurrence of every event that touches [from, through], with excluded
 * dates removed and moved occurrences in their new places. Cancelled events
 * are dropped. `localZone` is the zone floating times are read in — this
 * device's own.
 */
export function expandEvents(
  events: ICalEvent[],
  from: ISODate,
  through: ISODate,
  localZone: string,
): Occurrence[] {
  // A moved or cancelled occurrence arrives as its own VEVENT with the
  // series' UID and a RECURRENCE-ID naming the slot it replaces.
  const overrides = new Map<string, ICalEvent[]>()
  for (const e of events) {
    if (!e.recurrenceId) continue
    const list = overrides.get(e.uid) ?? []
    list.push(e)
    overrides.set(e.uid, list)
  }

  const out: Occurrence[] = []
  // A day of slack either side: an event's zone may put it on a different
  // local day from the one its own date says.
  const lo = addDays(from, -1)
  const hi = addDays(through, 1)

  for (const e of events) {
    if (e.cancelled && !e.recurrenceId) continue
    if (e.recurrenceId) {
      if (!e.cancelled) out.push(...occurrencesAt(e, [e.start.date], lo, hi, localZone))
      continue
    }

    let dates: ISODate[]
    if (e.rrule) {
      const until = e.rrule.until
      const isAfterUntil = (d: ISODate): boolean => {
        if (!until) return false
        if (until.minutes === null || e.start.minutes === null) return compareISO(d, until.date) > 0
        const at = instantOf({ ...e.start, date: d }, localZone)
        return at > instantOf(until, localZone)
      }
      // Pull `from` back by the event's own length, so a long event that
      // started before the window but is still running gets included.
      const spanDays = Math.ceil(lengthMin(e, localZone) / 1440)
      dates = ruleDates(e.rrule, e.start.date, addDays(lo, -spanDays), hi, isAfterUntil)
    } else {
      dates = [e.start.date]
    }

    // Excluded and overridden slots, matched the way the event itself is timed.
    const removed = new Set<string>()
    for (const t of [...e.exdates, ...(overrides.get(e.uid) ?? []).map((o) => o.recurrenceId!)]) {
      if (e.start.minutes === null || t.minutes === null) removed.add(t.date)
      else removed.add(String(instantOf(t, localZone)))
    }
    const kept = dates.filter((d) =>
      e.start.minutes === null
        ? !removed.has(d)
        : !removed.has(String(instantOf({ ...e.start, date: d }, localZone))) && !removed.has(d),
    )
    out.push(...occurrencesAt(e, kept, lo, hi, localZone))
  }
  return out
}

/** How long an event runs, in minutes. All-day events count whole days. */
function lengthMin(e: ICalEvent, localZone: string): number {
  if (e.start.minutes === null) {
    if (e.end && e.end.minutes === null) {
      return Math.max(1, Math.round((Date.parse(e.end.date) - Date.parse(e.start.date)) / 60_000))
    }
    return e.durationMin && e.durationMin > 0 ? e.durationMin : 1440
  }
  if (e.end) return Math.max(0, (instantOf(e.end, localZone) - instantOf(e.start, localZone)) / 60_000)
  return Math.max(0, e.durationMin ?? 0)
}

function occurrencesAt(
  e: ICalEvent,
  dates: ISODate[],
  lo: ISODate,
  hi: ISODate,
  localZone: string,
): Occurrence[] {
  const length = lengthMin(e, localZone)
  const out: Occurrence[] = []

  for (const date of dates) {
    if (e.start.minutes === null) {
      const days = Math.max(1, Math.round(length / 1440))
      const endDate = addDays(date, days)
      if (compareISO(endDate, lo) <= 0 || compareISO(date, hi) > 0) continue
      out.push({
        key: `${e.uid}|${date}`, uid: e.uid, title: e.summary, busy: e.busy,
        allDay: true, startDate: date, endDate,
      })
    } else {
      const start = instantOf({ ...e.start, date }, localZone)
      const end = start + length * 60_000
      const startDay = wallInZone(start, localZone).date
      const endDay = wallInZone(Math.max(start, end - 1), localZone).date
      if (compareISO(endDay, lo) < 0 || compareISO(startDay, hi) > 0) continue
      out.push({
        key: `${e.uid}|${start}`, uid: e.uid, title: e.summary, busy: e.busy,
        allDay: false, start, end,
      })
    }
  }
  return out
}

// ── onto local days ──────────────────────────────────────────────────────────

/**
 * An occurrence as it falls on one local calendar day. A meeting that runs
 * past midnight becomes two slices; a three-day conference, three all-day
 * slices. This is the unit the grid, Today and the planner all consume.
 */
export interface DaySlice {
  id: string
  key: string
  title: string
  day: ISODate
  allDay: boolean
  /** Minutes since local midnight; 0–1440. Meaningless for all-day. */
  startMin: number
  endMin: number
  busy: boolean
}

/** No event is drawn across more than this many days. */
const MAX_SPAN_DAYS = 31

export function daySlices(
  occurrences: Occurrence[],
  from: ISODate,
  through: ISODate,
  localZone: string,
): DaySlice[] {
  const out: DaySlice[] = []
  const inRange = (d: ISODate) => compareISO(d, from) >= 0 && compareISO(d, through) <= 0

  for (const o of occurrences) {
    if (o.allDay) {
      for (let i = 0, d = o.startDate; compareISO(d, o.endDate) < 0 && i < MAX_SPAN_DAYS; i++, d = addDays(d, 1)) {
        if (inRange(d)) {
          out.push({ id: `${o.key}|${d}`, key: o.key, title: o.title, day: d, allDay: true, startMin: 0, endMin: 1440, busy: o.busy })
        }
      }
      continue
    }

    const s = wallInZone(o.start, localZone)
    const lastMs = Math.max(o.start, o.end - 1)
    const lastDay = wallInZone(lastMs, localZone).date
    const e = wallInZone(o.end, localZone)
    for (let i = 0, d = s.date; compareISO(d, lastDay) <= 0 && i < MAX_SPAN_DAYS; i++, d = addDays(d, 1)) {
      if (!inRange(d)) continue
      const startMin = d === s.date ? s.minutes : 0
      // Ending exactly at midnight belongs to the day before, all the way to 24:00.
      const endMin = d === lastDay ? (e.date === d ? e.minutes : 1440) : 1440
      out.push({
        id: `${o.key}|${d}`, key: o.key, title: o.title, day: d, allDay: false,
        startMin, endMin: Math.max(startMin, endMin), busy: o.busy,
      })
    }
  }
  return out.sort((a, b) => compareISO(a.day, b.day) || a.startMin - b.startMin)
}

/** Parse, expand and slice in one call — what the app actually wants. */
export function feedToSlices(text: string, from: ISODate, through: ISODate, localZone: string): DaySlice[] {
  return daySlices(expandEvents(parseICal(text), from, through, localZone), from, through, localZone)
}
