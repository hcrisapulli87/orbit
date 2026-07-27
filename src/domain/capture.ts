// Natural-language capture: the single text box that replaces a new-task form.
//
// The vocabulary here is deliberately NARROW. A broad parser (chrono-node and
// friends) will confidently interpret almost anything, and confident breadth is
// the wrong property when the output is a guess shown back to a human. This
// grammar recognises a fixed set of tokens and does nothing else, so its failure
// mode is the good one: unrecognised text stays in the title and the item lands
// in the Inbox undated. Nothing is ever lost — `captureText` keeps the raw input.

import {
  addDays,
  addMonthsClamped,
  compareISO,
  isoOf,
  lastDayOfMonth,
  startOfWeek,
  todayISO,
  weekdayOf,
} from './day'
import type { ISODate, ISOTime } from './day'

export interface KnownNames {
  projects: string[]
  areas: string[]
}

export type RuleType =
  | 'daily'
  | 'weekly'
  | 'monthly_day'
  | 'monthly_last'
  | 'monthly_nth'
  | 'yearly'
  | 'after_completion'

/**
 * A recurrence rule as far as the *words* describe it. month_day, month and the
 * anchor date are filled in from the task's start date by the recurrence engine,
 * not guessed here.
 */
export interface RecurrenceHint {
  rule_type: RuleType
  /** "every N" — 1 unless a number was given. */
  step: number
  /** 0 = Sunday … 6 = Saturday. Empty when the rule isn't weekday-pinned. */
  weekdays: number[]
  /** For monthly_nth: 1–4, or -1 for last. */
  nth: number | null
  after_n: number | null
  after_unit: 'day' | 'week' | 'month' | null
}

export interface CaptureResult {
  /** What's left after every recognised token is stripped out. */
  title: string
  dueOn: ISODate | null
  dueTime: ISOTime | null
  /** Set when the text describes something repeating. */
  recurrence: RecurrenceHint | null
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
 * neighbouring words don't fuse. A handler returning false rejects the match
 * (an impossible date, say) and leaves the text untouched.
 */
function take(state: State, re: RegExp, onMatch: (m: RegExpExecArray) => boolean | void): boolean {
  const m = re.exec(state.text)
  if (!m) return false
  if (onMatch(m) === false) return false
  state.text = `${state.text.slice(0, m.index)} ${state.text.slice(m.index + m[0].length)}`
  return true
}

// ── priority ─────────────────────────────────────────────────────────────────

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

// ── tags and projects ────────────────────────────────────────────────────────

function parseTags(state: State): void {
  while (
    take(state, /(^|\s)#([\p{L}\d][\p{L}\d-]*)(?=\s|$)/u, (m) => {
      const tag = m[2].toLowerCase()
      if (!state.result.tags.includes(tag)) state.result.tags.push(tag)
    })
  ) { /* keep taking */ }
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

// ── dates ────────────────────────────────────────────────────────────────────

// 0 = Sunday … 6 = Saturday, matching weekdayOf().
//
// Spellings are enumerated longest-first rather than matched as `mon[a-z]*`,
// because a loose prefix makes "every month" parse as "every Monday". Only the
// first three letters are significant once a whole token has matched.
const WEEKDAYS =
  'sunday|sun|mondays|monday|mon|tuesdays|tuesday|tues|tue|wednesdays|wednesday|weds|wed|' +
  'thursdays|thursday|thurs|thur|thu|fridays|friday|fri|saturdays|saturday|sat'
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/** Every weekday pattern ends here, so "mon" can't swallow the start of "month". */
const WORD_END = '(?=\\s|$|[,/.])'

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const weekdayFromWord = (word: string): number => WEEKDAY_INDEX[word.slice(0, 3).toLowerCase()]

/** The coming occurrence of a weekday. Today's own weekday means next week. */
function comingWeekday(today: ISODate, weekday: number): { date: ISODate; ambiguous: boolean } {
  const delta = (weekday - weekdayOf(today) + 7) % 7
  return { date: addDays(today, delta === 0 ? 7 : delta), ambiguous: delta === 0 }
}

/** That weekday in the FOLLOWING week, Monday-start. */
function nextWeekWeekday(today: ISODate, weekday: number): ISODate {
  const mondayNext = addDays(startOfWeek(today, 1), 7)
  return addDays(mondayNext, (weekday - 1 + 7) % 7)
}

/** Build a valid ISO day, or null if the parts don't describe a real date. */
function safeDate(year: number, month: number, day: number): ISODate | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > lastDayOfMonth(year, month)) return null
  return isoOf(year, month, day)
}

