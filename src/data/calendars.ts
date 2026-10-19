import { supabase } from '../lib/supabase'
import type { Calendar } from './types'

export async function fetchCalendars(): Promise<Calendar[]> {
  const { data, error } = await supabase.from('task_calendars').select('*').order('created_at')
  // 42P01 = undefined_table: schema v10 hasn't been run yet. Calendars are an
  // add-on, so their absence must not take the rest of the app down.
  if (error && error.code !== '42P01') throw error
  return data ?? []
}

export async function createCalendar(
  ownerId: string,
  calendar: Pick<Calendar, 'name' | 'url'>,
): Promise<Calendar> {
  const { data, error } = await supabase
    .from('task_calendars')
    .insert({ ...calendar, owner_id: ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCalendar(id: string, patch: Partial<Calendar>): Promise<void> {
  const { error } = await supabase.from('task_calendars').update(patch).eq('id', id)
  if (error) throw error
}

/** Put a removed calendar back exactly as it was, address and all. */
export async function restoreCalendar(row: Calendar): Promise<void> {
  const { error } = await supabase.from('task_calendars').upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteCalendar(id: string): Promise<void> {
  const { error } = await supabase.from('task_calendars').delete().eq('id', id)
  if (error) throw error
}

/**
 * The raw .ics text of one calendar, through the calendar-feed Edge Function
 * (the providers send no CORS headers, so the browser can't fetch it itself).
 * The function's own error message is surfaced, because "the calendar refused
 * the address" tells you what to do and "non-2xx status" doesn't.
 */
export async function fetchFeed(calendarId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('calendar-feed', {
    body: { calendarId },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = await context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? error.message ?? 'Could not read that calendar')
  }
  if (typeof data !== 'string') throw new Error('That calendar sent back something unreadable')
  return data
}

/**
 * A few seconds' work that saves a confusing failure later: Google's "public
 * address" and "embed" links look plausible and return HTML, not a calendar.
 * Catch the obvious cases before they're saved.
 */
export function calendarUrlProblem(raw: string): string | null {
  const url = raw.trim()
  if (!url) return 'Paste the calendar’s address.'
  if (!/^(https|webcal):\/\//i.test(url)) return 'The address should start with https:// or webcal://.'
  if (/calendar\.google\.com\/calendar\/(embed|u\/|r\b)/i.test(url)) {
    return 'That’s a Google page link. Use “Secret address in iCal format” instead.'
  }
  return null
}
