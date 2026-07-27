import { describe, it, expect } from 'vitest'
import { deriveTemplate, instantiateTemplate } from './templates'
import type { DerivableTask, TemplateItemSpec } from './templates'

const item = (patch: Partial<TemplateItemSpec> & Pick<TemplateItemSpec, 'title'>): TemplateItemSpec => ({
  notes: '',
  sort_order: 0,
  parent_index: null,
  offset_days: null,
  priority: 0,
  estimate_min: null,
  tags: [],
  ...patch,
})

const ANCHOR = '2026-08-10'

describe('instantiateTemplate', () => {
  it('turns each item into a draft, keeping order', () => {
    const drafts = instantiateTemplate(
      [item({ title: 'Book service', sort_order: 0 }), item({ title: 'Drop car off', sort_order: 1 })],
      ANCHOR,
    )
    expect(drafts.map((d) => d.title)).toEqual(['Book service', 'Drop car off'])
    expect(drafts.map((d) => d.sort_order)).toEqual([0, 1])
  })

  it('resolves offsets against the anchor', () => {
    const drafts = instantiateTemplate(
      [
        item({ title: 'Night before', offset_days: -1 }),
        item({ title: 'On the day', offset_days: 0 }),
        item({ title: 'Week after', offset_days: 7 }),
      ],
      ANCHOR,
    )
    expect(drafts.map((d) => d.due_on)).toEqual(['2026-08-09', '2026-08-10', '2026-08-17'])
  })

  it('leaves an item with no offset undated', () => {
    expect(instantiateTemplate([item({ title: 'Someday' })], ANCHOR)[0].due_on).toBeNull()
  })

  it('carries priority, estimate, notes and tags across', () => {
    const [draft] = instantiateTemplate(
      [item({ title: 'Pack', priority: 3, estimate_min: 45, notes: 'Cabin only', tags: ['trip'] })],
      ANCHOR,
    )
    expect(draft).toMatchObject({
      priority: 3,
      estimate_min: 45,
      notes: 'Cabin only',
      tags: ['trip'],
    })
  })

  it('keeps parent links as indexes for the data layer to resolve', () => {
    const drafts = instantiateTemplate(
      [item({ title: 'Service' }), item({ title: 'Book it', parent_index: 0 })],
      ANCHOR,
    )
    expect(drafts[0].parent_index).toBeNull()
    expect(drafts[1].parent_index).toBe(0)
  })

  // Depth is capped at one level in the app, not in the database, so a nested
  // template flattens onto the top-level ancestor rather than being rejected.
  it('flattens a grandchild onto its top-level ancestor', () => {
    const drafts = instantiateTemplate(
      [
        item({ title: 'Trip' }),
        item({ title: 'Pack', parent_index: 0 }),
        item({ title: 'Socks', parent_index: 1 }),
      ],
      ANCHOR,
    )
    expect(drafts[2].parent_index).toBe(0)
  })

  it('treats a broken parent reference as a top-level item', () => {
    const drafts = instantiateTemplate(
      [item({ title: 'Orphan', parent_index: 9 }), item({ title: 'Self', parent_index: 1 })],
      ANCHOR,
    )
    expect(drafts[0].parent_index).toBeNull()
    expect(drafts[1].parent_index).toBeNull()
  })

  it('handles an empty template', () => {
    expect(instantiateTemplate([], ANCHOR)).toEqual([])
  })
})

describe('deriveTemplate', () => {
  const task = (patch: Partial<DerivableTask> & Pick<DerivableTask, 'id' | 'title'>): DerivableTask => ({
    notes: '',
    parent_id: null,
    due_on: null,
    priority: 0,
    estimate_min: null,
    tags: [],
    status: 'open',
    sort_order: 0,
    ...patch,
  })

  // The inverse function matters more than the forward one: it's how templates
  // come into existence without anyone filling in a template form.
  it('turns a finished project back into a reusable template', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Book service', due_on: '2026-08-10', sort_order: 0 }),
      task({ id: 'b', title: 'Drop car off', due_on: '2026-08-12', sort_order: 1 }),
    ])
    expect(items.map((i) => i.title)).toEqual(['Book service', 'Drop car off'])
    expect(items.map((i) => i.offset_days)).toEqual([0, 2])
  })

  it('measures offsets from the earliest due date by default', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Later', due_on: '2026-08-20' }),
      task({ id: 'b', title: 'Earlier', due_on: '2026-08-18' }),
    ])
    expect(items.find((i) => i.title === 'Earlier')?.offset_days).toBe(0)
    expect(items.find((i) => i.title === 'Later')?.offset_days).toBe(2)
  })

  it('accepts an explicit anchor', () => {
    const items = deriveTemplate([task({ id: 'a', title: 'Thing', due_on: '2026-08-12' })], '2026-08-10')
    expect(items[0].offset_days).toBe(2)
  })

  it('keeps undated items undated', () => {
    expect(deriveTemplate([task({ id: 'a', title: 'Whenever' })])[0].offset_days).toBeNull()
  })

  it('converts parent ids into indexes', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Service', sort_order: 0 }),
      task({ id: 'b', title: 'Book it', parent_id: 'a', sort_order: 1 }),
    ])
    expect(items[1].parent_index).toBe(0)
  })

  it('includes completed work — a template is a recipe, not a to-do list', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Done bit', status: 'done' }),
      task({ id: 'b', title: 'Open bit' }),
    ])
    expect(items.map((i) => i.title)).toEqual(['Done bit', 'Open bit'])
  })

  it('drops abandoned work', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Kept' }),
      task({ id: 'b', title: 'Abandoned', status: 'dropped' }),
    ])
    expect(items.map((i) => i.title)).toEqual(['Kept'])
  })

  it('drops a child whose parent was abandoned rather than orphaning it', () => {
    const items = deriveTemplate([
      task({ id: 'a', title: 'Abandoned', status: 'dropped' }),
      task({ id: 'b', title: 'Child', parent_id: 'a' }),
    ])
    expect(items).toEqual([])
  })

  it('round-trips through instantiateTemplate', () => {
    const original = [
      task({ id: 'a', title: 'Service', due_on: '2026-08-10', sort_order: 0 }),
      task({ id: 'b', title: 'Book it', parent_id: 'a', due_on: '2026-08-08', sort_order: 1 }),
    ]
    const drafts = instantiateTemplate(deriveTemplate(original), '2026-09-10')
    expect(drafts.map((d) => d.title)).toEqual(['Service', 'Book it'])
    // "Book it" was two days before the anchor and stays two days before it.
    expect(drafts.map((d) => d.due_on)).toEqual(['2026-09-12', '2026-09-10'])
    expect(drafts[1].parent_index).toBe(0)
  })
})