function parseDate(state: State, today: ISODate): void {
  const set = (date: ISODate) => { state.result.dueOn = date }

  if (take(state, /(^|\s)(today|tod)(?=\s|$)/i, () => set(today))) return
  if (take(state, /(^|\s)(tomorrow|tmr)(?=\s|$)/i, () => set(addDays(today, 1)))) return

  // "tonight" is the one token that carries both a day and a time.
  if (take(state, /(^|\s)tonight(?=\s|$)/i, () => {
    set(today)
    state.result.dueTime = '19:00'
  })) return

  if (take(state, /(^|\s)(eom|end of (the )?month)(?=\s|$)/i, () => {
    const [y, m] = today.split('-').map(Number)
    set(isoOf(y, m, lastDayOfMonth(y, m)))
  })) return

  if (take(state, /(^|\s)next week(?=\s|$)/i, () => set(addDays(startOfWeek(today, 1), 7)))) return
  if (take(state, /(^|\s)next month(?=\s|$)/i, () => set(addMonthsClamped(today, 1)))) return

  if (take(state, new RegExp(`(^|\\s)next\\s+(${WEEKDAYS})${WORD_END}`, 'i'), (m) => {
    set(nextWeekWeekday(today, weekdayFromWord(m[2])))
  })) return

  if (take(state, /(^|\s)in\s+(\d{1,3})\s*(day|week|month)s?(?=\s|$)/i, (m) => {
    const n = Number(m[2])
    const unit = m[3].toLowerCase()
    set(unit === 'day' ? addDays(today, n)
      : unit === 'week' ? addDays(today, n * 7)
      : addMonthsClamped(today, n))
  })) return

  // Numeric, Australian day-first order.
  if (take(state, /(^|\s)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/, (m) => {
    const day = Number(m[2])
    const month = Number(m[3])
    const rawYear = m[4]
    const [thisYear] = today.split('-').map(Number)

    if (rawYear) {
      const year = rawYear.length <= 2 ? 2000 + Number(rawYear) : Number(rawYear)
      const date = safeDate(year, month, day)
      if (!date) return false
      set(date)
      return
    }

    const date = safeDate(thisYear, month, day)
    if (!date) return false
    // A bare day/month already past this year means the coming one.
    set(compareISO(date, today) < 0 ? (safeDate(thisYear + 1, month, day) ?? date) : date)
    // Both halves could be a month, so DD/MM vs MM/DD is genuinely undecidable.
    // We commit to the Australian reading and say out loud that it's a guess.
    if (day <= 12 && month <= 12) state.result.confidence = 'low'
  })) return

  // "14 aug", "14 august 2028"
  if (take(state, new RegExp(`(^|\\s)(\\d{1,2})\\s+(${MONTHS})[a-z]*(?:\\s+(\\d{4}))?(?=\\s|$)`, 'i'), (m) =>
    setMonthName(state, today, Number(m[2]), m[3], m[4], set),
  )) return

  // "aug 14", "august 14 2028"
  if (take(state, new RegExp(`(^|\\s)(${MONTHS})[a-z]*\\s+(\\d{1,2})(?:\\s+(\\d{4}))?(?=\\s|$)`, 'i'), (m) =>
    setMonthName(state, today, Number(m[3]), m[2], m[4], set),
  )) return

  // Bare weekday, last so "next fri" and "every fri" get first refusal.
  take(state, new RegExp(`(^|\\s)(this\\s+)?(${WEEKDAYS})${WORD_END}`, 'i'), (m) => {
    const { date, ambiguous } = comingWeekday(today, weekdayFromWord(m[3]))
    set(date)
    // "monday" said on a Monday: this one, or next week's? Undecidable.
    if (ambiguous && !m[2]) state.result.confidence = 'low'
  })
}

