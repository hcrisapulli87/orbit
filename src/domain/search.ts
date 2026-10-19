// Finding a task again.
//
// Deliberately in memory: the working set (everything open, plus the last month
// of completions) is already loaded for Today, and a search box that answers on
// every keystroke beats one that waits on a round trip. Older history lives on
// the Logbook, which pages it in from the server.

import { compareISO } from './day'

/** The fields search reads. A stored Task satisfies it. */
export interface Searchable {
  id: string
  title: string
  notes: string
  tags: string[]
  status: 'open' | 'done' | 'dropped'
  due_on: string | null
  completed_on: string | null
  project_id: string | null
  series_id: string | null
}

/**
 * Lower-case and strip accents, so `cafe` finds "Café" and `Ä` finds "a". The
 * same fold is applied to both sides, which is all a match needs.
 */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Whitespace-separated, folded, duplicates removed. */
export function tokens(query: string): string[] {
  return [...new Set(normalise(query).split(/\s+/).filter(Boolean))]
}

/**
 * One row per repeating thing.
 *
 * A daily habit is sixty materialised occurrences ahead and thirty completed
 * ones behind; searching "stretch" should find the habit, not ninety copies of
 * it. The row kept is the next open occurrence, or the most recent completed
 * one when nothing is open — the one you'd want to tap on.
 */
export function collapseSeries<T extends Searchable>(tasks: T[]): T[] {
  const best = new Map<string, T>()
  const out: T[] = []

  const better = (a: T, b: T): boolean => {
    if (a.status === 'open' && b.status !== 'open') return true
    if (a.status !== 'open' && b.status === 'open') return false
    if (a.status === 'open') return compareISO(a.due_on ?? '9999-12-31', b.due_on ?? '9999-12-31') < 0
    return compareISO(a.completed_on ?? '', b.completed_on ?? '') > 0
  }

  for (const t of tasks) {
    if (t.series_id === null) {
      out.push(t)
      continue
    }
    const held = best.get(t.series_id)
    if (!held || better(t, held)) best.set(t.series_id, t)
  }
  return [...out, ...best.values()]
}

// Weights. Tiered so the order is explainable: a hit at the start of a word in
// the title outranks a hit buried in the notes, whatever the notes say.
const TITLE_WORD_START = 30
const TITLE_ANYWHERE = 15
const TAG = 12
const PROJECT = 8
const NOTES = 4
const TITLE_PREFIX = 40
const OPEN = 20

function wordStart(haystack: string, needle: string): boolean {
  return haystack.startsWith(needle) || haystack.includes(` ${needle}`)
}

/**
 * Score one task against the query's tokens. Every token must land somewhere —
 * `rego car` means both — so a miss on any of them returns null.
 */
function score(task: Searchable, words: string[], whole: string, project: string): number | null {
  const title = normalise(task.title)
  const notes = normalise(task.notes)
  const tags = task.tags.map(normalise)

  let total = 0
  for (const w of words) {
    if (wordStart(title, w)) total += TITLE_WORD_START
    else if (title.includes(w)) total += TITLE_ANYWHERE
    else if (tags.some((tag) => tag.startsWith(w.replace(/^#/, '')))) total += TAG
    else if (project.includes(w)) total += PROJECT
    else if (notes.includes(w)) total += NOTES
    else return null
  }
  if (title.startsWith(whole)) total += TITLE_PREFIX
  if (task.status === 'open') total += OPEN
  return total
}

/**
 * Tasks matching every word of the query, best first.
 *
 * Dropped tasks are left out — dropping is how you say a thing no longer
 * exists. Ties go to whatever is due soonest, then to the most recently done.
 */
export function searchTasks<T extends Searchable>(
  query: string,
  tasks: T[],
  projectNames: Map<string, string> = new Map(),
): T[] {
  const words = tokens(query)
  if (words.length === 0) return []
  const whole = words.join(' ')

  const scored: { task: T; score: number }[] = []
  for (const task of collapseSeries(tasks.filter((t) => t.status !== 'dropped'))) {
    const project = normalise(task.project_id ? projectNames.get(task.project_id) ?? '' : '')
    const s = score(task, words, whole, project)
    if (s !== null) scored.push({ task, score: s })
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const due = compareISO(a.task.due_on ?? '9999-12-31', b.task.due_on ?? '9999-12-31')
      if (due !== 0) return due
      return compareISO(b.task.completed_on ?? '', a.task.completed_on ?? '')
    })
    .map((s) => s.task)
}

/** Lists and projects whose name contains every word. */
export function searchNamed<T extends { name: string }>(query: string, items: T[]): T[] {
  const words = tokens(query)
  if (words.length === 0) return []
  return items.filter((item) => {
    const name = normalise(item.name)
    return words.every((w) => name.includes(w))
  })
}
