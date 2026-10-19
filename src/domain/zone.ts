// Wall-clock time in a named time zone, and back.
//
// The rest of the domain layer works on calendar days and minutes-since-
// midnight and never needs an instant. Calendar feeds are the exception: a
// meeting is "09:00 in Australia/Sydney" or "23:00Z", and has to land on the
// right day and hour wherever you happen to be. Intl already carries the tz
// database, so these two conversions are all that's needed — no date library.

import { isoOf } from './day'
import type { ISODate } from './day'

const DAY_MS = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    // Throws RangeError for a zone Intl doesn't know, which isKnownZone uses.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(zone, f)
  }
  return f
}

/** Whether Intl recognises this IANA zone name. */
export function isKnownZone(zone: string): boolean {
  try {
    formatter(zone)
    return true
  } catch {
    return false
  }
}

/** The zone this device is in, e.g. "Australia/Melbourne". */
export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function wallParts(ms: number, zone: string): [number, number, number, number, number, number] {
  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const parts = formatter(zone).formatToParts(new Date(ms))
  return [
    get(parts, 'year'), get(parts, 'month'), get(parts, 'day'),
    get(parts, 'hour') % 24, get(parts, 'minute'), get(parts, 'second'),
  ]
}

/** The calendar day and minutes-since-midnight an instant reads as in `zone`. */
export function wallInZone(ms: number, zone: string): { date: ISODate; minutes: number } {
  const [y, m, d, h, mi] = wallParts(ms, zone)
  return { date: isoOf(y, m, d), minutes: h * 60 + mi }
}

/** How far `zone` is ahead of UTC at instant `ms`, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const [y, m, d, h, mi, s] = wallParts(ms, zone)
  const asUtc = Date.UTC(y, m - 1, d, h, mi, s)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/**
 * The instant at which `zone`'s clocks read `date` at `minutes`.
 *
 * Near any instant a zone has at most two offsets in play — the one before a
 * daylight-saving change and the one after — so try both and keep whichever
 * actually reads back as the wall time asked for. An ambiguous autumn time
 * fits both and gets the earlier reading. A spring-forward time fits neither
 * (02:30 never happens) and lands an hour later, which is what calendar apps
 * do with it too.
 */
export function instantFromWall(date: ISODate, minutes: number, zone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60)
  const before = guess - offsetAt(guess - DAY_MS, zone)
  const after = guess - offsetAt(guess + DAY_MS, zone)
  const fits = [before, after].filter((t) => {
    const wall = wallInZone(t, zone)
    return wall.date === date && wall.minutes === minutes
  })
  return fits.length > 0 ? Math.min(...fits) : before
}