function setMonthName(
  _state: State,
  today: ISODate,
  day: number,
  monthWord: string,
  yearWord: string | undefined,
  set: (d: ISODate) => void,
): boolean | void {
  const month = MONTH_INDEX[monthWord.slice(0, 3).toLowerCase()]
  const [thisYear] = today.split('-').map(Number)

  if (yearWord) {
    const date = safeDate(Number(yearWord), month, day)
    if (!date) return false
    set(date)
    return
  }

  const date = safeDate(thisYear, month, day)
  if (!date) return false
  set(compareISO(date, today) < 0 ? (safeDate(thisYear + 1, month, day) ?? date) : date)
}

// ── recurrence ───────────────────────────────────────────────────────────────

/** A weekday list: "mon, wed, fri", "mon/wed/fri", "mon and fri". */
const WEEKDAY_LIST = `(?:${WEEKDAYS})(?:\\s*(?:,|/|&|and)\\s*(?:${WEEKDAYS}))*`

const ORDINALS: Record<string, number> = {
  '1': 1, first: 1, '2': 2, second: 2, '3': 3, third: 3, '4': 4, fourth: 4, last: -1,
}

function weekdaysFromList(list: string): number[] {
  const found = list.toLowerCase().match(new RegExp(WEEKDAYS, 'gi')) ?? []
  const out: number[] = []
  for (const word of found) {
    const n = weekdayFromWord(word)
    if (!out.includes(n)) out.push(n)
  }
  return out.sort((a, b) => a - b)
}

/**
 * Recurrence runs BEFORE date parsing, so "every tue" is read as a rule rather
 * than as this coming Tuesday. The parser never computes the first occurrence —
 * that is the recurrence engine's job, from the series anchor.
 */
function parseRecurrence(state: State): void {
  const set = (r: RecurrenceHint) => { state.result.recurrence = r }
  const base = { step: 1, weekdays: [] as number[], nth: null, after_n: null, after_unit: null }

  // Interval measured from when it was last DONE, not from a calendar date.
  if (take(state, /(^|\s)(every\s+)?(\d{1,3})\s*(day|week|month)s?\s+after\s+(done|completion|completing)(?=\s|$)/i, (m) => {
    set({
      ...base,
      rule_type: 'after_completion',
      after_n: Number(m[3]),
      after_unit: m[4].toLowerCase() as 'day' | 'week' | 'month',
    })
  })) return

  if (take(state, /(^|\s)(on the\s+)?last day of (the\s+)?month(?=\s|$)/i, () => {
    set({ ...base, rule_type: 'monthly_last' })
  })) return

  if (take(state, new RegExp(
    `(^|\\s)(?:every\\s+|on the\\s+)?(1st|2nd|3rd|4th|first|second|third|fourth|last)\\s+(${WEEKDAYS})\\s+of (?:the\\s+|every\\s+)?month${WORD_END}`,
    'i',
  ), (m) => {
    set({
      ...base,
      rule_type: 'monthly_nth',
      // Strip the suffix only from digit forms — "last" also ends in "st".
      nth: ORDINALS[m[2].toLowerCase().replace(/^(\d)(st|nd|rd|th)$/, '$1')],
      weekdays: [weekdayFromWord(m[3])],
    })
  })) return

  if (take(state, /(^|\s)every\s+weekdays?(?=\s|$)/i, () => {
    set({ ...base, rule_type: 'weekly', weekdays: [1, 2, 3, 4, 5] })
  })) return

  // "every 2 weeks on tue" — interval and anchor weekday together.
  if (take(state, new RegExp(`(^|\\s)every\\s+(\\d{1,2})\\s*weeks?\\s+on\\s+(${WEEKDAY_LIST})${WORD_END}`, 'i'), (m) => {
    set({ ...base, rule_type: 'weekly', step: Number(m[2]), weekdays: weekdaysFromList(m[3]) })
  })) return

  if (take(state, new RegExp(`(^|\\s)every\\s+(${WEEKDAY_LIST})${WORD_END}`, 'i'), (m) => {
    set({ ...base, rule_type: 'weekly', weekdays: weekdaysFromList(m[2]) })
  })) return

  if (take(state, /(^|\s)every\s+(\d{1,3})\s*(day|week|month|year)s?(?=\s|$)/i, (m) => {
    const step = Number(m[2])
    const unit = m[3].toLowerCase()
    set({
      ...base,
      step,
      rule_type: unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : unit === 'month' ? 'monthly_day' : 'yearly',
    })
  })) return

  take(state, /(^|\s)(every\s+(day|week|month|year)|daily|weekly|fortnightly|monthly|yearly|annually)(?=\s|$)/i, (m) => {
    const word = (m[3] ?? m[2]).toLowerCase()
    if (word === 'day' || word === 'daily') return set({ ...base, rule_type: 'daily' })
    if (word === 'week' || word === 'weekly') return set({ ...base, rule_type: 'weekly' })
    if (word === 'fortnightly') return set({ ...base, rule_type: 'weekly', step: 2 })
    if (word === 'month' || word === 'monthly') return set({ ...base, rule_type: 'monthly_day' })
    return set({ ...base, rule_type: 'yearly' })
  })
}

