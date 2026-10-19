import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../domain/day'
import { createArea, fetchAreas, updateArea } from './areas'
import { archiveProject, createProject, fetchProjects, updateProject } from './projects'
import {
  createTask, deleteTask, fetchTasks, restoreTasks, setTaskDone, updateTask, updateTasks,
} from './tasks'
import {
  adoptAsFirstOccurrence, advanceAfterCompletion, createSeries, deleteSeries, ensureOccurrences,
  fetchSeries, propagateToFuture, pruneStaleOccurrences, retractAfterCompletion, ruleOf, updateSeries,
} from './series'
import { nextAfterCompletion } from '../domain/recurrence'
import { DEFAULT_SETTINGS, fetchSettings, updateSettings } from './settings'
import {
  clearPlannerBlocks, createBlock, deleteBlock, fetchBlocks, replacePlannerBlocks, restoreBlocks,
  updateBlock,
} from './blocks'
import { fetchTemplateItems, fetchTemplates } from './templates'
import {
  createCalendar, deleteCalendar, fetchCalendars, restoreCalendar, updateCalendar,
} from './calendars'
import { useCalendarFeeds } from './useCalendarFeeds'
import type { CalendarSlice, FeedStatus } from './useCalendarFeeds'
import { suggestBlocks } from '../domain/planner'
import type { Interval } from '../domain/planner'
import { planReschedule } from '../domain/reschedule'
import { minutesToTime, parseTimeToMinutes, relativeLabel } from '../domain/day'
import { useRealtime } from './useRealtime'
import { applyAppearance, storeAppearance } from '../lib/appearance'
import type {
  Area, Block, Calendar, NewSeries, NewTask, Project, Series, Settings, Task, Template, TemplateItem,
} from './types'

interface DataContextValue {
  areas: Area[]
  projects: Project[]
  tasks: Task[]
  series: Series[]
  blocks: Block[]
  templates: Template[]
  templateItems: TemplateItem[]
  settings: Omit<Settings, 'id' | 'owner_id' | 'created_at'>
  /** Calendars read from elsewhere, and their events as slices of local days. */
  calendars: Calendar[]
  calendarSlices: CalendarSlice[]
  feedStatus: Map<string, FeedStatus>
  refreshFeeds: () => Promise<void>
  addCalendar: (calendar: Pick<Calendar, 'name' | 'url'>) => Promise<boolean>
  patchCalendar: (id: string, patch: Partial<Calendar>) => Promise<void>
  removeCalendar: (id: string) => Promise<void>
  loading: boolean
  error: string
  reload: () => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  addBlock: (block: Omit<Block, 'id' | 'owner_id' | 'created_at'>) => Promise<void>
  patchBlock: (id: string, patch: Partial<Block>) => Promise<void>
  removeBlock: (id: string) => Promise<void>
  planDay: (date: string) => Promise<void>
  clearPlan: (date: string) => Promise<void>
  addTask: (task: NewTask) => Promise<void>
  addSeries: (series: NewSeries) => Promise<void>
  patchSeries: (id: string, patch: Partial<Series>) => Promise<void>
  removeSeries: (id: string) => Promise<void>
  makeRecurring: (task: Task, series: NewSeries) => Promise<Series | null>
  toggleTask: (task: Task) => Promise<void>
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>
  snoozeTask: (task: Task, date: string) => Promise<void>
  rescheduleOverdue: (overdue: Task[], date: string) => Promise<void>
  toast: Toast | null
  dismissToast: () => void
  undoToast: () => Promise<void>
  addProject: (project: Parameters<typeof createProject>[1]) => Promise<Project | null>
  patchProject: (id: string, patch: Partial<Project>) => Promise<void>
  removeProject: (id: string) => Promise<void>
  addArea: (area: Parameters<typeof createArea>[1]) => Promise<Area | null>
  patchArea: (id: string, patch: Partial<Area>) => Promise<void>
}

/**
 * A one-line note at the bottom of the screen, usually with a way back.
 *
 * Every write in Orbit is optimistic and instant, which is what makes a
 * mis-tap expensive: the thing is already gone. The toast is the other half of
 * that bargain — a few seconds in which the last change can be taken back.
 */
export interface Toast {
  id: number
  message: string
  undo?: () => Promise<void>
}

/** Long enough to notice and reach for, short enough not to linger over the dock. */
const TOAST_MS = 6000

