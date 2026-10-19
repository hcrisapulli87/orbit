import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../data/DataProvider'
import { clock, extend, secondsLeft } from '../domain/focus'
import type { FocusSession } from '../domain/focus'
import { defaultEstimateFor } from '../domain/planner'
import type { Task } from '../data/types'

// The session lives in localStorage — a per-device convenience, like the
// appearance mirror. A timer is about this phone, now; it doesn't belong in a
// row other devices would see.
const KEY = 'orbit.focus'

function load(): FocusSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FocusSession) : null
  } catch {
    return null
  }
}

function store(s: FocusSession | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // Blocked storage: the session still runs until the tab closes.
  }
}

interface FocusValue {
  session: FocusSession | null
  start: (task: Task) => void
  stop: () => void
}

const FocusContext = createContext<FocusValue | undefined>(undefined)

export function FocusProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<FocusSession | null>(load)

  const start = useCallback((task: Task) => {
    const next = {
      taskId: task.id,
      title: task.title,
      startedAt: Date.now(),
      durationMin: Math.max(5, defaultEstimateFor(task)),
    }
    store(next)
    setSession(next)
  }, [])

  const stop = useCallback(() => {
    store(null)
    setSession(null)
  }, [])

  const update = useCallback((s: FocusSession) => {
    store(s)
    setSession(s)
  }, [])

  return (
    <FocusContext.Provider value={{ session, start, stop }}>
      <FocusSetter.Provider value={update}>{children}</FocusSetter.Provider>
    </FocusContext.Provider>
  )
}

const FocusSetter = createContext<(s: FocusSession) => void>(() => {})

// eslint-disable-next-line react-refresh/only-export-components
export function useFocus(): FocusValue {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within a FocusProvider')
  return ctx
}

/**
 * The running session, in the dock above the capture bar — visible on every
 * screen, the way a timer on the desk is.
 *
 * When time is up it says so, buzzes once where phones allow it, and puts up
 * a notification if notifications are on and the app is in the background.
 * It then waits: "Done" ticks the task off, "+5 min" keeps going, "Stop" just
 * stops. Nothing is ticked off on your behalf.
 */
export function FocusBar() {
  const { session, stop } = useFocus()
  const update = useContext(FocusSetter)
  const { tasks, toggleTask } = useData()
  const [now, setNow] = useState(Date.now())
  const announced = useRef<number | null>(null)

  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const left = session ? secondsLeft(session, now) : 0
  const up = session !== null && left === 0

  useEffect(() => {
    if (!session || !up || announced.current === session.startedAt + session.durationMin) return
    announced.current = session.startedAt + session.durationMin
    navigator.vibrate?.(200)
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      void navigator.serviceWorker?.ready.then((reg) =>
        reg.showNotification('Time’s up', { body: session.title, tag: 'orbit-focus' }),
      )
    }
  }, [session, up])

  if (!session) return null
  const task = tasks.find((t) => t.id === session.taskId)

  return (
    <div className={`focusbar${up ? ' focusbar--up' : ''}`} role="timer" aria-live={up ? 'assertive' : 'off'}>
      <span className="focusbar__time">{up ? 'Time’s up' : clock(left)}</span>
      <span className="focusbar__title">{session.title}</span>
      {task && task.status === 'open' && (
        <button
          className="focusbar__btn focusbar__btn--done"
          onClick={() => {
            void toggleTask(task)
            stop()
          }}
        >
          Done
        </button>
      )}
      <button className="focusbar__btn" onClick={() => update(extend(session, Date.now()))}>
        +5 min
      </button>
      <button className="focusbar__btn" onClick={stop} aria-label="Stop the timer">
        Stop
      </button>
    </div>
  )
}
