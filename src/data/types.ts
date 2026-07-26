// Row types mirror the database columns verbatim — snake_case, no mapping layer.
// Keeping the two identical means a query result is already the app's type.

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
}

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