/** "today", "tomorrow", "Friday", "3 Aug" — a day as it reads mid-sentence. */
function inSentence(date: string): string {
  const label = relativeLabel(date, todayISO())
  return label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : label
}

const DataContext = createContext<DataContextValue | undefined>(undefined)

const TABLES = [
  'task_areas', 'task_projects', 'task_tasks', 'task_series', 'task_settings', 'task_blocks',
  'task_calendars',
]

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [areas, setAreas] = useState<Area[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const { slices: calendarSlices, status: feedStatus, refresh: refreshFeeds } = useCalendarFeeds(calendars)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const toastSeq = useRef(0)

  const showToast = useCallback((message: string, undo?: () => Promise<void>) => {
    setToast({ id: ++toastSeq.current, message, undo })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  // Keyed on the id, so a second toast restarts the clock rather than being
  // cut short by the first one's timer.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const reload = useCallback(() => {
    Promise.all([
      fetchAreas(), fetchProjects(), fetchTasks(), fetchSeries(), fetchSettings(), fetchBlocks(),
      fetchTemplates(), fetchTemplateItems(), fetchCalendars(),
    ])
      .then(([a, p, t, s, cfg, b, tpl, tplItems, cals]) => {
        setAreas(a)
        setProjects(p)
        setTasks(t)
        setSeries(s)
        setBlocks(b)
        setTemplates(tpl)
        setTemplateItems(tplItems)
        // Kept as the same array when nothing changed, so a realtime echo
        // doesn't make every feed refetch.
        setCalendars((prev) => (JSON.stringify(prev) === JSON.stringify(cals) ? prev : cals))
        // A missing settings row is fine — the defaults are the same values.
        setSettings(cfg ?? DEFAULT_SETTINGS)
        setError('')
        // Top every series up to its horizon. Cheap and idempotent: it inserts
        // only what's missing, and the realtime echo of any insert settles on
        // the next pass with nothing left to do.
        return ensureOccurrences(s, t)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(reload, [reload])

  // One place to run an undo, so every one of them fails the same way: say
  // so, and resync from the server rather than leave a half-restored screen.
  const undoToast = useCallback(async () => {
    const undo = toast?.undo
    setToast(null)
    if (!undo) return
    try {
      await undo()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not undo that')
      reload()
    }
  }, [toast, reload])

  useRealtime(TABLES, reload)

  // The appearance follows the settings row, whether it changed here, on the
  // phone (realtime), or a moment ago in the picker (optimistic). Applying it
  // in one effect rather than at each call site means there is exactly one
  // place where the DOM and the mirror can disagree with Postgres — and it
  // runs after the paint main.tsx already made, so nothing flashes.
  useEffect(() => {
    const appearance = {
      theme: settings.ui_theme,
      palette: settings.ui_palette,
      mode: settings.ui_mode,
    }
    applyAppearance(appearance)
    storeAppearance(appearance)
  }, [settings.ui_theme, settings.ui_palette, settings.ui_mode])

  // Optimistic writes: the UI moves immediately and resyncs from the server on
  // failure. Ticking a checkbox that waits on a round trip feels broken.
  const addTask = useCallback(
    async (task: NewTask) => {
      if (!user) return
      try {
        const created = await createTask(user.id, task)
        setTasks((prev) => [...prev, created])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not add that')
        reload()
      }
    },
    [user, reload],
  )

  const toggleTask = useCallback(
    async (task: Task) => {
      const done = task.status !== 'done'
      const today = todayISO()
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: done ? 'done' : 'open',
                completed_at: done ? new Date().toISOString() : null,
                completed_on: done ? today : null,
              }
            : t,
        ),
      )
      try {
        await setTaskDone(task.id, done, today)

        // An interval-after-completion series has no horizon — ticking it off
        // is what schedules the next one, measured from today rather than from
        // a calendar date. The completed row stays as history, which is the
        // record maintenance_tracker.py never kept.
        const parent = task.series_id ? series.find((s) => s.id === task.series_id) : undefined
        let next: string | null = null
        if (done && parent?.rule_type === 'after_completion') {
          next = nextAfterCompletion(ruleOf(parent), today)
          if (next) await advanceAfterCompletion(parent, next)
          reload()
        }

        // Unticking is its own undo, so only a tick earns the toast. Taking it
        // back has to retract the next occurrence the tick just created, or
        // the car service would come round twice.
        if (done) {
          showToast(`Done: ${task.title}`, async () => {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === task.id ? { ...t, status: 'open', completed_at: null, completed_on: null } : t,
              ),
            )
            await setTaskDone(task.id, false)
            if (parent && next) await retractAfterCompletion(parent.id, next)
            reload()
          })
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload, series, showToast],
  )

  /**
   * Push one task to another day — the swipe-left on a row. Only this task
   * moves: on a repeat it's this occurrence, never the rule.
   */
  const snoozeTask = useCallback(
    async (task: Task, date: string) => {
      const before = task.due_on
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_on: date } : t)))
      try {
        await updateTask(task.id, { due_on: date })
        showToast(`Moved to ${inSentence(date)}: ${task.title}`, async () => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_on: before } : t)))
          await updateTask(task.id, { due_on: before })
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not move that')
        reload()
      }
    },
    [reload, showToast],
  )

  /**
   * Clear the overdue pile in one go. One-off work moves to `date`; a missed
   * repeat whose next occurrence is already waiting is marked dropped instead
   * of being stacked on top of it (see domain/reschedule.ts). Undo puts every
   * row back the way it was.
   */
  const rescheduleOverdue = useCallback(
    async (overdue: Task[], date: string) => {
      const { move, skip } = planReschedule(overdue, tasks, todayISO())
      if (move.length + skip.length === 0) return
      const moveIds = new Set(move.map((t) => t.id))
      const skipIds = new Set(skip.map((t) => t.id))
      const before = [...move, ...skip].map((t) => ({ id: t.id, due_on: t.due_on, status: t.status }))

      setTasks((prev) =>
        prev.map((t) =>
          moveIds.has(t.id) ? { ...t, due_on: date }
          : skipIds.has(t.id) ? { ...t, status: 'dropped' }
          : t,
        ),
      )
      try {
        await updateTasks([...moveIds], { due_on: date })
        await updateTasks([...skipIds], { status: 'dropped' })

        const when = inSentence(date)
        const parts = [
          move.length > 0 && `Moved ${move.length} to ${when}`,
          skip.length > 0 && `skipped ${skip.length} missed repeat${skip.length === 1 ? '' : 's'}`,
        ].filter(Boolean)
        const message = parts.join(', ')
        showToast(message.charAt(0).toUpperCase() + message.slice(1), async () => {
          const byId = new Map(before.map((b) => [b.id, b]))
          setTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id)! } : t)))
          await Promise.all(before.map((b) => updateTask(b.id, { due_on: b.due_on, status: b.status })))
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not move those')
        reload()
      }
    },
    [tasks, reload, showToast],
  )

  // A rule, not a task. Its first occurrences are materialised immediately so
  // the thing you just typed actually appears on Today or the calendar.
  const addSeries = useCallback(
    async (input: NewSeries) => {
      if (!user) return
      try {
        const created = await createSeries(user.id, input)
        await ensureOccurrences([created], [])
        reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not add that')
        reload()
      }
    },
    [user, reload],
  )

  /**
   * Edit a rule, and carry the edit onto everything it has already created.
   *
   * Three steps, in this order, because each depends on the last: write the
   * rule; drop the future occurrences the new rule no longer wants; then top
   * up to the horizon and push the inherited fields onto what's left. Past and
   * completed occurrences are never touched — that separation is the reason a
   * habit has a real history instead of one mutable due date.
   */
  const patchSeries = useCallback(
    async (id: string, patch: Partial<Series>) => {
      const before = series.find((s) => s.id === id)
      if (!before) return
      const after = { ...before, ...patch }
      setSeries((prev) => prev.map((s) => (s.id === id ? after : s)))

      try {
        await updateSeries(id, patch)
        await pruneStaleOccurrences(after, tasks)
        // Prune first: ensureOccurrences reads the rows it must not duplicate,
        // and a stale row still present would look like one already covered.
        const fresh = await fetchTasks()
        await ensureOccurrences([after], fresh)
        await propagateToFuture(id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
      }
      reload()
    },
    [series, tasks, reload],
  )

  const removeSeries = useCallback(
    async (id: string) => {
      setSeries((prev) => prev.filter((s) => s.id !== id))
      setTasks((prev) => prev.filter((t) => t.series_id !== id))
      try {
        // Occurrences cascade in the database — deleting the rule, past
        // occurrences included, is what "stop this repeating" has to mean when
        // the alternative is sixty orphan rows nothing can explain.
        await deleteSeries(id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not delete that')
        reload()
      }
    },
    [reload],
  )

  /**
   * Make an existing one-off task repeat.
   *
   * The task becomes the series' first occurrence rather than being replaced by
   * one, so its notes, subtasks and id survive and nothing appears twice on the
   * date it already had.
   */
  const makeRecurring = useCallback(
    async (task: Task, input: NewSeries): Promise<Series | null> => {
      if (!user) return null
      try {
        const created = await createSeries(user.id, input)
        await adoptAsFirstOccurrence(task.id, created, input.anchor_on)
        await ensureOccurrences([created], [{ ...task, occurrence_key: input.anchor_on }])
        reload()
        return created
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not make that repeat')
        reload()
        return null
      }
    },
    [user, reload],
  )

  // Lists, projects and areas. All three were readable and none was writable,
  // so the seeded rows were the only rows that could ever exist.
  const addProject = useCallback(
    async (project: Parameters<typeof createProject>[1]) => {
      if (!user) return null
      try {
        const created = await createProject(user.id, project)
        setProjects((prev) => [...prev, created])
        return created
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not create that')
        reload()
        return null
      }
    },
    [user, reload],
  )

  const patchProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
      try {
        await updateProject(id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload],
  )

  const removeProject = useCallback(
    async (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id))
      try {
        await archiveProject(id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not archive that')
        reload()
      }
    },
    [reload],
  )

  const addArea = useCallback(
    async (area: Parameters<typeof createArea>[1]) => {
      if (!user) return null
      try {
        const created = await createArea(user.id, area)
        setAreas((prev) => [...prev, created])
        return created
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not create that')
        reload()
        return null
      }
    },
    [user, reload],
  )

  const patchArea = useCallback(
    async (id: string, patch: Partial<Area>) => {
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      try {
        await updateArea(id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload],
  )

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!user) return
      setSettings((prev) => ({ ...prev, ...patch }))
      try {
        await updateSettings(user.id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [user, reload],
  )

  const addBlock = useCallback(
    async (block: Omit<Block, 'id' | 'owner_id' | 'created_at'>) => {
      if (!user) return
      try {
        await createBlock(user.id, block)
        reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not add that block')
      }
    },
    [user, reload],
  )

  /**
   * Edit a block, and take ownership of it in the same breath.
   *
   * Moving or renaming a suggestion makes it yours, so it's promoted to
   * source='manual' and the next auto-plan leaves it alone. Without that, the
   * fix you just made to a suggested slot would vanish the next time you
   * tapped Auto-plan.
   */
  const patchBlock = useCallback(
    async (id: string, patch: Partial<Block>) => {
      const full = { ...patch, source: 'manual' as const }
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...full } : b)))
      try {
        await updateBlock(id, full)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that block')
        reload()
      }
    },
    [reload],
  )

  const removeBlock = useCallback(
    async (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id))
      try {
        await deleteBlock(id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not remove that block')
        reload()
      }
    },
    [reload],
  )

  const clearPlan = useCallback(
    async (date: string) => {
      if (!user) return
      setBlocks((prev) => prev.filter((b) => !(b.on_date === date && b.source === 'planner')))
      try {
        await clearPlannerBlocks(user.id, date)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not clear the plan')
        reload()
      }
    },
    [user, reload],
  )

  /**
   * Lay the day's own work onto the calendar.
   *
   * Only source='planner' rows are cleared and rebuilt, so re-planning never
   * disturbs a block placed by hand — and anything you blocked yourself is
   * treated as committed time rather than being scheduled twice.
   *
   * Tasks that already carry a time are the planner's job now rather than
   * something it works around: suggestBlocks pins them where they were put and
   * fills the gaps between them. That's why they're no longer added to `busy`
   * or to `alreadyBlocked` here.
   */
  const planDay = useCallback(
    async (date: string) => {
      if (!user) return
      try {
        const dayBlocks = blocks.filter((b) => b.on_date === date)
        const manual = dayBlocks.filter((b) => b.source === 'manual')

        const busy = [
          ...manual.flatMap((b) => {
            const start = parseTimeToMinutes(b.start_time)
            const end = parseTimeToMinutes(b.end_time)
            return start !== null && end !== null ? [{ start, end }] : []
          }),
          // Meetings from a connected calendar are committed time too — the
          // reason for reading the calendar at all is so a task is never
          // planned on top of one.
          ...busySlices(calendarSlices, date),
        ]

        const suggestions = suggestBlocks(tasks, {
          today: date,
          dayStartMin: parseTimeToMinutes(settings.day_start) ?? 480,
          dayEndMin: parseTimeToMinutes(settings.day_end) ?? 1260,
          busy,
          alreadyBlocked: manual
            .map((b) => b.task_id)
            .filter((id): id is string => id !== null),
        })

        await replacePlannerBlocks(
          user.id,
          date,
          suggestions.map((s) => ({
            on_date: date,
            start_time: minutesToTime(s.startMin),
            end_time: minutesToTime(s.endMin),
            task_id: s.taskId,
            label: '',
            source: 'planner' as const,
            all_day: false,
          })),
        )
        reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not plan the day')
      }
    },
    [user, blocks, tasks, settings, calendarSlices, reload],
  )

  const addCalendar = useCallback(
    async (calendar: Pick<Calendar, 'name' | 'url'>): Promise<boolean> => {
      if (!user) return false
      try {
        const created = await createCalendar(user.id, calendar)
        setCalendars((prev) => [...prev, created])
        return true
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not add that calendar')
        return false
      }
    },
    [user],
  )

  const patchCalendar = useCallback(
    async (id: string, patch: Partial<Calendar>) => {
      setCalendars((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      try {
        await updateCalendar(id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload],
  )

  // The saved address is the one thing that's tedious to get back — it means
  // a trip to a desktop browser and a settings page three levels deep — so
  // removing a calendar can be undone like anything else.
  const removeCalendar = useCallback(
    async (id: string) => {
      const gone = calendars.find((c) => c.id === id)
      setCalendars((prev) => prev.filter((c) => c.id !== id))
      try {
        await deleteCalendar(id)
        if (gone) {
          showToast(`Removed: ${gone.name}`, async () => {
            setCalendars((prev) => [...prev, gone])
            await restoreCalendar(gone)
          })
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not remove that calendar')
        reload()
      }
    },
    [calendars, reload, showToast],
  )

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      try {
        await updateTask(id, patch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload],
  )

  const removeTask = useCallback(
    async (id: string) => {
      // Subtasks and blocks cascade in the database, so removing a parent
      // takes its children with it. They're snapshotted first so undo can put
      // every row back with the ids it had — parent before children.
      const gone = tasks.filter((t) => t.id === id || t.parent_id === id)
      const goneIds = new Set(gone.map((t) => t.id))
      const goneBlocks = blocks.filter((b) => b.task_id !== null && goneIds.has(b.task_id))
      const title = gone.find((t) => t.id === id)?.title ?? 'task'

      setTasks((prev) => prev.filter((t) => !goneIds.has(t.id)))
      setBlocks((prev) => prev.filter((b) => !goneBlocks.includes(b)))
      try {
        await deleteTask(id)
        showToast(`Deleted: ${title}`, async () => {
          const ordered = [...gone].sort((a, b) => Number(a.id !== id) - Number(b.id !== id))
          await restoreTasks(ordered)
          await restoreBlocks(goneBlocks)
          reload()
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not delete that')
        reload()
      }
    },
    [tasks, blocks, reload, showToast],
  )

  return (
    <DataContext.Provider
      value={{
        areas, projects, tasks, series, blocks, templates, templateItems,
        settings, loading, error, reload,
        calendars, calendarSlices, feedStatus, refreshFeeds, addCalendar, patchCalendar, removeCalendar,
        addTask, addSeries, patchSeries, removeSeries, makeRecurring,
        toggleTask, patchTask, removeTask, snoozeTask, rescheduleOverdue, toast, dismissToast, undoToast,
        addProject, patchProject, removeProject, addArea, patchArea,
        saveSettings, addBlock, patchBlock, removeBlock, planDay, clearPlan,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

/** A day's timed, busy calendar time — what a meeting takes out of the day. */
// eslint-disable-next-line react-refresh/only-export-components
export function busySlices(slices: CalendarSlice[], day: string): Interval[] {
  return slices
    .filter((s) => s.day === day && !s.allDay && s.busy)
    .map((s) => ({ start: s.startMin, end: s.endMin }))
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
