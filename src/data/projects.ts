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
