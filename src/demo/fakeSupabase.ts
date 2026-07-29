// A stand-in for supabase-js, backed by the in-memory demo store.
//
// Why fake the client rather than the data layer: every screen already goes
// through `useData()`, but `src/data/*` and `lib/push.ts` go through `supabase`.
// Swapping the client means the demo runs the REAL DataProvider, the real
// optimistic writes, the real occurrence materialisation and the real planner —
// so what you see is the actual app, not a second implementation of it that can
// drift away from the one that ships.
//
// Only the query surface Orbit actually uses is implemented. Anything else
// throws loudly rather than quietly returning nothing.

import { emitDemoChange, onDemoChange, resetDemoStore, tables, withDefaults } from './store'
import { clearStoredAppearance } from '../lib/appearance'
import { DEMO_EMAIL, DEMO_OWNER_ID } from './identity'
import type { Row } from './store'

type Op = 'eq' | 'gte' | 'lte' | 'neq' | 'in'
interface Filter { column: string; op: Op; value: unknown }
/** A parsed `.or('a.eq.x,b.gte.y')` — any one term matching is enough. */
interface OrFilter { any: Filter[] }
type AnyFilter = Filter | OrFilter

interface Result<T> { data: T; error: { message: string; code?: string } | null }

const isOr = (f: AnyFilter): f is OrFilter => 'any' in f

function test(row: Row, f: Filter): boolean {
  const actual = row[f.column]
  switch (f.op) {
    case 'eq': return actual === f.value
    case 'neq': return actual !== f.value
    // Comparisons only ever run over ISO date/time strings here, which order
    // correctly as plain strings — the same property the domain layer relies on.
    case 'gte': return actual != null && String(actual) >= String(f.value)
    case 'lte': return actual != null && String(actual) <= String(f.value)
    case 'in': return Array.isArray(f.value) && f.value.includes(actual)
  }
}

const matches = (row: Row, filters: AnyFilter[]): boolean =>
  filters.every((f) => (isOr(f) ? f.any.some((t) => test(row, t)) : test(row, f)))

/** `status.eq.open,completed_on.gte.2026-06-27` → two OR-ed terms. */
function parseOr(expression: string): OrFilter {
  return {
    any: expression.split(',').map((term) => {
      const [column, op, ...rest] = term.split('.')
      return { column, op: op as Op, value: rest.join('.') }
    }),
  }
}

