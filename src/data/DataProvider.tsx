import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../domain/day'
import { fetchAreas } from './areas'
import { fetchProjects } from './projects'
import { createTask, fetchTasks, setTaskDone, updateTask } from './tasks'
import { advanceAfterCompletion, createSeries, ensureOccurrences, fetchSeries, ruleOf } from './series'
import { nextAfterCompletion } from '../domain/recurrence'
import { DEFAULT_SETTINGS, fetchSettings, updateSettings } from './settings'
import { createBlock, deleteBlock, fetchBlocks } from './blocks'
import { useRealtime } from './useRealtime'
import type { Area, Block, NewSeries, NewTask, Project, Series, Settings, Task } from './types'

interface DataContextValue {
  areas: Area[]
  projects: Project[]
  tasks: Task[]
  series: Series[]
  blocks: Block[]
  settings: Omit<Settings, 'id' | 'owner_id' | 'created_at'>
  loading: boolean
  error: string
  reload: () => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  addBlock: (block: Omit<Block, 'id' | 'owner_id' | 'created_at'>) => Promise<void>
  removeBlock: (id: string) => Promise<void>
  addTask: (task: NewTask) => Promise<void>
  addSeries: (series: NewSeries) => Promise<void>
  toggleTask: (task: Task) => Promise<void>
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>
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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    Promise.all([
      fetchAreas(), fetchProjects(), fetchTasks(), fetchSeries(), fetchSettings(), fetchBlocks(),
    ])
      .then(([a, p, t, s, cfg, b]) => {
        setAreas(a)
        setProjects(p)
        setTasks(t)
        setSeries(s)
        setBlocks(b)
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

  return (
    <DataContext.Provider
      value={{
        areas, projects, tasks, series, blocks, settings, loading, error, reload,
        addTask, addSeries, toggleTask, patchTask, saveSettings, addBlock, removeBlock,
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
