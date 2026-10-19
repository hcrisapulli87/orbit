import type { OutboxItem } from '../domain/outbox'

// The outbox lives in localStorage because it has to outlast the tab: a
// capture made on the train is still queued after the phone kills the app.
// Every access is guarded — private windows and full storage both throw —
// and a broken read just means an empty queue rather than a crash.

const KEY = 'orbit.outbox'

export function loadOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : []
  } catch {
    return []
  }
}

export function saveOutbox(queue: OutboxItem[]): void {
  try {
    if (queue.length) localStorage.setItem(KEY, JSON.stringify(queue))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage full or blocked: the queue still works for this session.
  }
}