function compare(a: unknown, b: unknown): number {
  // Nulls sort last, matching Postgres's default for ASC.
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

class Builder<T = Row[]> implements PromiseLike<Result<T>> {
  private filters: AnyFilter[] = []
  private orders: { column: string; ascending: boolean }[] = []
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row[] = []
  private patch: Row = {}
  private conflict: string[] = []
  private ignoreDuplicates = false
  private returning = false
  private cardinality: 'many' | 'one' | 'maybe' = 'many'

  constructor(private table: string) {}

  private get rows(): Row[] {
    return (tables[this.table] ??= [])
  }

  /** Column lists are ignored — every demo row is returned whole. */
  select(_columns?: string) {
    this.returning = true
    return this
  }

  insert(values: Row | Row[]) {
    this.mode = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    this.conflict = options?.onConflict?.split(',').map((c) => c.trim()) ?? ['id']
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false
    return this
  }

  update(patch: Row) {
    this.mode = 'update'
    this.patch = patch
    return this
  }

  delete() {
    this.mode = 'delete'
    return this
  }

  eq(column: string, value: unknown) { return this.filter({ column, op: 'eq', value }) }
  neq(column: string, value: unknown) { return this.filter({ column, op: 'neq', value }) }
  gte(column: string, value: unknown) { return this.filter({ column, op: 'gte', value }) }
  lte(column: string, value: unknown) { return this.filter({ column, op: 'lte', value }) }
  in(column: string, value: unknown[]) { return this.filter({ column, op: 'in', value }) }
  or(expression: string) { return this.filter(parseOr(expression)) }

  private filter(f: AnyFilter) {
    this.filters.push(f)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  limit(_n: number) { return this }

  single() { this.cardinality = 'one'; this.returning = true; return this }
  maybeSingle() { this.cardinality = 'maybe'; this.returning = true; return this }

  private run(): Result<unknown> {
    switch (this.mode) {
      case 'select': {
        const found = this.rows.filter((r) => matches(r, this.filters))
        for (const { column, ascending } of [...this.orders].reverse()) {
          found.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]))
        }
        return this.shape(found)
      }
      case 'insert': {
        const created = this.payload.map((r) => withDefaults(this.table, r))
        this.rows.push(...created)
        return this.shape(created)
      }
      case 'upsert': {
        const touched: Row[] = []
        for (const incoming of this.payload) {
          const existing = this.rows.find((r) =>
            this.conflict.every((c) => r[c] === incoming[c]),
          )
          if (existing) {
            if (!this.ignoreDuplicates) Object.assign(existing, incoming)
            touched.push(existing)
          } else {
            const created = withDefaults(this.table, incoming)
            this.rows.push(created)
            touched.push(created)
          }
        }
        return this.shape(touched)
      }
      case 'update': {
        const hit = this.rows.filter((r) => matches(r, this.filters))
        for (const row of hit) Object.assign(row, this.patch)
        return this.shape(hit)
      }
      case 'delete': {
        const kept = this.rows.filter((r) => !matches(r, this.filters))
        const removed = this.rows.filter((r) => matches(r, this.filters))
        tables[this.table] = kept
        return this.shape(removed)
      }
    }
  }

  private shape(rows: Row[]): Result<unknown> {
    // A write with no .select() returns no rows, exactly as PostgREST does.
    const data = !this.returning && this.mode !== 'select' ? null : structuredClone(rows)
    if (this.cardinality === 'many') return { data, error: null }
    const list = (data as Row[] | null) ?? []
    if (this.cardinality === 'one' && list.length !== 1) {
      return { data: null, error: { message: 'Expected exactly one row', code: 'PGRST116' } }
    }
    return { data: list[0] ?? null, error: null }
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // Resolved on a microtask, not synchronously: the app's optimistic-write
    // paths assume a real await boundary before state settles.
    return Promise.resolve()
      .then(() => {
        const wrote = this.mode !== 'select'
        const result = this.run() as Result<T>
        // Stand in for the realtime echo a write would produce in Postgres.
        if (wrote) queueMicrotask(emitDemoChange)
        return result
      })
      .then(onfulfilled, onrejected)
  }
}

/**
 * A channel over the in-memory change bus.
 *
 * Orbit's realtime is an invalidation signal, not a data feed — the payload is
 * discarded and the consumer re-fetches — so one "something changed" callback
 * per subscribed table is a faithful stand-in.
 */
class DemoChannel {
  // A Set, not an array: Orbit subscribes six tables with the same callback,
  // and a real change fires for exactly one of them. Deduplicating collapses
  // the six back into the single invalidation the app expects.
  private handlers = new Set<() => void>()
  private unsubscribe: (() => void) | null = null

  on(_event: string, _filter: unknown, handler: () => void) {
    this.handlers.add(handler)
    return this
  }

  subscribe() {
    this.unsubscribe = onDemoChange(() => {
      for (const handler of this.handlers) handler()
    })
    return this
  }

  teardown() {
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}

const demoUser = {
  id: DEMO_OWNER_ID,
  email: DEMO_EMAIL,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { name: 'Demo' },
  created_at: new Date().toISOString(),
}

const demoSession = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: demoUser,
}

export function createDemoClient() {
  return {
    from: (table: string) => new Builder(table),
    channel: () => new DemoChannel(),
    removeChannel: async (channel: DemoChannel) => {
      channel.teardown()
      return 'ok'
    },
    auth: {
      getSession: async () => ({ data: { session: demoSession }, error: null }),
      getUser: async () => ({ data: { user: demoUser }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({
        data: { session: demoSession, user: demoUser },
        error: null,
      }),
      // In demo mode there is no way back in, so "sign out" is repurposed as
      // "start over": the store is re-seeded and the page reloads clean.
      signOut: async () => {
        resetDemoStore()
        // The mirror outlives the in-memory store, so a reset that left it
        // behind would reload into whatever appearance was being tried out
        // rather than the seeded one.
        clearStoredAppearance()
        window.location.reload()
        return { error: null }
      },
    },
  }
}
