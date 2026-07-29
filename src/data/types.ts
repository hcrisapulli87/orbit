// Row types mirror the database columns verbatim — snake_case, no mapping layer.
// Keeping the two identical means a query result is already the app's type.

import type { ModeId, PaletteId, ThemeId } from '../domain/appearance'

export type TaskKind = 'task' | 'habit' | 'event'
export type TaskStatus = 'open' | 'done' | 'dropped'
export type TaskSource = 'app' | 'capture' | 'recurrence' | 'template' | 'import'
export type ProjectKind = 'project' | 'list'
export type ParseConfidence = 'high' | 'low'

export interface Area {
  id: string
  owner_id: string
  name: string
  icon: string
  colour: string
  sort_order: number
  is_archived: boolean
  created_at: string
}

export interface Project {
  id: string
  owner_id: string
  area_id: string | null
  name: string
  kind: ProjectKind
  icon: string
  colour: string
  sort_order: number
  is_archived: boolean
  created_at: string
}

export interface Task {
  id: string
  owner_id: string
  title: string
  notes: string
  project_id: string | null
  area_id: string | null
  parent_id: string | null
  kind: TaskKind
  status: TaskStatus
  priority: number
  due_on: string | null
  due_time: string | null
  starts_on: string | null
  estimate_min: number | null
  tags: string[]
  source: TaskSource
  capture_text: string | null
  parse_confidence: ParseConfidence | null
  completed_at: string | null
  completed_on: string | null
  sort_order: number
  created_at: string
  /** Set when a recurrence rule produced this row. */
  series_id: string | null
  /** Stable identity within the series — the occurrence date. */
  occurrence_key: string | null
}

export type RuleType =
  | 'daily'
  | 'weekly'
  | 'monthly_day'
  | 'monthly_last'
  | 'monthly_nth'
  | 'yearly'
  | 'after_completion'

/**
 * A recurrence rule plus the task fields its occurrences inherit. Kept separate
 * from the occurrences themselves so rescheduling one Tuesday never edits the
 * rule, and so a habit keeps a real history instead of one mutable due date.
 */
export interface Series {
  id: string
  owner_id: string
  title: string
  notes: string
  project_id: string | null
  area_id: string | null
  kind: TaskKind
  priority: number
  tags: string[]
  estimate_min: number | null
  due_time: string | null

  rule_type: RuleType
  step: number
  weekdays: number[]
  month_day: number | null
  nth: number | null
  month: number | null
  after_n: number | null
  after_unit: 'day' | 'week' | 'month' | null

  anchor_on: string
  until_on: string | null
  lead_days: number
  active: boolean
  created_at: string
}

/**
 * A slot of time. Separate from the task because one task can be blocked twice,
 * a block can be non-task time, and the planner rewrites its own without
 * touching the tasks.
 */
export interface Block {
  id: string
  owner_id: string
  on_date: string
  start_time: string
  end_time: string
  task_id: string | null
  label: string
  source: 'manual' | 'planner'
  /** An all-day entry. Times are still stored, so the grid has something to
      lay out if the flag is ever turned off again. */
  all_day: boolean
  created_at: string
}

export interface Template {
  id: string
  owner_id: string
  name: string
  icon: string
  area_id: string | null
  creates: 'project' | 'tasks'
  use_count: number
  created_at: string
}

export interface TemplateItem {
  id: string
  owner_id: string
  template_id: string
  title: string
  notes: string
  sort_order: number
  parent_index: number | null
  offset_days: number | null
  priority: number
  estimate_min: number | null
  tags: string[]
}

export interface Settings {
  id: string
  owner_id: string
  /** Minutes of task time per weekday, Sunday first — matches weekdayOf(). */
  weekday_capacity: number[]
  day_start: string
  day_end: string
  push_lead_min: number
  digest_enabled: boolean
  /** The three appearance axes. Postgres is the source of truth for these;
      localStorage only mirrors them so a cold start doesn't flash. */
  ui_theme: ThemeId
  ui_palette: PaletteId
  ui_mode: ModeId
  created_at: string
}

/** The fields a caller supplies when creating a series. */
export type NewSeries = Omit<Series, 'id' | 'owner_id' | 'created_at'>

/** The fields a caller may supply when creating a task. */
export type NewTask = Partial<
  Pick<
    Task,
    | 'notes'
    | 'project_id'
    | 'area_id'
    | 'parent_id'
    | 'kind'
    | 'priority'
    | 'due_on'
    | 'due_time'
    | 'starts_on'
    | 'estimate_min'
    | 'tags'
    | 'source'
    | 'capture_text'
    | 'parse_confidence'
  >
> & { title: string }
