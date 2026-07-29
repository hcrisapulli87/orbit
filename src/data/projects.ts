import { supabase } from '../lib/supabase'
import type { Project } from './types'

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('task_projects')
    .select('*')
    .eq('is_archived', false)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

/**
 * Lists and projects are the same row; `kind` is the only difference and it
 * changes presentation, not storage. Both were seed-only until now, which made
 * the four seeded rows the only four that could ever exist.
 *
 * sort_order is left at the caller's choosing rather than computed here — new
 * rows land after the seeds because the seeds numbered themselves 10..40.
 */
export async function createProject(
  ownerId: string,
  project: Pick<Project, 'name' | 'kind' | 'icon' | 'area_id'> & Partial<Pick<Project, 'sort_order'>>,
): Promise<Project> {
  const { data, error } = await supabase
    .from('task_projects')
    .insert({ ...project, owner_id: ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('task_projects').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Archive rather than delete. `on delete set null` on task_projects would
 * quietly unfile every task in the list — the groceries would survive as loose
 * items in the Inbox, which is worse than either keeping or removing them.
 */
export async function archiveProject(id: string): Promise<void> {
  await updateProject(id, { is_archived: true })
}
