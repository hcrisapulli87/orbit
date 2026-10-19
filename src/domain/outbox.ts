// Captures made without a connection.
//
// Capture is the one write that has to work on a train: the thought is gone if
// it can't be put down. Edits to existing rows still need the network (merging
// them against realtime is a different, larger problem), but a new row can't
// conflict with anything — so new captures wait here, in order, and are sent
// when the connection comes back. Each carries the id it will have on the
// server, which makes sending it twice harmless.

/** A queued insert: a task, or a repeating rule typed into the capture bar. */
export type OutboxItem =
  | { kind: 'task'; id: string; row: Record<string, unknown> }
  | { kind: 'series'; id: string; row: Record<string, unknown> }

/**
 * Was this a failure to reach the server, as opposed to the server saying no?
 * Only the first is worth queueing — a rejected row will be rejected again.
 * Browsers word it differently: Chrome "Failed to fetch", Firefox
 * "NetworkError…", Safari "Load failed", Node "fetch failed".
 */
export function isNetworkError(e: unknown, online = true): boolean {
  if (!online) return true
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)
}

/** Apply a patch to a queued row, so an edit made offline isn't lost. */
export function patchQueued(queue: OutboxItem[], id: string, patch: Record<string, unknown>): OutboxItem[] {
  return queue.map((item) => (item.id === id ? { ...item, row: { ...item.row, ...patch } } : item))
}

/** Drop a queued row — deleting something that never reached the server. */
export function dropQueued(queue: OutboxItem[], id: string): OutboxItem[] {
  return queue.filter((item) => item.id !== id)
}

/**
 * The server's rows plus the queued tasks it doesn't have yet, so a capture
 * made offline shows up where it belongs straight away. A queued row the
 * server already has (sent, but the queue not yet cleared) appears once.
 */
export function withQueued<T extends { id: string }>(
  server: T[],
  queue: OutboxItem[],
  toRow: (row: Record<string, unknown>) => T,
): T[] {
  const have = new Set(server.map((t) => t.id))
  const queued = queue.filter((item) => item.kind === 'task' && !have.has(item.id)).map((item) => toRow(item.row))
  return queued.length ? [...server, ...queued] : server
}
