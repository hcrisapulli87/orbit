import { describe, it, expect } from 'vitest'
import { instantFromWall, isKnownZone, wallInZone } from './zone'

const MEL = 'Australia/Melbourne'

describe('wallInZone', () => {
  it('reads an instant as Melbourne local time', () => {
    // 23:30Z on 19 Oct is 10:30 on the 20th in AEDT (+11).
    expect(wallInZone(Date.UTC(2026, 9, 19, 23, 30), MEL)).toEqual({ date: '2026-10-20', minutes: 630 })
  })

  it('reads the same instant differently in winter', () => {
    // AEST (+10) in July.
    expect(wallInZone(Date.UTC(2026, 6, 1, 0, 0), MEL)).toEqual({ date: '2026-07-01', minutes: 600 })
  })
})

describe('instantFromWall', () => {
  it('inverts wallInZone on an ordinary day', () => {
    const t = instantFromWall('2026-10-20', 9 * 60, MEL)
    expect(t).toBe(Date.UTC(2026, 9, 19, 22, 0))
    expect(wallInZone(t, MEL)).toEqual({ date: '2026-10-20', minutes: 540 })
  })

  it('moves a time skipped by spring-forward an hour later', () => {
    // Melbourne jumps 02:00 → 03:00 on 4 Oct 2026.
    expect(wallInZone(instantFromWall('2026-10-04', 150, MEL), MEL)).toEqual({ date: '2026-10-04', minutes: 210 })
  })

  it('takes the earlier reading of an ambiguous autumn time', () => {
    // 02:30 happens twice on 5 Apr 2026; the first is still AEDT (+11).
    expect(instantFromWall('2026-04-05', 150, MEL)).toBe(Date.UTC(2026, 3, 4, 15, 30))
  })

  it('handles UTC', () => {
    expect(instantFromWall('2026-10-20', 0, 'UTC')).toBe(Date.UTC(2026, 9, 20))
  })
})

describe('isKnownZone', () => {
  it('knows IANA names and rejects Windows ones', () => {
    expect(isKnownZone(MEL)).toBe(true)
    expect(isKnownZone('AUS Eastern Standard Time')).toBe(false)
  })
})
