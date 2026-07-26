import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { todayISO } from '../domain/day'
import { fetchAreas } from './areas'
import { fetchProjects } from './projects'
import { createTask, fetchTasks, setTaskDone } from './tasks'
import { useRealtime } from './useRealtime'
import type { Area, NewTask, Project, Task } from './types'

interface DataContextValue {
  areas: Area[]
  projects: Project[]
  tasks: Task[]
  loading: boolean
  error: string
  reload: () => void
  addTask: (task: NewTask) => Promise<void>
  toggleTask: (task: Task) => Promise<void>
}

const DataContext = createContext<DataContextValue | undefined>(undefined)

const TABLES = ['task_areas', 'task_projects', 'task_tasks']

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [areas, setAreas] = useState<Area[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    Promise.all([fetchAreas(), fetchProjects(), fetchTasks()])
      .then(([a, p, t]) => {
        setAreas(a)
        setProjects(p)
        setTasks(t)
        setError('')
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
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save that')
        reload()
      }
    },
    [reload],
  )

  return (
    <DataContext.Provider
      value={{ areas, projects, tasks, loading, error, reload, addTask, toggleTask }}
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
