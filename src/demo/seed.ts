// The fake dataset behind demo mode.
//
// Two rules shaped it:
//
//   1. Everything is relative to today, so the demo never rots. Run it in six
//      months and it is still a plausible Tuesday.
//   2. Every screen has to have something worth looking at. An overdue item, an
//      over-committed day, a project mid-flight, a habit with a broken streak
//      and a low-confidence parse are all here on purpose — an empty-ish app
//      makes a design review about empty states rather than about the app.
//
// The recurring series are NOT hand-listed as occurrences. They are seeded as
// rules, and the app's own engine materialises them on load — so the demo
// exercises the real code path rather than a hand-drawn picture of it.

import { addDays, isoOf, todayISO } from '../domain/day'
import { occurrencesBetween } from '../domain/recurrence'
import type { Rule } from '../domain/recurrence'
import { DEFAULT_SETTINGS } from '../data/settings'
import type { Row, Tables } from './store'
import { DEMO_OWNER_ID } from './identity'

const owner = DEMO_OWNER_ID

/**
 * Deterministic pseudo-randomness. The demo must look the same every reload —
 * a habit grid that reshuffles itself between two screenshots is a bug report
 * waiting to happen.
 */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

// The seven areas and the two seeded lists are copied from supabase/schema.sql
// verbatim, icons and colours included — a demo that invents its own taxonomy
// would have a design review reasoning about a hierarchy nobody actually has.
interface AreaSpec { id: string; name: string; icon: string; colour: string }
const AREAS: AreaSpec[] = [
  { id: 'area-work', name: 'Work', icon: '💼', colour: '#7dd3fc' },
  { id: 'area-home', name: 'Home', icon: '🏠', colour: '#ffb454' },
  { id: 'area-car', name: 'Car', icon: '🚗', colour: '#f9a8d4' },
  { id: 'area-health', name: 'Health', icon: '🩺', colour: '#4bd08a' },
  { id: 'area-money', name: 'Money', icon: '💰', colour: '#fbbf24' },
  { id: 'area-personal', name: 'Personal', icon: '🌱', colour: '#a78bfa' },
  { id: 'area-dates', name: 'Dates', icon: '🎂', colour: '#fca5a5' },
]

/**
 * Every project gets an area on purpose: the Lists screen groups strictly by
 * area, so an unfiled project has nowhere to render.
 */
interface ProjectSpec {
  id: string; name: string; icon: string; kind: 'project' | 'list'; area_id: string
}
const PROJECTS: ProjectSpec[] = [
  { id: 'proj-groceries', name: 'Groceries', icon: '🧺', kind: 'list', area_id: 'area-home' },
  { id: 'proj-wishlist', name: 'Wishlist', icon: '🎁', kind: 'list', area_id: 'area-personal' },
  { id: 'proj-splashback', name: 'Kitchen splashback', icon: '🔨', kind: 'project', area_id: 'area-home' },
  { id: 'proj-japan', name: 'Japan trip', icon: '✈️', kind: 'project', area_id: 'area-personal' },
  { id: 'proj-tax', name: 'Tax return', icon: '🧾', kind: 'project', area_id: 'area-money' },
]

/** A task, with `due_on` given as an offset in days from today. */
interface TaskSpec extends Row {
  id: string
  title: string
  due?: number | null
}

