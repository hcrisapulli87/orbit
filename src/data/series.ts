import { supabase } from '../lib/supabase'
import { planOccurrences } from '../domain/occurrences'
import { todayISO } from '../domain/day'
import type { Series, Task } from './types'
import type { Rule } from '../domain/recurrence'

/**
 * How far ahead each kind of series is materialised.
 *
 * Events run much further out because a birthday you can't see until 60 days
 * before it is useless — the calendar should show the whole year.
 */
const HORIZON_DAYS = { task: 60, habit: 60, event: 400 } as const

export async function fetchSeries(): Promise<Series[]> {
  const { data, error } = await supabase
    .from('task_series')
    .select('*')
    .eq('active', true)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createSeries(
  ownerId: string,
  series: Omit<Series, 'id' | 'owner_id' | 'created_at'>,
): Promise<Series> {
  const { data, error } = await supabase
    .from('task_series')
    .insert({ ...series, owner_id: ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSeries(id: string): Promise<void> {
  // Occurrences cascade — deleting the rule deletes its future.
  const { error } = await supabase.from('task_series').delete().eq('id', id)
  if (error) throw error
}

/** The rule half of a series row, in the shape the domain engine expects. */
export function ruleOf(series: Series): Rule {
  return {
    rule_type: series.rule_type,
    step: series.step,
    weekdays: series.weekdays,
    month_day: series.month_day,
    nth: series.nth,
    month: series.month,
    after_n: series.after_n,
    after_unit: series.after_unit,
    anchor_on: series.anchor_on,
    until_on: series.until_on,
  }
}

/** The fields an occurrence inherits from its series. */
function occurrenceFrom(series: Series, key: string, dueOn: string) {
  return {
    owner_id: series.owner_id,
    series_id: series.id,
    occurrence_key: key,
    due_on: dueOn,
    title: series.title,
    notes: series.notes,
    project_id: series.project_id,
    area_id: series.area_id,
    kind: series.kind,
    priority: series.priority,
    tags: series.tags,
    estimate_min: series.estimate_min,
    due_time: series.due_time,
    source: 'recurrence' as const,
  }
}

/**
 * Bring every series up to its horizon. Runs on app load and after any
 * completion.
 *
 * Safe to call as often as we like: planOccurrences skips what exists, and the
 * unique (series_id, occurrence_key) constraint catches anything that races in
 * from another device. Returns how many rows were actually created.
 */
export async function ensureOccurrences(
  allSeries: Series[],
  tasks: Task[],
  today = todayISO(),
): Promise<number> {
  const keysBySeries = new Map<string, string[]>()
  for (const t of tasks) {
    if (!t.series_id || !t.occurrence_key) continue
    const keys = keysBySeries.get(t.series_id) ?? []
    keys.push(t.occurrence_key)
    keysBySeries.set(t.series_id, keys)
  }

  const rows = allSeries.flatMap((s) =>
    planOccurrences(ruleOf(s), keysBySeries.get(s.id) ?? [], today, HORIZON_DAYS[s.kind])
      .map((d) => occurrenceFrom(s, d.occurrence_key, d.due_on)),
  )

  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('task_tasks')
    .upsert(rows, { onConflict: 'series_id,occurrence_key', ignoreDuplicates: true })
  if (error) throw error
  return rows.length
}

/**
 * Completing an occurrence of an interval-after-completion series is what
 * creates the next one — measured from when it was actually done, not from a
 * calendar date. Everything else is horizon-filled and needs nothing here.
 */
export async function advanceAfterCompletion(series: Series, nextDue: string): Promise<void> {
  const { error } = await supabase
    .from('task_tasks')
    .upsert([occurrenceFrom(series, nextDue, nextDue)], {
      onConflict: 'series_id,occurrence_key',
      ignoreDuplicates: true,
    })
  if (error) throw error
}
