// Occurrence materialisation: deciding which rows a series still owes.
//
// Occurrences are real task rows, not computed-on-read, for four reasons:
// they must be individually reschedulable without touching the rule; the
// Discord bot has to read them with a plain PostgREST query rather than a
// second copy of this engine in Python; streaks need a durable per-occurrence
// record; and a month view becomes one indexed range scan instead of expanding
// every rule on every paint.
//
// This module is the pure half — it returns drafts. The data layer upserts them
// with `on conflict (series_id, occurrence_key) do nothing`, which together with
// the idempotency below makes it safe to run on every app open, from any
// device, forever, with no coordination.

import { addDays, compareISO } from './day'
import type { ISODate } from './day'
import { occurrencesBetween } from './recurrence'
import type { Rule } from './recurrence'

export interface OccurrenceDraft {
  /** Stable identity of this occurrence within its series: the date itself. */
  occurrence_key: string
  due_on: ISODate
}

/** How far back to recreate occurrences that were never generated. */
const DEFAULT_LOOKBACK_DAYS = 30

/**
 * The occurrences a series still needs, given the ones that already exist.
 *
 * `lookbackDays` matters after a gap: reopening the app a fortnight late must
 * recreate the missed days so they read as OVERDUE. That is the deliberate
 * improvement on the bot's Monday chore reset, which deleted the whole list and
 * with it the information that a chore had never been done.
 */
export function planOccurrences(
  rule: Rule,
  existingKeys: Iterable<string>,
  today: ISODate,
  horizonDays: number,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): OccurrenceDraft[] {
  const existing = new Set(existingKeys)

  // An interval-after-completion series is never horizon-filled: its next date
  // isn't knowable until the current one is ticked. Seed the first, then leave
  // it alone — completion is what generates the successor.
  if (rule.rule_type === 'after_completion') {
    if (existing.size > 0) return []
    if (rule.until_on && compareISO(rule.anchor_on, rule.until_on) > 0) return []
    return [{ occurrence_key: rule.anchor_on, due_on: rule.anchor_on }]
  }

  const from = addDays(today, -lookbackDays)
  const to = addDays(today, horizonDays)

  return occurrencesBetween(rule, from, to)
    .filter((date) => !existing.has(date))
    .map((date) => ({ occurrence_key: date, due_on: date }))
}

/**
 * Which existing occurrences a rule no longer asks for.
 *
 * The counterpart to planOccurrences, and the missing half of editing a series.
 * Generation only ever adds — the upsert ignores duplicates — so switching a
 * habit from daily to Mon/Wed/Fri would otherwise leave the union of both
 * schedules on the calendar forever.
 *
 * Strictly forward-looking: nothing on or before `today` is ever returned, at
 * any status. Today is already underway and yesterday is history, and a rule
 * change is not a licence to rewrite what happened. The caller deletes only
 * open rows on top of that, so a habit you have already ticked keeps its record
 * and its streak.
 *
 * An after-completion rule has no schedule to compare against — its next date
 * is unknowable until the current one is ticked — so it orphans nothing.
 */
export function staleOccurrenceKeys(
  rule: Rule,
  existingKeys: Iterable<string>,
  today: ISODate,
  horizonDays: number,
): string[] {
  if (rule.rule_type === 'after_completion') return []

  const future = [...existingKeys].filter((key) => compareISO(key, today) > 0)
  if (future.length === 0) return []

  // Compare against the rule's whole reach, not just the horizon: a key beyond
  // the horizon is one the rule generated when the horizon sat elsewhere, and
  // dropping it for being far away would delete a perfectly good occurrence.
  const furthest = future.reduce((a, b) => (compareISO(a, b) >= 0 ? a : b))
  const to = compareISO(furthest, addDays(today, horizonDays)) > 0
    ? furthest
    : addDays(today, horizonDays)

  const wanted = new Set(occurrencesBetween(rule, addDays(today, 1), to))
  return future.filter((key) => !wanted.has(key))
}
