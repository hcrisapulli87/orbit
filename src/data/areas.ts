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
