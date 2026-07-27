// Templates: a repeatable multi-step job, and the inverse — turning a project
// you've already done into one.
//
// The inverse (deriveTemplate) matters more than the forward direction. It is
// how templates come into existence at all: nobody sits down to fill in a
// template form, but everyone will tap "save this as a template" once they've
// just finished doing the thing.

import { addDays, compareISO, daysBetween } from './day'
import type { ISODate } from './day'

export interface TemplateItemSpec {
  title: string
  notes: string
  sort_order: number
  /** Index of the parent within the same array, or null for a top-level item. */
  parent_index: number | null
  /** Days relative to the instantiation anchor. Null means undated. */
  offset_days: number | null
  priority: number
  estimate_min: number | null
  tags: string[]
}

export interface TaskDraft {
  index: number
  parent_index: number | null
  title: string
  notes: string
  due_on: ISODate | null
  priority: number
  estimate_min: number | null
  tags: string[]
  sort_order: number
}

/**
 * Expand a template around an anchor date.
 *
 * Parent links stay as indexes: real ids don't exist until the rows are
 * inserted, so the data layer writes the top level first and then resolves
 * these against the ids it gets back.
 */
export function instantiateTemplate(items: TemplateItemSpec[], anchor: ISODate): TaskDraft[] {
  return items.map((item, index) => ({
    index,
    parent_index: topLevelAncestor(items, index),
    title: item.title,
    notes: item.notes,
    due_on: item.offset_days === null ? null : addDays(anchor, item.offset_days),
    priority: item.priority,
    estimate_min: item.estimate_min,
    tags: item.tags,
    sort_order: item.sort_order,
  }))
}

/**
 * Walk up to the outermost ancestor, since the app caps nesting at one level.
 * A grandchild flattens onto its top-level ancestor rather than being rejected,
 * and a broken or circular reference simply becomes a top-level item.
 */
function topLevelAncestor(items: TemplateItemSpec[], index: number): number | null {
  let parent = items[index].parent_index
  const seen = new Set<number>([index])

  while (parent !== null) {
    if (parent < 0 || parent >= items.length || seen.has(parent)) return null
    const grandparent = items[parent].parent_index
    if (grandparent === null) return parent
    seen.add(parent)
    parent = grandparent
  }
  return null
}

/** The subset of a task deriveTemplate needs. A stored Task satisfies it. */
export interface DerivableTask {
  id: string
  title: string
  notes: string
  parent_id: string | null
  due_on: string | null
  priority: number
  estimate_min: number | null
  tags: string[]
  status: 'open' | 'done' | 'dropped'
  sort_order: number
}

/**
 * Turn a project's tasks back into a template.
 *
 * Completed work is kept — a template is a recipe for the whole job, not a list
 * of what's left. Abandoned work is dropped, along with anything hanging off it,
 * because a child with no parent would silently become a top-level step.
 *
 * Offsets are measured from the earliest due date unless an anchor is given, so
 * "the day it starts" is the natural zero.
 */
export function deriveTemplate(tasks: DerivableTask[], anchor?: ISODate): TemplateItemSpec[] {
  const kept = tasks.filter((t) => t.status !== 'dropped')
  const keptIds = new Set(kept.map((t) => t.id))
  const rooted = kept.filter((t) => t.parent_id === null || keptIds.has(t.parent_id))

  const dates = rooted.map((t) => t.due_on).filter((d): d is string => d !== null)
  const zero = anchor ?? dates.sort(compareISO)[0] ?? null

  const indexById = new Map(rooted.map((t, i) => [t.id, i]))

  return rooted.map((t) => ({
    title: t.title,
    notes: t.notes,
    sort_order: t.sort_order,
    parent_index: t.parent_id !== null ? indexById.get(t.parent_id) ?? null : null,
    offset_days: t.due_on && zero ? daysBetween(zero, t.due_on) : null,
    priority: t.priority,
    estimate_min: t.estimate_min,
    tags: t.tags,
  }))
}
