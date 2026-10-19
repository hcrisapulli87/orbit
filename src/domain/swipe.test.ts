import { describe, it, expect } from 'vitest'
import { SWIPE_TRIGGER, classifyGesture, rowOffset, swipeOutcome } from './swipe'

describe('classifyGesture', () => {
  it('waits until the finger has moved past the slop', () => {
    expect(classifyGesture(4, 3)).toBe('pending')
  })

  it('commits to horizontal only when it clearly wins', () => {
    expect(classifyGesture(30, 5)).toBe('horizontal')
    expect(classifyGesture(-30, 5)).toBe('horizontal')
  })

  it('treats a diagonal as a scroll', () => {
    expect(classifyGesture(20, 18)).toBe('vertical')
    expect(classifyGesture(2, 40)).toBe('vertical')
  })
})

describe('rowOffset', () => {
  it('follows the finger up to the trigger, then drags', () => {
    expect(rowOffset(40, true, true)).toBe(40)
    const past = rowOffset(SWIPE_TRIGGER + 100, true, true)
    expect(past).toBeGreaterThan(SWIPE_TRIGGER)
    expect(past).toBeLessThan(SWIPE_TRIGGER + 100)
  })

  it('stays put in a direction with no action', () => {
    expect(rowOffset(-50, true, false)).toBe(0)
    expect(rowOffset(50, false, true)).toBe(0)
  })
})

describe('swipeOutcome', () => {
  it('fires only past the trigger, and only where allowed', () => {
    expect(swipeOutcome(SWIPE_TRIGGER, true, true)).toBe('right')
    expect(swipeOutcome(-SWIPE_TRIGGER, true, true)).toBe('left')
    expect(swipeOutcome(SWIPE_TRIGGER - 1, true, true)).toBeNull()
    expect(swipeOutcome(-SWIPE_TRIGGER, true, false)).toBeNull()
  })
})
