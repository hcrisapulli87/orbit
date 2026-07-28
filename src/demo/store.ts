// The demo database: plain arrays of rows, one key per table, held in memory.
//
// Nothing here is persisted. A reload re-seeds from scratch, which is the point —
// whoever is looking at the demo always sees the same curated day, and no amount
// of clicking can leave it in a state that has to be cleaned up.

import { buildSeed } from './seed'
import { todayISO } from '../domain/day'
import { DEMO_OWNER_ID } from './identity'

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

/**
 * Column defaults the real schema applies in Postgres.
 *
 * The app relies on them: CaptureBar inserts `{ title, owner_id }` and expects
 * back a row with `status`, `tags`, `priority` and the rest filled in. Without
 * these the demo would hand back half-built tasks that crash a screen.
 */
const DEFAULTS: Record<string, Row> = {
  task_areas: { icon: '', colour: '#6366f1', sort_order: 0, is_archived: false },
  task_projects: {
    area_id: null, kind: 'project', icon: '', colour: '#6366f1', sort_order: 0, is_archived: false,
  },
  task_tasks: {
    notes: '', project_id: null, area_id: null, parent_id: null, kind: 'task', status: 'open',
    priority: 0, due_on: null, due_time: null, starts_on: null, estimate_min: null, tags: [],
    source: 'app', capture_text: null, parse_confidence: null, completed_at: null,
    completed_on: null, sort_order: 0, series_id: null, occurrence_key: null,
  },
  task_series: {
    notes: '', project_id: null, area_id: null, kind: 'task', priority: 0, tags: [],
    estimate_min: null, due_time: null, step: 1, weekdays: [], month_day: null, nth: null,
    month: null, after_n: null, after_unit: null, until_on: null, lead_days: 0, active: true,
  },
  task_blocks: { task_id: null, label: '', source: 'manual' },
  task_templates: { icon: '🧩', area_id: null, creates: 'project', use_count: 0 },
  task_template_items: {
    notes: '', sort_order: 0, parent_index: null, offset_days: null, priority: 0,
    estimate_min: null, tags: [],
  },
  task_settings: {},
  task_push_subscriptions: { failure_count: 0 },
}

export const tables: Tables = {}

/**
 * Stand-in for Supabase Realtime.
 *
 * Not decoration: `DataProvider.reload()` tops recurring series up to their
 * horizon and relies on the realtime echo of those inserts to trigger the
 * second pass that actually reads them back. Without a change signal, a demo
 * would open with no habits or recurring tasks materialised at all.
 *
 * It terminates for the same reason the real one does — the second pass finds
 * nothing left to insert, so it emits nothing.
 */
const listeners = new Set<() => void>()

export function onDemoChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitDemoChange(): void {
  for (const listener of [...listeners]) listener()
}

/** Wipe and re-seed. Called at module load and by "Reset demo data". */
export function resetDemoStore(today = todayISO()): void {
  const seeded = buildSeed(today)
  for (const key of Object.keys(tables)) delete tables[key]
  for (const [name, rows] of Object.entries(seeded)) tables[name] = rows
  // Every table the app touches must exist, even when it seeds empty — a missing
  // key would read as "table not found" rather than "no rows".
  for (const name of Object.keys(DEFAULTS)) tables[name] ??= []
}

/** Fill in the columns Postgres would have defaulted, plus id and created_at. */
export function withDefaults(table: string, row: Row): Row {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    owner_id: DEMO_OWNER_ID,
    ...structuredClone(DEFAULTS[table] ?? {}),
    ...row,
  }
}

resetDemoStore()
