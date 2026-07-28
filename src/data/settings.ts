import { supabase } from '../lib/supabase'
import { DEFAULT_APPEARANCE, coerceAppearance } from '../domain/appearance'
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
  ui_theme: DEFAULT_APPEARANCE.theme,
  ui_palette: DEFAULT_APPEARANCE.palette,
  ui_mode: DEFAULT_APPEARANCE.mode,
}

export async function fetchSettings(): Promise<Settings | null> {
  // maybeSingle: a missing row is a normal state, not an error.
  const { data, error } = await supabase.from('task_settings').select('*').maybeSingle()
  // 42P01 = undefined_table: the schema hasn't been run this far yet. Settings
  // are the one thing the app can do entirely without, so fall back to the
  // defaults rather than taking the whole screen down over them.
  if (error && error.code !== '42P01') throw error
  if (!data) return null
  // A row written before the v8 columns existed has no appearance on it, and
  // an unrecognised value would key a stylesheet block that isn't there — so
  // the three are normalised here rather than trusted.
  const appearance = coerceAppearance({
    theme: data.ui_theme,
    palette: data.ui_palette,
    mode: data.ui_mode,
  })
  return {
    ...data,
    ui_theme: appearance.theme,
    ui_palette: appearance.palette,
    ui_mode: appearance.mode,
  }
}

export async function updateSettings(ownerId: string, patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase
    .from('task_settings')
    .upsert({ owner_id: ownerId, ...patch }, { onConflict: 'owner_id' })
  if (error) throw error
}
