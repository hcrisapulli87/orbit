import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFeed } from './calendars'
import { addDays, todayISO } from '../domain/day'
import { feedToSlices } from '../domain/ical'
import type { DaySlice } from '../domain/ical'
import { localZone } from '../domain/zone'
import type { Calendar } from './types'

/** How far either side of today feeds are read. Matches what the calendar pages through. */
const PAST_DAYS = 7
const FUTURE_DAYS = 90

/** Feeds are re-read this often while the app is open, and on return after it. */
const REFRESH_MS = 30 * 60_000

export interface FeedStatus {
  state: 'loading' | 'ok' | 'error'
  /** Why it failed, in words that say what to do. */
  message?: string
  /** When the feed was last read successfully. */
  at?: number
}

/** A slice of an external event, labelled with the calendar it came from. */
export interface CalendarSlice extends DaySlice {
  calendarId: string
  calendarName: string
}

/**
 * Read every enabled calendar feed and turn it into day slices.
 *
 * The raw text is held per calendar and the slices derived from it, so a
 * failed refresh keeps showing the last good copy (with an error beside it)
 * instead of emptying your week. Nothing is persisted: on a cold start the
 * meetings arrive a moment after the tasks do.
 */
export function useCalendarFeeds(calendars: Calendar[]) {
  const [texts, setTexts] = useState<Map<string, string>>(new Map())
  const [status, setStatus] = useState<Map<string, FeedStatus>>(new Map())
  const lastRun = useRef(0)

  const enabled = useMemo(() => calendars.filter((c) => c.enabled), [calendars])
  // Refetch when the set of feeds changes, not on every realtime echo that
  // hands back an identical list.
  const signature = enabled.map((c) => `${c.id}:${c.url}`).join('|')

  const refresh = useCallback(async () => {
    lastRun.current = Date.now()
    const targets = enabled
    setStatus((prev) => {
      const next = new Map(prev)
      for (const c of targets) next.set(c.id, { ...prev.get(c.id), state: 'loading' })
      return next
    })
    await Promise.all(
      targets.map(async (c) => {
        try {
          const text = await fetchFeed(c.id)
          setTexts((prev) => new Map(prev).set(c.id, text))
          setStatus((prev) => new Map(prev).set(c.id, { state: 'ok', at: Date.now() }))
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Could not read that calendar'
          setStatus((prev) => new Map(prev).set(c.id, { ...prev.get(c.id), state: 'error', message }))
        }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useEffect(() => {
    if (enabled.length === 0) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    // A phone app is mostly suspended rather than closed; coming back to it
    // after an hour should mean this afternoon's meetings, not this morning's.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > REFRESH_MS) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  const today = todayISO()
  const slices = useMemo<CalendarSlice[]>(() => {
    const zone = localZone()
    const from = addDays(today, -PAST_DAYS)
    const through = addDays(today, FUTURE_DAYS)
    return enabled.flatMap((c) => {
      const text = texts.get(c.id)
      if (!text) return []
      try {
        return feedToSlices(text, from, through, zone).map((s) => ({
          ...s, id: `${c.id}|${s.id}`, calendarId: c.id, calendarName: c.name,
        }))
      } catch {
        // A feed that parses badly loses its events, not the app.
        return []
      }
    })
  }, [enabled, texts, today])

  return { slices, status, refresh }
}