function taskRows(today: string): Row[] {
  const day = (offset: number) => addDays(today, offset)

  const specs: TaskSpec[] = [
    // ── Overdue ──────────────────────────────────────────────────────────────
    {
      id: 'task-plumber', title: 'Call the plumber back about the leak',
      due: -4, priority: 2, area_id: 'area-home', estimate_min: 15,
    },
    {
      id: 'task-rebate', title: 'Chase the Medicare rebate',
      due: -1, priority: 1, area_id: 'area-money', estimate_min: 20,
    },

    // ── Today ────────────────────────────────────────────────────────────────
    {
      id: 'task-numbers', title: 'Send the quarterly numbers to Dan',
      due: 0, due_time: '11:00', priority: 2, area_id: 'area-work', estimate_min: 45,
    },
    {
      id: 'task-parcel', title: 'Pick up the parcel from the post office',
      due: 0, due_time: '17:15', area_id: 'area-home', estimate_min: 20,
    },
    {
      id: 'task-measure', title: 'Write up the splashback measurements',
      due: 0, project_id: 'proj-splashback', estimate_min: 30,
    },
    {
      id: 'task-invoice', title: 'Invoice the Marchetti job',
      due: 0, priority: 1, area_id: 'area-work', estimate_min: 25,
    },
    {
      id: 'task-dentist', title: 'Book the dentist',
      due: 0, status: 'done', completed_on: today, completed_at: ago(0),
      area_id: 'area-health', estimate_min: 10,
    },

    // ── Tomorrow, captured in one line ───────────────────────────────────────
    {
      id: 'task-rego', title: 'Pay rego', due: 1, due_time: '15:00', priority: 2,
      area_id: 'area-car', source: 'capture', capture_text: 'pay rego fri 3pm !high @car',
      parse_confidence: 'high', estimate_min: 15,
    },

    // ── The low-confidence parse: 3/8 is ambiguous, so no time was invented ──
    {
      id: 'task-mechanic', title: 'Ring the mechanic', due: 9,
      area_id: 'area-car', source: 'capture', capture_text: 'ring the mechanic 3/8',
      parse_confidence: 'low',
    },

    // ── The rest of the week ─────────────────────────────────────────────────
    { id: 'task-tiles', title: 'Order the tiles', due: 2, project_id: 'proj-splashback', estimate_min: 20 },
    { id: 'task-photos', title: 'Get passport photos done', due: 4, project_id: 'proj-japan', estimate_min: 30 },
    { id: 'task-lightbulbs', title: 'Replace the hallway downlights', due: 5, area_id: 'area-home', estimate_min: 40 },
    { id: 'task-review', title: 'Write Priya’s review', due: 6, priority: 1, area_id: 'area-work', estimate_min: 60 },

    // ── Inbox: open, undated, unfiled. The absence of triage, not a flag. ────
    { id: 'task-inbox-phone', title: 'Look into a cheaper phone plan', source: 'capture', capture_text: 'look into a cheaper phone plan' },
    { id: 'task-inbox-podcast', title: 'That podcast Sam mentioned', source: 'capture' },
    { id: 'task-inbox-gate', title: 'Fix the squeaky side gate' },
    {
      id: 'task-inbox-insurance', title: 'Compare car insurance before renewal',
      source: 'capture', notes: 'https://www.choice.com.au/car-insurance',
    },

    // ── Kitchen splashback: a project mid-flight, with subtasks ──────────────
    { id: 'task-sb-1', title: 'Measure the wall', project_id: 'proj-splashback', status: 'done', completed_on: addDays(today, -6), completed_at: ago(6), sort_order: 0 },
    { id: 'task-sb-2', title: 'Get three quotes', project_id: 'proj-splashback', sort_order: 1 },
    { id: 'task-sb-2a', title: 'Quote — Baxter Tiling', project_id: 'proj-splashback', parent_id: 'task-sb-2', status: 'done', completed_on: addDays(today, -3), completed_at: ago(3), sort_order: 0 },
    { id: 'task-sb-2b', title: 'Quote — Northside Kitchens', project_id: 'proj-splashback', parent_id: 'task-sb-2', sort_order: 1 },
    { id: 'task-sb-2c', title: 'Quote — TileCo', project_id: 'proj-splashback', parent_id: 'task-sb-2', sort_order: 2 },
    { id: 'task-sb-3', title: 'Pick a grout colour', project_id: 'proj-splashback', sort_order: 2 },
    { id: 'task-sb-4', title: 'Book the installer', project_id: 'proj-splashback', due: 14, sort_order: 3 },

    // ── Japan trip ───────────────────────────────────────────────────────────
    { id: 'task-jp-1', title: 'Book flights', project_id: 'proj-japan', status: 'done', completed_on: addDays(today, -11), completed_at: ago(11), sort_order: 0 },
    { id: 'task-jp-2', title: 'Renew passport', project_id: 'proj-japan', due: 20, priority: 2, sort_order: 1 },
    { id: 'task-jp-3', title: 'Sort the JR pass', project_id: 'proj-japan', sort_order: 2 },
    { id: 'task-jp-4', title: 'Book two nights in Kanazawa', project_id: 'proj-japan', sort_order: 3 },

    // ── Tax return ───────────────────────────────────────────────────────────
    { id: 'task-tax-1', title: 'Gather the receipts', project_id: 'proj-tax', sort_order: 0 },
    { id: 'task-tax-2', title: 'Download the bank summaries', project_id: 'proj-tax', sort_order: 1 },
    { id: 'task-tax-3', title: 'Book the accountant', project_id: 'proj-tax', due: 25, sort_order: 2 },

    // ── Lists ────────────────────────────────────────────────────────────────
    { id: 'task-g-1', title: 'Milk', project_id: 'proj-groceries', sort_order: 0 },
    { id: 'task-g-2', title: 'Sourdough', project_id: 'proj-groceries', sort_order: 1 },
    { id: 'task-g-3', title: 'Coffee beans', project_id: 'proj-groceries', sort_order: 2 },
    { id: 'task-g-4', title: 'Chicken thighs', project_id: 'proj-groceries', sort_order: 3 },
    { id: 'task-g-5', title: 'Dishwasher tablets', project_id: 'proj-groceries', status: 'done', completed_on: today, completed_at: ago(0), sort_order: 4 },
    { id: 'task-w-1', title: 'Merino jumper', project_id: 'proj-wishlist', sort_order: 0 },
    { id: 'task-w-2', title: 'Nanoblock Charizard', project_id: 'proj-wishlist', sort_order: 1 },
  ]

  return specs.map(({ due, ...rest }) => ({
    owner_id: owner,
    notes: '',
    project_id: null,
    area_id: null,
    parent_id: null,
    kind: 'task',
    status: 'open',
    priority: 0,
    due_on: due === undefined || due === null ? null : day(due),
    due_time: null,
    starts_on: null,
    estimate_min: null,
    tags: [],
    source: 'app',
    capture_text: null,
    parse_confidence: null,
    completed_at: null,
    completed_on: null,
    sort_order: 0,
    series_id: null,
    occurrence_key: null,
    created_at: ago(30),
    ...rest,
  }))
}

