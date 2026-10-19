import { describe, it, expect } from 'vitest'
import { clock, extend, secondsLeft } from './focus'

const session = { taskId: 't', title: 'Write', startedAt: 0, durationMin: 25 }

describe('secondsLeft', () => {
  it('counts down from the start instant and stops at zero', () => {
    expect(secondsLeft(session, 0)).toBe(1500)
    expect(secondsLeft(session, 60_000)).toBe(1440)
    expect(secondsLeft(session, 10 * 3600_000)).toBe(0)
  })
})

describe('clock', () => {
  it('formats minutes and seconds, adding hours when needed', () => {
    expect(clock(1499)).toBe('24:59')
    expect(clock(65)).toBe('1:05')
    expect(clock(3900)).toBe('1:05:00')
  })
})

describe('extend', () => {
  it('adds five minutes to a running session', () => {
    expect(extend(session, 60_000).durationMin).toBe(30)
  })

  it('counts from now once the time is already up', () => {
    // Up at 25 min; extended at 40 min → ends at 45.
    expect(extend(session, 40 * 60_000).durationMin).toBe(45)
  })
})
