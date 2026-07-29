// Orbit — push notifier.
//
// Runs on a schedule (pg_cron → pg_net → here). Finds what needs saying, says
// it once, and records that it said it. Everything server-side lives in the
// Supabase project that already holds the data: a Vercel cron route would mean
// putting the service key in a second place and deploying a second thing for a
// job this small.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… \
//            VAPID_SUBJECT=mailto:you@example.com NOTIFY_SECRET=…

import { createClient } from 'npm:@supabase/supabase-js@2'
// Hand-rolling VAPID signing and aes128gcm payload encryption is a day of work
// and a security footgun; web-push is the reference implementation.
import webpush from 'npm:web-push@3'

const TIMEZONE = 'Australia/Melbourne'

type NotificationKind = 'overdue' | 'due_today' | 'due_soon' | 'block_start' | 'event_lead'

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

interface Candidate {
  ownerId: string
  taskId: string
  kind: NotificationKind
  title: string
  body: string
  /**
   * The dedupe key's date half. Today for everything that fires on the day it
   * is about; the event's own date for a lead-time reminder, which would
   * otherwise repeat every morning of its lead window.
   */
  sentFor: string
}

/** Local calendar day and minutes-since-midnight in Melbourne, not UTC. */
function localNow(): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

const toMinutes = (time: string | null): number | null => {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

// Two days of ISO-string arithmetic, duplicated from src/domain/day.ts rather
// than imported: an Edge Function can't reach into the app bundle, and the
// alternative — a shared package for four lines — is more moving parts than
// this earns. UTC throughout, so no DST transition can shift a date.
const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const daysBetweenISO = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET')
  if (secret && req.headers.get('x-orbit-secret') !== secret) {
    return new Response('forbidden', { status: 403 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:orbit@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const { day, minutes } = localNow()

  const [
    { data: settings }, { data: tasks }, { data: events }, { data: blocks }, { data: subs },
  ] = await Promise.all([
    supabase.from('task_settings').select('owner_id, push_lead_min'),
    supabase
      .from('task_tasks')
      .select('id, owner_id, title, due_on, due_time, kind, status')
      .eq('status', 'open')
      .lte('due_on', day),
    // Important dates are read through the digest view rather than the table,
    // because lead_days lives on the series and the view is the one place that
    // already joins the two. Ninety days is comfortably past the longest lead
    // anyone would set, and far short of the four hundred an event is
    // materialised for.
    supabase
      .from('task_digest_v')
      .select('id, kind, status, due_on, title, lead_days')
      .eq('kind', 'event')
      .eq('status', 'open')
      .gte('due_on', day)
      .lte('due_on', addDaysISO(day, 90)),
    supabase
      .from('task_blocks')
      .select('id, owner_id, start_time, label, task_id')
      .eq('on_date', day),
    supabase
      .from('task_push_subscriptions')
      .select('id, owner_id, endpoint, p256dh, auth, failure_count'),
  ])

  const leadFor = (ownerId: string) =>
    settings?.find((s) => s.owner_id === ownerId)?.push_lead_min ?? 30

  const candidates: Candidate[] = []

  for (const task of tasks ?? []) {
    // Events are dates to know about, not jobs, so they never nag.
    if (task.kind === 'event') continue

    if (task.due_on < day) {
      candidates.push({
        ownerId: task.owner_id,
        taskId: task.id,
        kind: 'overdue',
        sentFor: day,
        title: 'Overdue',
        body: task.title,
      })
      continue
    }

    const dueMinutes = toMinutes(task.due_time)
    if (dueMinutes === null) {
      // An all-day task gets one morning nudge rather than a ping at midnight.
      if (minutes >= 8 * 60) {
        candidates.push({
          ownerId: task.owner_id,
          taskId: task.id,
          kind: 'due_today',
        sentFor: day,
          title: 'Due today',
          body: task.title,
        })
      }
      continue
    }

    const lead = leadFor(task.owner_id)
    if (dueMinutes - minutes <= lead && dueMinutes >= minutes) {
      candidates.push({
        ownerId: task.owner_id,
        taskId: task.id,
        kind: 'due_soon',
        sentFor: day,
        title: 'Coming up',
        body: task.title,
      })
    }
  }

  /**
   * Important dates, on the one day they're actually useful.
   *
   * Events still never nag about being due — a birthday isn't a job and has no
   * checkbox. What's worth a push is the day the lead time opens, while there
   * is still time to buy something. One notification per event per year, which
   * falls out of keying the send-once record on the event's date rather than
   * on today's.
   */
  if (minutes >= 8 * 60) {
    for (const event of events ?? []) {
      const until = daysBetweenISO(day, event.due_on)
      if (until !== (event.lead_days ?? 0)) continue
      candidates.push({
        ownerId: event.owner_id,
        taskId: event.id,
        kind: 'event_lead',
        sentFor: event.due_on,
        title: until === 0 ? 'Today' : `In ${until} day${until === 1 ? '' : 's'}`,
        body: until === 0 ? event.title : `${event.title} — time to sort a gift`,
      })
    }
  }

  for (const block of blocks ?? []) {
    const startMinutes = toMinutes(block.start_time)
    if (startMinutes === null || !block.task_id) continue
    const lead = leadFor(block.owner_id)
    if (startMinutes - minutes <= lead && startMinutes >= minutes) {
      candidates.push({
        ownerId: block.owner_id,
        taskId: block.task_id,
        kind: 'block_start',
        sentFor: day,
        title: 'Starting soon',
        body: block.label || 'Blocked time',
      })
    }
  }

  if (candidates.length === 0) {
    return Response.json({ day, minutes, sent: 0, considered: 0 })
  }

  // Send-once, keyed on task + kind + the date the notification is *about*.
  // For everything that fires on the day, that date is today. A lead-time
  // reminder is about the event's own date, so the window has to reach forward
  // rather than being pinned to today — otherwise a birthday a week out would
  // be announced again every morning until it arrived.
  const { data: alreadySent } = await supabase
    .from('task_notifications')
    .select('task_id, kind, sent_for')
    .gte('sent_for', day)

  const keyOf = (taskId: string, kind: string, sentFor: string) => `${taskId}:${kind}:${sentFor}`
  const sentKey = new Set(
    (alreadySent ?? []).map((n) => keyOf(n.task_id, n.kind, n.sent_for)),
  )
  const pending = candidates.filter(
    (c) => !sentKey.has(keyOf(c.taskId, c.kind, c.sentFor)),
  )

  let sent = 0
  const dead: string[] = []

  for (const candidate of pending) {
    const targets = (subs ?? []).filter((s) => s.owner_id === candidate.ownerId) as Subscription[]
    if (targets.length === 0) continue

    let delivered = false
    for (const target of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify({
            title: candidate.title,
            body: candidate.body,
            taskId: candidate.taskId,
            tag: `${candidate.taskId}:${candidate.kind}`,
          }),
        )
        delivered = true
      } catch (err) {
        // 404/410 mean the browser threw the subscription away — prune it
        // rather than retrying it every fifteen minutes forever.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(target.id)
      }
    }

    // Only record it as sent if it actually reached a device, so a failed run
    // doesn't silently swallow the reminder.
    if (delivered) {
      await supabase.from('task_notifications').insert({
        owner_id: candidate.ownerId,
        task_id: candidate.taskId,
        kind: candidate.kind,
        sent_for: candidate.sentFor,
      })
      sent++
    }
  }

  if (dead.length > 0) {
    await supabase.from('task_push_subscriptions').delete().in('id', dead)
  }

  return Response.json({ day, minutes, considered: candidates.length, sent, pruned: dead.length })
})
