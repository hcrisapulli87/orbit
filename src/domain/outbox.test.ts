import { describe, it, expect } from 'vitest'
import { dropQueued, isNetworkError, patchQueued, withQueued } from './outbox'
import type { OutboxItem } from './outbox'

const queue: OutboxItem[] = [
  { kind: 'task', id: 'a', row: { id: 'a', title: 'Buy milk' } },
  { kind: 'series', id: 's', row: { id: 's', title: 'Stretch' } },
]

describe('isNetworkError', () => {
  it('recognises each browser’s wording', () => {
    for (const m of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']) {
      expect(isNetworkError(new Error(m))).toBe(true)
    }
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true)
  })

  it('treats anything while offline as a network error', () => {
    expect(isNetworkError(new Error('whatever'), false)).toBe(true)
  })

  it('does not queue a row the server rejected', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy' })).toBe(false)
  })
})

describe('patchQueued and dropQueued', () => {
  it('edits and removes a queued row by id', () => {
    expect(patchQueued(queue, 'a', { status: 'done' })[0].row).toEqual({ id: 'a', title: 'Buy milk', status: 'done' })
    expect(dropQueued(queue, 'a').map((i) => i.id)).toEqual(['s'])
  })
})

describe('withQueued', () => {
  const toRow = (row: Record<string, unknown>) => ({ id: String(row.id), title: String(row.title) })

  it('adds queued tasks the server does not have yet', () => {
    expect(withQueued([{ id: 'x', title: 'On server' }], queue, toRow).map((t) => t.id)).toEqual(['x', 'a'])
  })

  it('shows a row once when the server already has it', () => {
    expect(withQueued([{ id: 'a', title: 'Buy milk' }], queue, toRow)).toHaveLength(1)
  })

  it('leaves repeating rules out — they appear once saved', () => {
    expect(withQueued([], queue, toRow).map((t) => t.id)).toEqual(['a'])
  })
})