interface SeriesSpec extends Row { id: string; title: string }

function seriesRows(today: string): Row[] {
  const specs: SeriesSpec[] = [
    {
      id: 'ser-stretch', title: 'Stretch for ten minutes', kind: 'habit', area_id: 'area-health',
      rule_type: 'daily', step: 1, anchor_on: addDays(today, -80), estimate_min: 10,
      due_time: '07:00',
    },
    {
      id: 'ser-gym', title: 'Gym', kind: 'habit', area_id: 'area-health',
      rule_type: 'weekly', step: 1, weekdays: [1, 3, 5], anchor_on: addDays(today, -80),
      estimate_min: 60, due_time: '06:30',
    },
    {
      id: 'ser-bins', title: 'Put the bins out', kind: 'task', area_id: 'area-home',
      rule_type: 'weekly', step: 1, weekdays: [2], anchor_on: addDays(today, -80),
      estimate_min: 5, due_time: '19:30',
    },
    {
      id: 'ser-retro', title: 'Team retro', kind: 'task', area_id: 'area-work',
      rule_type: 'monthly_nth', step: 1, weekdays: [2], nth: 2,
      anchor_on: addDays(today, -120), estimate_min: 60, due_time: '10:00',
    },
    {
      id: 'ser-card', title: 'Pay the credit card', kind: 'task', area_id: 'area-money',
      rule_type: 'monthly_last', step: 1, anchor_on: addDays(today, -120), priority: 2,
      estimate_min: 10,
    },
    {
      id: 'ser-birthday', title: 'Mum’s birthday', kind: 'event', area_id: 'area-dates',
      rule_type: 'yearly', step: 1, month: 9, month_day: 14,
      anchor_on: isoOf(Number(today.slice(0, 4)) - 2, 9, 14), lead_days: 7,
    },
    {
      id: 'ser-service', title: 'Car service', kind: 'task', area_id: 'area-car',
      rule_type: 'after_completion', step: 1, after_n: 6, after_unit: 'month',
      anchor_on: addDays(today, 23), estimate_min: 30,
    },
  ]

  return specs.map((s) => ({
    owner_id: owner,
    notes: '',
    project_id: null,
    area_id: null,
    kind: 'task',
    priority: 0,
    tags: [],
    estimate_min: null,
    due_time: null,
    step: 1,
    weekdays: [],
    month_day: null,
    nth: null,
    month: null,
    after_n: null,
    after_unit: null,
    until_on: null,
    lead_days: 0,
    active: true,
    created_at: ago(80),
    ...s,
  }))
}

