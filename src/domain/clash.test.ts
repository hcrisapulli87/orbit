import { describe, it, expect } from 'vitest'
import { clashLabel, clashesWith } from './clash'

const review = { start: 660, end: 720, title: 'Design review' }
const standup = { start: 555, end: 570, title: 'Stand-up' }

describe('clashesWith', () => {
  it('finds overlaps, earliest first', () => {
    expect(clashesWith(540, 680, [review, standup])).toEqual(['Stand-up', 'Design review'])
  })

  it('does not count touching ends', () => {
    expect(clashesWith(720, 750, [review])).toEqual([])
    expect(clashesWith(630, 660, [review])).toEqual([])
  })
})

describe('clashLabel', () => {
  it('names one or two, and counts the rest', () => {
    expect(clashLabel(['A'])).toBe('A')
    expect(clashLabel(['A', 'B'])).toBe('A and B')
    expect(clashLabel(['A', 'B', 'C'])).toBe('A and 2 more')
    expect(clashLabel([])).toBe('')
  })
})
