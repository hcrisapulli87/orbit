// Natural-language capture: the single text box that replaces a new-task form.
//
// The vocabulary here is deliberately NARROW. A broad parser (chrono-node and
// friends) will confidently interpret almost anything, and confident breadth is
// the wrong property when the output is a guess shown back to a human. This
// grammar recognises a fixed set of tokens and does nothing else, so its failure
// mode is the good one: unrecognised text stays in the title and the item lands
// in the Inbox undated. Nothing is ever lost — `captureText` keeps the raw input.

export interface KnownNames {
  projects: string[]
  areas: string[]
}

export interface CaptureResult {
  /** What's left after every recognised token is stripped out. */
  title: string
  /** Priority 0–3, 3 highest. */
  priority: number
  /** Resolved project name, or null. */
  projectHint: string | null
  /** Resolved area name, or null. */
  areaHint: string | null
  tags: string[]
  /** How much to trust the parse. 'low' is rendered as a visible guess. */
  confidence: 'high' | 'low'
  /** The raw input, always retained. */
  captureText: string
}

interface State {
  text: string
  result: CaptureResult
}

/**
 * Cut the matched span out of the working text, leaving a space behind so
 * neighbouring words don't fuse. Returns false when the pattern isn't present.
 */
function take(state: State, re: RegExp, onMatch: (m: RegExpExecArray) => void): boolean {
  const m = re.exec(state.text)
  if (!m) return false
  onMatch(m)
  state.text = `${state.text.slice(0, m.index)} ${state.text.slice(m.index + m[0].length)}`
  return true
}

const PRIORITY_WORDS: Record<string, number> = {
  high: 3, p1: 3,
  med: 2, medium: 2, p2: 2,
  low: 1, p3: 1,
}

function parsePriority(state: State): void {
  // Bare !! first, so it isn't left behind by the word form's pattern.
  if (take(state, /(^|\s)!!(?=\s|$)/, () => { state.result.priority = 3 })) return
  take(state, /(^|\s)!(high|medium|med|low|p[123])(?=\s|$)/i, (m) => {
    state.result.priority = PRIORITY_WORDS[m[2].toLowerCase()]
  })
}

function parseTags(state: State): void {
  const tags: string[] = []
  while (
    take(state, /(^|\s)#([\p{L}\d][\p{L}\d-]*)(?=\s|$)/u, (m) => {
      const tag = m[2].toLowerCase()
      if (!tags.includes(tag)) tags.push(tag)
    })
  ) { /* keep taking */ }
  state.result.tags.push(...tags)
}

/**
 * Resolve an @word against the names we know: exact, then prefix, then first
 * word of a multi-word name. Projects win over areas. Anything unrecognised
 * becomes a tag rather than being dropped.
 */
function resolveName(word: string, names: string[]): string | null {
  const needle = word.toLowerCase()
  return (
    names.find((n) => n.toLowerCase() === needle) ??
    names.find((n) => n.toLowerCase().startsWith(needle)) ??
    names.find((n) => n.toLowerCase().split(/\s+/)[0] === needle) ??
    null
  )
}

function parseProjects(state: State, known: KnownNames): void {
  const extras: string[] = []
  let claimed = false

  // The leading (^|\s) is what keeps sam@example.com out of this.
  while (
    take(state, /(^|\s)@([\p{L}\d][\p{L}\d-]*)(?=\s|$)/u, (m) => {
      const word = m[2]
      if (claimed) {
        extras.push(word.toLowerCase())
        return
      }
      const project = resolveName(word, known.projects)
      if (project) {
        state.result.projectHint = project
        claimed = true
        return
      }
      const area = resolveName(word, known.areas)
      if (area) {
        state.result.areaHint = area
        claimed = true
        return
      }
      extras.push(word.toLowerCase())
    })
  ) { /* keep taking */ }

  for (const tag of extras) {
    if (!state.result.tags.includes(tag)) state.result.tags.push(tag)
  }
}

/**
 * Parse a captured line. `now` is a parameter so tests never mock a clock;
 * `known` lets @words resolve against the user's actual projects and areas.
 */
export function parseCapture(
  text: string,
  _now: Date = new Date(),
  known: KnownNames = { projects: [], areas: [] },
): CaptureResult {
  const state: State = {
    text,
    result: {
      title: '',
      priority: 0,
      projectHint: null,
      areaHint: null,
      tags: [],
      confidence: 'high',
      captureText: text,
    },
  }

  parsePriority(state)
  parseProjects(state, known)
  parseTags(state)

  state.result.title = state.text.replace(/\s+/g, ' ').trim()
  return state.result
}
