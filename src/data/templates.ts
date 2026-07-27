import { supabase } from '../lib/supabase'
import { deriveTemplate, instantiateTemplate } from '../domain/templates'
import type { TemplateItemSpec } from '../domain/templates'
import type { Task, Template, TemplateItem } from './types'

/** Missing table = this schema version hasn't been run. Not fatal. */
const MISSING_TABLE = '42P01'

export async function fetchTemplates(): Promise<Template[]> {
  const { data, error } = await supabase.from('task_templates').select('*').order('name')
  if (error && error.code !== MISSING_TABLE) throw error
  return data ?? []
}

export async function fetchTemplateItems(): Promise<TemplateItem[]> {
  const { data, error } = await supabase
    .from('task_template_items')
    .select('*')
    .order('sort_order')
  if (error && error.code !== MISSING_TABLE) throw error
  return data ?? []
}

/** Rows → the domain's spec shape. */
export function specsOf(items: TemplateItem[]): TemplateItemSpec[] {
  return items.map((i) => ({
    title: i.title,
    notes: i.notes,
    sort_order: i.sort_order,
    parent_index: i.parent_index,
    offset_days: i.offset_days,
    priority: i.priority,
    estimate_min: i.estimate_min,
    tags: i.tags,
  }))
}

/**
 * "Save this project as a template" — the way templates actually get made.
 * Nobody fills in a template form, but plenty of people will tap this once
 * they've just finished doing the thing.
 */
export async function saveProjectAsTemplate(
  ownerId: string,
  name: string,
  areaId: string | null,
  tasks: Task[],
): Promise<void> {
  const specs = deriveTemplate(tasks)

  const { data: template, error } = await supabase
    .from('task_templates')
    .insert({ owner_id: ownerId, name, area_id: areaId })
    .select()
    .single()
  if (error) throw error

  if (specs.length === 0) return
  const { error: itemsError } = await supabase.from('task_template_items').insert(
    specs.map((s) => ({ ...s, owner_id: ownerId, template_id: template.id })),
  )
  if (itemsError) throw itemsError
}

/**
 * Expand a template into real tasks around an anchor date.
 *
 * Two passes, because a parent's id only exists once it has been inserted: the
 * top level goes in first, then children resolve their parent_index against
 * the ids that came back.
 */
export async function instantiate(
  ownerId: string,
  template: Template,
  items: TemplateItem[],
  anchor: string,
): Promise<void> {
  const drafts = instantiateTemplate(specsOf(items), anchor)
  if (drafts.length === 0) return

  const common = {
    owner_id: ownerId,
    area_id: template.area_id,
    source: 'template' as const,
  }
  const fields = (d: (typeof drafts)[number]) => ({
    title: d.title,
    notes: d.notes,
    due_on: d.due_on,
    priority: d.priority,
    estimate_min: d.estimate_min,
    tags: d.tags,
    sort_order: d.sort_order,
  })

  const roots = drafts.filter((d) => d.parent_index === null)
  const { data: inserted, error } = await supabase
    .from('task_tasks')
    .insert(roots.map((d) => ({ ...common, ...fields(d) })))
    .select('id')
  if (error) throw error

  const idByIndex = new Map(roots.map((d, i) => [d.index, inserted?.[i]?.id]))

  const children = drafts.filter((d) => d.parent_index !== null)
  if (children.length > 0) {
    const { error: childError } = await supabase.from('task_tasks').insert(
      children.map((d) => ({
        ...common,
        ...fields(d),
        parent_id: idByIndex.get(d.parent_index as number) ?? null,
      })),
    )
    if (childError) throw childError
  }

  await supabase
    .from('task_templates')
    .update({ use_count: template.use_count + 1 })
    .eq('id', template.id)
}

export async function deleteTemplate(id: string): Promise<void> {
  // Items cascade.
  const { error } = await supabase.from('task_templates').delete().eq('id', id)
  if (error) throw error
}
