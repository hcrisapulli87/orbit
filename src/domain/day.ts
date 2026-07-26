// Local calendar-day arithmetic on YYYY-MM-DD strings.
//
// The rule this whole module exists to enforce: a "day" in Orbit is a calendar
// day as a human sees it, never an instant. So:
//
//   * We never call Date.prototype.toISOString() to derive a day. That formats
//     in UTC, so anyone east of UTC (all of Australia) gets the wrong calendar
//     day for several hours every night.
//   * All arithmetic runs on UTC-noon-equivalent integer parts rather than local
//     Date objects, so a daylight-saving transition can never add or drop a day.
//     Melbourne shifts twice a year; `addDays` must not care.
//
// A Date only ever enters at the boundary (`toLocalISODate`, `todayISO`), where
// reading the browser's LOCAL day is exactly what we want. Everything downstream
// is strings. `now` / `today` are always parameters so tests never mock a clock.

/** A calendar day, `YYYY-MM-DD`. */
export type ISODate = string

/** A time of day, `HH:MM` (Postgres may hand back `HH:MM:SS`). */
export type ISOTime = string

const DAY_MS = 86_400_000

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/** Split an ISO day into its numeric parts. Month is 1-based. */
function parts(iso: ISODate): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

/** The UTC epoch millis for an ISO day's midnight — our arithmetic space. */
function utcMs(iso: ISODate): number {
  const [y, m, d] = parts(iso)
  return Date.UTC(y, m - 1, d)
}

/** Format a Date as YYYY-MM-DD using its LOCAL calendar day. */
export function toLocalISODate(d: Date): ISODate {
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Today's local calendar day. `now` is injectable so tests never mock a clock. */
export function todayISO(now: Date = new Date()): ISODate {
  return toLocalISODate(now)
}

/** Build an ISO day from numeric parts. Month is 1-based. */
export function isoOf(year: number, month: number, day: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Add (or subtract, with a negative delta) whole calendar days. */
export function addDays(iso: ISODate, delta: number): ISODate {
  const d = new Date(utcMs(iso) + delta * DAY_MS)
  return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS)
}

/** Day of week: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: ISODate): number {
  return new Date(utcMs(iso)).getUTCDay()
}

/** The start of the week containing `iso`. Defaults to a Monday-start week. */
export function startOfWeek(iso: ISODate, weekStartsOn = 1): ISODate {
  const back = (weekdayOf(iso) - weekStartsOn + 7) % 7
  return addDays(iso, -back)
}

/** Number of days in a month. Month is 1-based. */
export function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Add whole months, clamping to the end of a shorter target month.
 *
 * `preferredDay` defaults to the day in `iso`, but a recurring series should
 * pass its original day so a run clamped by February recovers afterwards:
 * a monthly-on-the-31st rule goes 31 Jan → 28 Feb → 31 Mar, not → 28 Mar.
 */
export function addMonthsClamped(iso: ISODate, months: number, preferredDay?: number): ISODate {
  const [y, m, d] = parts(iso)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12 // JS % keeps the sign; months can be negative
  return isoOf(year, month + 1, Math.min(preferredDay ?? d, lastDayOfMonth(year, month + 1)))
}

/**
 * The nth occurrence of a weekday in a month, e.g. the 2nd Tuesday.
 * `nth = -1` means the last one. Returns null when it doesn't exist
 * (there is no 5th Monday in February 2026).
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): ISODate | null {
  const last = lastDayOfMonth(year, month)

  if (nth === -1) {
    const back = (weekdayOf(isoOf(year, month, last)) - weekday + 7) % 7
    return isoOf(year, month, last - back)
  }

  const forward = (weekday - weekdayOf(isoOf(year, month, 1)) + 7) % 7
  const day = 1 + forward + (nth - 1) * 7
  return day >= 1 && day <= last ? isoOf(year, month, day) : null
}

/** The last `n` days ending at `today` (inclusive), oldest first. */
export function lastNDates(n: number, today: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i))
  return out
}

/** Chronological comparator. ISO days sort correctly as plain strings. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * A human label for a day relative to today: "Today", "Tomorrow", a weekday
 * name inside the coming week, "3 days ago" just behind, else a short date.
 */
export function relativeLabel(iso: ISODate, today: ISODate): string {
  const delta = daysBetween(today, iso)

  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  if (delta >= 2 && delta <= 6) return WEEKDAY_NAMES[weekdayOf(iso)]
  if (delta <= -2 && delta >= -6) return `${-delta} days ago`

  const [y, m, d] = parts(iso)
  const sameYear = y === parts(today)[0]
  return sameYear ? `${d} ${MONTH_NAMES[m - 1]}` : `${d} ${MONTH_NAMES[m - 1]} ${y}`
}

/** Minutes since midnight, or null if the string isn't a valid time. */
export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** "15:00" → "3pm", "15:30" → "3:30pm". Empty string for anything unparseable. */
export function formatTime(time: string | null | undefined): string {
  const minutes = parseTimeToMinutes(time)
  if (minutes === null) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}
