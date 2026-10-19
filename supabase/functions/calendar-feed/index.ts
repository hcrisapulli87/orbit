// Orbit — calendar feed relay.
//
// Google, Outlook and iCloud publish a calendar at a private .ics address, but
// none of them send CORS headers, so a browser can't fetch it directly. This
// function is the smallest thing that fixes that: given the id of one of YOUR
// task_calendars rows, it fetches that row's address and hands the text back.
//
// It never takes a URL from the request. The row is read with the caller's own
// token, so Row-Level Security decides whether they may use it, and the only
// addresses it will ever fetch are ones their owner saved. Nothing is parsed or
// stored here — the browser reads the feed (src/domain/ical.ts).
//
// Deploy:  supabase functions deploy calendar-feed
// (JWT verification stays ON: only a signed-in Orbit user may call it.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Real calendars are well under this; anything bigger is not a calendar. */
const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000

function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * webcal:// is just https:// with a hint for desktop apps. Anything that isn't
 * https afterwards, or that points at this machine or a private network, is
 * refused — the function must not become a way to reach things the caller
 * couldn't reach themselves.
 */
function feedUrl(saved: string): URL | null {
  let url: URL
  try {
    url = new URL(saved.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('[')
  ) return null
  return url
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'POST only')

  let calendarId: unknown
  try {
    calendarId = (await req.json())?.calendarId
  } catch {
    return fail(400, 'Expected a JSON body')
  }
  if (typeof calendarId !== 'string') return fail(400, 'calendarId is required')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: row, error } = await supabase
    .from('task_calendars')
    .select('url')
    .eq('id', calendarId)
    .maybeSingle()
  if (error) return fail(500, error.message)
  if (!row) return fail(404, 'No such calendar')

  const url = feedUrl(row.url)
  if (!url) return fail(400, 'That address isn’t a public https calendar link')

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1', 'User-Agent': 'Orbit calendar reader' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    return fail(502, `Couldn’t reach the calendar: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) {
    return fail(502, res.status === 404 || res.status === 403
      ? 'The calendar refused the address — it may have been reset. Copy it again.'
      : `The calendar answered ${res.status}`)
  }

  const declared = Number(res.headers.get('Content-Length') ?? 0)
  if (declared > MAX_BYTES) return fail(413, 'That calendar is too large to read')
  const body = await res.text()
  if (body.length > MAX_BYTES) return fail(413, 'That calendar is too large to read')
  if (!body.includes('BEGIN:VCALENDAR')) {
    return fail(422, 'That address didn’t return a calendar. Use the iCal (.ics) link.')
  }

  return new Response(body, {
    headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
