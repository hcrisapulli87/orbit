import { supabase } from '../lib/supabase'
import { addDays, todayISO } from '../domain/day'
import type { Block } from './types'

const PAST_DAYS = 30
const FUTURE_DAYS = 90

/** Blocks around today. The calendar never pages far enough to need more. */
export async function fetchBlocks(today = todayISO()): Promise<Block[]> {
  const { data, error } = await supabase
    .from('task_blocks')
    .select('*')
    .gte('on_date', addDays(today, -PAST_DAYS))
    .lte('on_date', addDays(today, FUTURE_DAYS))
    .order('on_date')
    .order('start_time')
  // 42P01 = undefined_table: schema v4 hasn't been run yet. The calendar is
  // still perfectly usable without blocks, so don't take the load down.
  if (error && error.code !== '42P01') throw error
  return data ?? []
}

export async function createBlock(
  ownerId: string,
  block: Omit<Block, 'id' | 'owner_id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabase.from('task_blocks').insert({ ...block, owner_id: ownerId })
  if (error) throw error
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('task_blocks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Replace the auto-planner's suggestions for one day.
 *
 * Scoped to source='planner' on purpose: re-planning must never disturb a block
 * placed by hand. That's the entire reason the column exists.
 */
export async function replacePlannerBlocks(
  ownerId: string,
  date: string,
  blocks: Omit<Block, 'id' | 'owner_id' | 'created_at'>[],
): Promise<void> {
  const { error: clearError } = await supabase
    .from('task_blocks')
    .delete()
    .eq('owner_id', ownerId)
    .eq('on_date', date)
    .eq('source', 'planner')
  if (clearError) throw clearError

  if (blocks.length === 0) return
  const { error } = await supabase
    .from('task_blocks')
    .insert(blocks.map((b) => ({ ...b, owner_id: ownerId })))
  if (error) throw error
}
