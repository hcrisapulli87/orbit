import { describe, it, expect } from 'vitest'
import { layoutTimedItems, monthGrid, monthLabel, weekDays } from './calendarGrid'

describe('monthGrid', () => {
  it('always returns 6 rows of 7, so the grid never reflows between months', () => {
    for (const month of ['2026-02-01', '2026-07-01', '2026-08-01', '2028-02-01']) {
      const grid = monthGrid(month)
      expect(grid).toHaveLength(6)
      expect(grid.every((row) => row.length === 7)).toBe(true)
    }
  })

  it('starts on the Monday on or before the 1st', () => {
    // 1 July 2026 is a Wednesday, so the grid opens on Monday 29 June.
    const grid = monthGrid('2026-07-01')
    expect(grid[0][0]).toBe('2026-06-29')
    expect(grid[0][2]).toBe('2026-07-01')
  })

  it('pads a short February out to six rows', () => {
    // February 2026 starts on a Sunday and has 28 days.
    const grid = monthGrid('2026-02-15')
    expect(grid[0][0]).toBe('2026-01-26')
    expect(grid[5][6]).toBe('2026-03-08')
  })

  it('crosses a year boundary', () => {
    const grid = monthGrid('2026-12-01')
    expect(grid[0][0]).toBe('2026-11-30')
    expect(grid.flat()).toContain('2027-01-01')
  })

  it('supports a Sunday-start week', () => {
    expect(monthGrid('2026-07-01', 0)[0][0]).toBe('2026-06-28')
  })

  it('works from any day in the month, not just the 1st', () => {
    expect(monthGrid('2026-07-19')).toEqual(monthGrid('2026-07-01'))
  })
})

describe('weekDays', () => {
  it('returns the seven days of the containing week', () => {
    expect(weekDays('2026-07-30')).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
      '2026-07-31', '2026-08-01', '2026-08-02',
    ])
  })

  it('treats Sunday as the last day of a Monday-start week', () => {
    expect(weekDays('2026-07-26')[6]).toBe('2026-07-26')
  })
})

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel('2026-07-19')).toBe('July 2026')
    expect(monthLabel('2027-01-01')).toBe('January 2027')
  })
})

describe('layoutTimedItems', () => {
  const item = (id: string, start: number, end: number) => ({ id, start, end })

  it('gives a lone item the full width', () => {
    expect(layoutTimedItems([item('a', 540, 600)])).toEqual([
      { id: 'a', column: 0, columns: 1 },
    ])
  })

  it('keeps back-to-back items in one column', () => {
    // 10:00–11:00 then 11:00–12:00 touch but do not overlap.
    const out = layoutTimedItems([item('a', 600, 660), item('b', 660, 720)])
    expect(out).toEqual([
      { id: 'a', column: 0, columns: 1 },
      { id: 'b', column: 0, columns: 1 },
    ])
  })

  it('splits three overlapping items into three columns', () => {
    const out = layoutTimedItems([item('a', 540, 660), item('b', 570, 630), item('c', 600, 690)])
    expect(out.map((o) => o.column)).toEqual([0, 1, 2])
    expect(out.every((o) => o.columns === 3)).toBe(true)
  })

  it('reuses a column once its item has finished', () => {
    // a 9–10, b 9–11, c 10–11: c can take the column a vacated.
    const out = layoutTimedItems([item('a', 540, 600), item('b', 540, 660), item('c', 600, 660)])
    expect(out.find((o) => o.id === 'c')?.column).toBe(0)
    expect(out.every((o) => o.columns === 2)).toBe(true)
  })

  it('treats separated groups independently', () => {
    // Two overlapping in the morning, one alone in the afternoon.
    const out = layoutTimedItems([item('a', 540, 600), item('b', 550, 610), item('c', 840, 900)])
    expect(out.find((o) => o.id === 'c')).toEqual({ id: 'c', column: 0, columns: 1 })
    expect(out.find((o) => o.id === 'a')?.columns).toBe(2)
  })

  it('sorts by start time regardless of input order', () => {
    const out = layoutTimedItems([item('late', 840, 900), item('early', 540, 600)])
    expect(out.map((o) => o.id)).toEqual(['early', 'late'])
  })

  it('handles an empty day', () => {
    expect(layoutTimedItems([])).toEqual([])
  })
})
