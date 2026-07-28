import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../domain/day'
import { fetchAreas } from './areas'
import { fetchProjects } from './projects'
import { createTask, deleteTask, fetchTasks, setTaskDone, updateTask } from './tasks'
import { advanceAfterCompletion, createSeries, ensureOccurrences, fetchSeries, ruleOf } from './series'
import { nextAfterCompletion } from '../domain/recurrence'
import { DEFAULT_SETTINGS, fetchSettings, updateSettings } from './settings'
import { createBlock, deleteBlock, fetchBlocks, replacePlannerBlocks } from './blocks'
import { fetchTemplateItems, fetchTemplates } from './templates'
import { suggestBlocks } from '../domain/planner'
import { minutesToTime, parseTimeToMinutes } from '../domain/day'
import { defaultEstimateFor } from '../domain/planner'
import { useRealtime } from './useRealtime'
import { applyAppearance, storeAppearance } from '../lib/appearance'
import type {
  Area, Block, NewSeries, NewTask, Project, Series, Settings, Task, Template, TemplateItem,
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
  loading: boolean
  error: string
  reload: () => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  addBlock: (block: Omit<Block, 'id' | 'owner_id' | 'created_at'>) => Promise<void>
  removeBlock: (id: string) => Promise<void>
  planDay: (date: string) => Promise<void>
  addTask: (task: NewTask) => Promise<void>
  addSeries: (series: NewSeries) => Promise<void>
  toggleTask: (task: Task) => Promise<void>
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>
}

const DataContext = createContext<DataContextValue | undefined>(undefined)

const TABLES = [
  'task_areas', 'task_projects', 'task_tasks', 'task_series', 'task_settings', 'task_blocks',
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    Promise.all([
      fetchAreas(), fetchProjects(), fetchTasks(), fetchSeries(), fetchSettings(), fetchBlocks(),
      fetchTemplates(), fetchTemplateItems(),
    ])
      .then(([a, p, t, s, cfg, b, tpl, tplItems]) => {
        setAreas(a)
        setProjects(p)
        setTasks(t)
        setSeries(s)
        setBlocks(b)
        setTemplates(tpl)
        setTemplateItems(tplItems)
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
        if (done && parent?.rule_type === 'after_completion') {
          const next = nextAfterCompletion(ruleOf(parent), today)
          if (next) await advanceAfterCompletion(parent, next)
          reload()
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload, series],
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

  /**
   * Lay today's work into the free gaps.
   *
   * Only source='planner' rows are cleared and rebuilt, so re-planning never
   * disturbs a block placed by hand — and anything you blocked yourself is
   * treated as committed time rather than being scheduled twice.
   */
  const planDay = useCallback(
    async (date: string) => {
      if (!user) return
      try {
        const dayBlocks = blocks.filter((b) => b.on_date === date)
        const manual = dayBlocks.filter((b) => b.source === 'manual')

        const busy = manual.flatMap((b) => {
          const start = parseTimeToMinutes(b.start_time)
          const end = parseTimeToMinutes(b.end_time)
          return start !== null && end !== null ? [{ start, end }] : []
        })

        // A task with a time of day is already committed to that time.
        for (const t of tasks) {
          if (t.due_on !== date || t.status !== 'open') continue
          const start = parseTimeToMinutes(t.due_time)
          if (start === null) continue
          busy.push({ start, end: start + Math.max(15, defaultEstimateFor(t)) })
        }

        const suggestions = suggestBlocks(tasks, {
          today: date,
          dayStartMin: parseTimeToMinutes(settings.day_start) ?? 480,
          dayEndMin: parseTimeToMinutes(settings.day_end) ?? 1260,
          busy,
          alreadyBlocked: [
            ...manual.map((b) => b.task_id).filter((id): id is string => id !== null),
            // Something with its own time doesn't need a block as well.
            ...tasks.filter((t) => t.due_on === date && t.due_time).map((t) => t.id),
          ],
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
          })),
        )
        reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not plan the day')
      }
    },
    [user, blocks, tasks, settings, reload],
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
      // Subtasks cascade in the database, so removing a parent takes its
      // children with it — the row disappears from local state either way.
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id))
      try {
        await deleteTask(id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not delete that')
        reload()
      }
    },
    [reload],
  )

  return (
    <DataContext.Provider
      value={{
        areas, projects, tasks, series, blocks, templates, templateItems,
        settings, loading, error, reload,
        addTask, addSeries, toggleTask, patchTask, removeTask,
        saveSettings, addBlock, removeBlock, planDay,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
