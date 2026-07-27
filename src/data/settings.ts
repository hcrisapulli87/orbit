import { supabase } from '../lib/supabase'
import type { Settings } from './types'

/**
 * Used until the row loads, and if it somehow doesn't exist. Matching the
 * column defaults means the app is fully usable without ever opening Settings.
 */
export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'owner_id' | 'created_at'> = {
  weekday_capacity: [60, 180, 180, 180, 180, 180, 120], // Sunday first
  day_start: '08:00',
  day_end: '21:00',
  push_lead_min: 30,
  digest_enabled: true,
}

export async function fetchSettings(): Promise<Settings | null> {
  // maybeSingle: a missing row is a normal state, not an error.
  const { data, error } = await supabase.from('task_settings').select('*').maybeSingle()
  // 42P01 = undefined_table: the schema hasn't been run this far yet. Settings
  // are the one thing the app can do entirely without, so fall back to the
  // defaults rather than taking the whole screen down over them.
  if (error && error.code !== '42P01') throw error
  return data ?? null
}

export async function updateSettings(ownerId: string, patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase
    .from('task_settings')
    .upsert({ owner_id: ownerId, ...patch }, { onConflict: 'owner_id' })
  if (error) throw error
}
