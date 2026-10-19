import { describe, it, expect } from 'vitest'
import { collapseSeries, normalise, searchNamed, searchTasks, tokens } from './search'
import type { Searchable } from './search'

let seq = 0
const task = (patch: Partial<Searchable> = {}): Searchable => ({
  id: `t${++seq}`,
  title: 'Untitled',
  notes: '',
  tags: [],
  status: 'open',
  due_on: null,
  completed_on: null,
  project_id: null,
  series_id: null,
  ...patch,
})

const titles = (list: Searchable[]) => list.map((t) => t.title)

describe('normalise and tokens', () => {
  it('folds case and accents', () => {
    expect(normalise('Café ÄBC')).toBe('cafe abc')
  })

  it('splits on whitespace and drops repeats', () => {
    expect(tokens('  Rego  rego car ')).toEqual(['rego', 'car'])
  })
})

describe('searchTasks', () => {
  it('returns nothing for an empty query', () => {
    expect(searchTasks('   ', [task({ title: 'Pay rego' })])).toEqual([])
  })

  it('needs every word to land somewhere', () => {
    const list = [task({ title: 'Pay rego' }), task({ title: 'Pay rent' })]
    expect(titles(searchTasks('pay rego', list))).toEqual(['Pay rego'])
  })

  it('ignores case and accents', () => {
    expect(titles(searchTasks('cafe', [task({ title: 'Book Café Lola' })]))).toEqual(['Book Café Lola'])
  })

  it('finds a word in the notes, a tag, or the project name', () => {
    const projects = new Map([['p1', 'Car']])
    const list = [
      task({ title: 'Ring them', notes: 'about the invoice' }),
      task({ title: 'Lodge it', tags: ['tax'] }),
      task({ title: 'Tyres', project_id: 'p1' }),
    ]
    expect(titles(searchTasks('invoice', list, projects))).toEqual(['Ring them'])
    expect(titles(searchTasks('#ta', list, projects))).toEqual(['Lodge it'])
    expect(titles(searchTasks('car', list, projects))).toEqual(['Tyres'])
  })

  it('ranks a title hit above a notes hit', () => {
    const list = [
      task({ title: 'Call the bank', notes: 'ask about the mortgage' }),
      task({ title: 'Mortgage renewal' }),
    ]
    expect(titles(searchTasks('mortgage', list))).toEqual(['Mortgage renewal', 'Call the bank'])
  })

  it('ranks open work above done work', () => {
    const list = [
      task({ title: 'Book dentist', status: 'done', completed_on: '2026-07-01' }),
      task({ title: 'Book dentist again' }),
    ]
    expect(titles(searchTasks('dentist', list))).toEqual(['Book dentist again', 'Book dentist'])
  })

  it('breaks ties by what is due soonest', () => {
    const list = [
      task({ title: 'Bins', due_on: '2026-08-05' }),
      task({ title: 'Bins', due_on: '2026-08-01' }),
      task({ title: 'Bins' }),
    ]
    expect(searchTasks('bins', list).map((t) => t.due_on)).toEqual(['2026-08-01', '2026-08-05', null])
  })

  it('leaves out dropped tasks', () => {
    expect(searchTasks('rego', [task({ title: 'Pay rego', status: 'dropped' })])).toEqual([])
  })
})

describe('collapseSeries', () => {
  it('keeps the next open occurrence of a repeat', () => {
    const list = [
      task({ title: 'Stretch', series_id: 's', due_on: '2026-08-03' }),
      task({ title: 'Stretch', series_id: 's', due_on: '2026-08-01' }),
      task({ title: 'Stretch', series_id: 's', status: 'done', completed_on: '2026-07-31' }),
    ]
    const out = collapseSeries(list)
    expect(out).toHaveLength(1)
    expect(out[0].due_on).toBe('2026-08-01')
  })

  it('falls back to the latest completion when nothing is open', () => {
    const list = [
      task({ title: 'Service', series_id: 's', status: 'done', completed_on: '2026-01-10' }),
      task({ title: 'Service', series_id: 's', status: 'done', completed_on: '2026-07-10' }),
    ]
    expect(collapseSeries(list)[0].completed_on).toBe('2026-07-10')
  })

  it('leaves one-off tasks alone', () => {
    expect(collapseSeries([task(), task()])).toHaveLength(2)
  })
})

describe('searchNamed', () => {
  it('matches every word against the name', () => {
    const items = [{ name: 'Hardware store' }, { name: 'Groceries' }]
    expect(searchNamed('hard store', items)).toEqual([{ name: 'Hardware store' }])
    expect(searchNamed('', items)).toEqual([])
  })
})
