import { supabase } from '../lib/supabase'
import { addDays, todayISO } from '../domain/day'
import type { NewTask, Task } from './types'

/** How far back completed tasks stay in the working set (history views query directly). */
const COMPLETED_WINDOW_DAYS = 30

/**
 * The working set: everything still open, plus anything completed recently so
 * Today can show what's already been ticked off and habits can draw a streak.
 * Older history is fetched per-screen rather than held in memory.
 */
export async function fetchTasks(today = todayISO()): Promise<Task[]> {
  const since = addDays(today, -COMPLETED_WINDOW_DAYS)
  const { data, error } = await supabase
    .from('task_tasks')
    .select('*')
    .or(`status.eq.open,completed_on.gte.${since}`)
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createTask(ownerId: string, task: NewTask): Promise<Task> {
  const { data, error } = await supabase
    .from('task_tasks')
    .insert({ ...task, owner_id: ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Tick or untick. completed_on is the LOCAL calendar day, not a UTC-derived one —
 * streaks and "done today" both key off it, so an evening tick must not land on
 * tomorrow.
 */
export async function setTaskDone(id: string, done: boolean, today = todayISO()): Promise<void> {
  const { error } = await supabase
    .from('task_tasks')
    .update(
      done
        ? { status: 'done', completed_at: new Date().toISOString(), completed_on: today }
        : { status: 'open', completed_at: null, completed_on: null },
    )
    .eq('id', id)
  if (error) throw error
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const { error } = await supabase.from('task_tasks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('task_tasks').delete().eq('id', id)
  if (error) throw error
}

/**
 * The Inbox is the absence of triage, not a flag — an open, undated task with no
 * project and no area. Deriving it means filing something can never leave a
 * stale marker behind.
 */
export function isInbox(t: Task): boolean {
  return (
    t.status === 'open' &&
    t.parent_id === null &&
    t.project_id === null &&
    t.area_id === null &&
    t.due_on === null
  )
}