// ── times ────────────────────────────────────────────────────────────────────

const hhmm = (h: number, m: number): ISOTime =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

function parseTime(state: State): void {
  const set = (t: ISOTime) => { state.result.dueTime = t }

  if (take(state, /(^|\s)(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s|$)/i, (m) => {
    let h = Number(m[2])
    if (h > 12) return false
    const min = Number(m[3] ?? 0)
    const pm = m[4].toLowerCase() === 'pm'
    if (h === 12) h = 0
    set(hhmm(pm ? h + 12 : h, min))
  })) return

  if (take(state, /(^|\s)([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/, (m) => {
    set(hhmm(Number(m[2]), Number(m[3])))
  })) return

  // "at 3" — daytime bias: 1–7 reads as afternoon, 8–12 as morning.
  if (take(state, /(^|\s)at\s+(\d{1,2})(?::([0-5]\d))?(?=\s|$)/i, (m) => {
    const raw = Number(m[2])
    if (raw > 23) return false
    const h = raw >= 1 && raw <= 7 ? raw + 12 : raw
    set(hhmm(h, Number(m[3] ?? 0)))
  })) return

  take(state, /(^|\s)(noon|midday|midnight|morning|afternoon|evening)(?=\s|$)/i, (m) => {
    const word = m[2].toLowerCase()
    set(
      word === 'midnight' ? '00:00'
      : word === 'morning' ? '09:00'
      : word === 'afternoon' ? '14:00'
      : word === 'evening' ? '18:00'
      : '12:00',
    )
  })
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Parse a captured line. `now` is a parameter so tests never mock a clock;
 * `known` lets @words resolve against the user's actual projects and areas.
 */
export function parseCapture(
  text: string,
  now: Date = new Date(),
  known: KnownNames = { projects: [], areas: [] },
): CaptureResult {
  const today = todayISO(now)
  const state: State = {
    text,
    result: {
      title: '',
      dueOn: null,
      dueTime: null,
      recurrence: null,
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
  // Recurrence before dates: "every tue" is a rule, not this coming Tuesday.
  parseRecurrence(state)
  parseDate(state, today)
  parseTime(state)

  // A time on its own means today — "call bank 3pm" is about this afternoon.
  if (state.result.dueTime && !state.result.dueOn) state.result.dueOn = today

  // A day we are only guessing at must never sharpen into a specific time.
  if (state.result.confidence === 'low') state.result.dueTime = null

  state.result.title = state.text.replace(/\s+/g, ' ').trim()
  return state.result
}
