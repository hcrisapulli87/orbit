import { supabase } from '../lib/supabase'
import { planOccurrences, staleOccurrenceKeys } from '../domain/occurrences'
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

export async function updateSeries(id: string, patch: Partial<Series>): Promise<void> {
  const { error } = await supabase.from('task_series').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSeries(id: string): Promise<void> {
  // Occurrences would cascade from the foreign key, but they're deleted
  // explicitly first so the behaviour doesn't depend on a database feature the
  // in-memory demo store doesn't have. In production the cascade then finds
  // nothing left to do.
  const { error: occError } = await supabase.from('task_tasks').delete().eq('series_id', id)
  if (occError) throw occError

  const { error } = await supabase.from('task_series').delete().eq('id', id)
  if (error) throw error
}

/** The occurrence fields that are copies of the series, and so must follow it. */
const INHERITED = [
  'title', 'notes', 'project_id', 'area_id', 'kind', 'priority', 'tags',
  'estimate_min', 'due_time',
] as const satisfies readonly (keyof Series & keyof Task)[]

/**
 * Push a series edit onto the occurrences it already created.
 *
 * An occurrence is a value-copy taken when it was materialised, not a live
 * reference — that's what lets you move one Tuesday without touching the rule.
 * The cost is that renaming a habit reaches none of the sixty rows already on
 * the calendar, so the edit has to be carried across explicitly.
 *
 * Scoped to open occurrences due today or later. A completed occurrence is a
 * record of something that actually happened under the old name, at the old
 * time, and rewriting it would be falsifying the history the series/occurrence
 * split exists to keep.
 */
export async function propagateToFuture(
  seriesId: string,
  patch: Partial<Series>,
  today = todayISO(),
): Promise<void> {
  const inherited: Partial<Task> = {}
  for (const field of INHERITED) {
    if (field in patch) Object.assign(inherited, { [field]: patch[field] })
  }
  if (Object.keys(inherited).length === 0) return

  const { error } = await supabase
    .from('task_tasks')
    .update(inherited)
    .eq('series_id', seriesId)
    .eq('status', 'open')
    .gte('due_on', today)
  if (error) throw error
}

/**
 * Drop future occurrences a changed rule no longer schedules.
 *
 * Only open ones, and only after today: generation adds but never removes, so
 * without this a daily habit switched to Mon/Wed/Fri keeps both schedules. The
 * companion ensureOccurrences call then fills in the dates the new rule wants.
 */
export async function pruneStaleOccurrences(
  series: Series,
  tasks: Task[],
  today = todayISO(),
): Promise<number> {
  const keys = tasks
    .filter((t) => t.series_id === series.id && t.status === 'open' && t.occurrence_key)
    .map((t) => t.occurrence_key as string)

  const stale = staleOccurrenceKeys(ruleOf(series), keys, today, HORIZON_DAYS[series.kind])
  if (stale.length === 0) return 0

  const { error } = await supabase
    .from('task_tasks')
    .delete()
    .eq('series_id', series.id)
    .eq('status', 'open')
    .in('occurrence_key', stale)
  if (error) throw error
  return stale.length
}

/**
 * Adopt an existing one-off task as a series' first occurrence.
 *
 * Used when you make a task you're already looking at repeat. Creating the
 * series and leaving the task alone would put two rows on its own due date;
 * deleting the task and letting the series regenerate it would lose its notes,
 * its subtasks and any block pointing at it. Claiming the row keeps everything
 * and, because occurrence_key is the date, the unique (series_id,
 * occurrence_key) constraint stops generation producing a twin.
 */
export async function adoptAsFirstOccurrence(
  taskId: string,
  series: Series,
  dueOn: string,
): Promise<void> {
  const { error } = await supabase
    .from('task_tasks')
    .update({
      series_id: series.id,
      occurrence_key: dueOn,
      due_on: dueOn,
      kind: series.kind,
      source: 'recurrence',
    })
    .eq('id', taskId)
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