const ruleOf = (s: Row): Rule => ({
  rule_type: s.rule_type as Rule['rule_type'],
  step: s.step as number,
  weekdays: s.weekdays as number[],
  month_day: s.month_day as number | null,
  nth: s.nth as number | null,
  month: s.month as number | null,
  after_n: s.after_n as number | null,
  after_unit: s.after_unit as Rule['after_unit'],
  anchor_on: s.anchor_on as string,
  until_on: s.until_on as string | null,
})

/**
 * Backfill the last 45 days of habit occurrences so the streak grids have a
 * history rather than opening empty.
 *
 * The subtlety: `ensureOccurrences` looks 30 days BACK as well as forward, to
 * recreate days missed while the app was closed. Left alone it would fill a
 * fresh demo with a month of overdue gym sessions. Seeding the past explicitly
 * means those keys already exist, so the engine only fills the future.
 *
 * A missed day is stored as `dropped` rather than left open, with `completed_on`
 * set to the day it lapsed. That keeps it inside the working-set query (so the
 * engine still sees the key and doesn't recreate it) while keeping it out of
 * Today and the calendar, which both filter on `status === 'open'`.
 */
function backfill(series: Row[], today: string): Row[] {
  const out: Row[] = []

  for (const [index, s] of series.entries()) {
    if (s.kind === 'event' || s.rule_type === 'after_completion') continue
    const dates = occurrencesBetween(ruleOf(s), addDays(today, -60), addDays(today, -1))
    // Seeded per series so one series' misses can't shuffle another's.
    const random = rng(20260727 + index * 977)

    for (const [i, date] of dates.entries()) {
      // About one in ten slips — a perfect grid reads as fake — but the last
      // two are always kept, so every habit opens on a live streak rather than
      // on the one thing a streak UI can't show off.
      const missed = i < dates.length - 2 && random() < 0.1
      out.push({
        id: `occ-${s.id}-${date}`,
        owner_id: owner,
        series_id: s.id,
        occurrence_key: date,
        due_on: date,
        due_time: s.due_time,
        title: s.title,
        notes: '',
        project_id: s.project_id,
        area_id: s.area_id,
        parent_id: null,
        kind: s.kind,
        status: missed ? 'dropped' : 'done',
        priority: s.priority,
        tags: [],
        estimate_min: s.estimate_min,
        starts_on: null,
        source: 'recurrence',
        capture_text: null,
        parse_confidence: null,
        completed_at: `${date}T08:00:00.000Z`,
        completed_on: date,
        sort_order: 0,
        created_at: `${date}T00:00:00.000Z`,
      })
    }
  }

  return out
}

