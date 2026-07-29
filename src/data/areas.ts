import { supabase } from '../lib/supabase'
import type { Area } from './types'

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('task_areas')
    .select('*')
    .eq('is_archived', false)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

/**
 * Areas were seeded by schema.sql and creatable nowhere, which meant an empty
 * Lists screen could only tell the user to go and run some SQL.
 */
export async function createArea(
  ownerId: string,
  area: Pick<Area, 'name' | 'icon'> & Partial<Pick<Area, 'colour' | 'sort_order'>>,
): Promise<Area> {
  const { data, error } = await supabase
    .from('task_areas')
    .insert({ ...area, owner_id: ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateArea(id: string, patch: Partial<Area>): Promise<void> {
  const { error } = await supabase.from('task_areas').update(patch).eq('id', id)
  if (error) throw error
}
