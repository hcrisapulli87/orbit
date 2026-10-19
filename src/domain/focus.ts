// A focus session: one task, one stretch of time, counted down.
//
// Its length is the task's own estimate (planner.defaultEstimateFor) — the
// same number the capacity bar already counts — so starting one is a single
// tap with nothing to choose. Time is derived from the start instant on every
// tick rather than decremented, so a phone that slept for ten minutes wakes to
// the right number instead of resuming where the JavaScript timer stopped.

export interface FocusSession {
  taskId: string
  title: string
  /** Epoch ms. */
  startedAt: number
  durationMin: number
}

/** Seconds left, never below zero. */
export function secondsLeft(s: FocusSession, nowMs: number): number {
  return Math.max(0, Math.ceil((s.startedAt + s.durationMin * 60_000 - nowMs) / 1000))
}

/** "24:59", "1:05:00" for anything an hour or longer. */
export function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Five more minutes, counted from whichever is later: now, or the current end. */
export function extend(s: FocusSession, nowMs: number, minutes = 5): FocusSession {
  const end = s.startedAt + s.durationMin * 60_000
  const from = Math.max(end, nowMs)
  return { ...s, durationMin: (from + minutes * 60_000 - s.startedAt) / 60_000 }
}