function blockRows(today: string): Row[] {
  const rows: [string, string, string, string][] = [
    [today, '09:00', '10:30', 'Deep work'],
    [today, '12:30', '13:00', 'Lunch'],
    [today, '18:00', '19:00', 'Dinner + bath time'],
    [addDays(today, 1), '09:30', '10:00', 'Site call'],
    [addDays(today, 1), '13:00', '14:30', 'Deep work'],
  ]
  return rows.map(([on_date, start_time, end_time, label], i) => ({
    id: `block-${i}`,
    owner_id: owner,
    on_date,
    start_time,
    end_time,
    task_id: null,
    label,
    source: 'manual',
    all_day: false,
    created_at: ago(1),
  }))
}

function templateRows(): { templates: Row[]; items: Row[] } {
  const templates: Row[] = [
    {
      id: 'tpl-weekend', owner_id: owner, name: 'Weekend away', icon: '🧳',
      area_id: null, creates: 'project', use_count: 3, created_at: ago(140),
    },
    {
      id: 'tpl-service', owner_id: owner, name: 'Car service run', icon: '🚗',
      area_id: 'area-car', creates: 'tasks', use_count: 1, created_at: ago(60),
    },
  ]

  // [template_id, title, sort_order, offset_days, parent_index]
  const items: Row[] = [
    ['tpl-weekend', 'Book somewhere to stay', 0, -21, null],
    ['tpl-weekend', 'Ask about the dog', 1, -14, null],
    ['tpl-weekend', 'Fill up the car', 2, -1, null],
    ['tpl-weekend', 'Pack', 3, -1, null],
    ['tpl-weekend', 'Charge the camera', 4, -1, 3],
    ['tpl-weekend', 'Set the timer lights', 5, 0, null],
    ['tpl-service', 'Book the service', 0, -7, null],
    ['tpl-service', 'Clear the boot out', 1, -1, null],
    ['tpl-service', 'Drop the car off', 2, 0, null],
    ['tpl-service', 'Pick the car up', 3, 0, null],
  ].map(([template_id, title, sort_order, offset_days, parent_index], i) => ({
    id: `tpli-${i}`,
    owner_id: owner,
    template_id,
    title,
    notes: '',
    sort_order,
    parent_index,
    offset_days,
    priority: 0,
    estimate_min: null,
    tags: [],
  }))

  return { templates, items }
}

/** The whole demo database, built fresh for a given "today". */
export function buildSeed(today = todayISO()): Tables {
  const series = seriesRows(today)
  const { templates, items } = templateRows()

  return {
    task_areas: AREAS.map((a, i) => ({
      ...a, owner_id: owner, sort_order: i, is_archived: false, created_at: ago(200),
    })),
    task_projects: PROJECTS.map((p, i) => ({
      ...p, owner_id: owner, colour: '#ffb454', sort_order: i, is_archived: false,
      created_at: ago(120),
    })),
    task_tasks: [...taskRows(today), ...backfill(series, today)],
    task_series: series,
    task_blocks: blockRows(today),
    task_templates: templates,
    task_template_items: items,
    task_settings: [{
      id: 'settings-demo',
      owner_id: owner,
      ...DEFAULT_SETTINGS,
      // Deliberately not the defaults. A demo that opens on Halo · Indigo ·
      // dark looks like an app with one appearance; opening on Terrain ·
      // Lagoon shows the picker is real, and makes switching back to Halo the
      // obvious first thing to try. "Reset the demo data" restores this, and
      // the localStorage mirror is cleared with it.
      ui_theme: 'terrain',
      ui_palette: 'lagoon',
      ui_mode: 'dark',
      created_at: ago(200),
    }],
    task_push_subscriptions: [],
  }
}
