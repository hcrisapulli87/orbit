import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { isInbox } from '../data/tasks'
import { CaptureBar } from './CaptureBar'
import { Toast } from './Toast'
import { Icon } from './Icon'
import type { IconName } from './Icon'

// The five daily surfaces. Project detail, task detail, templates, settings,
// search and the Logbook are reached from within these rather than from the bar.
const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox' },
  { to: '/lists', label: 'Lists', icon: 'lists' },
  { to: '/habits', label: 'Habits', icon: 'habits' },
]

export function Layout() {
  const { tasks } = useData()
  const inboxCount = tasks.filter(isInbox).length
  const dock = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // `/` opens search from anywhere, the way it does on most of the web — but
  // never while you're typing, where a slash is just a slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      navigate('/search')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  /**
   * Publish the dock's real height as --dock-h, which is what every screen
   * reserves at the bottom.
   *
   * It used to be a constant, and the constant was wrong in both directions:
   * a theme with a taller typeface made the bar taller than the gap allowed
   * for, and on a phone the padding ran well past where the dock actually
   * ended, leaving a slab of nothing to scroll through. Measuring is the only
   * version that survives four themes, a capture panel that grows as you type,
   * and a home indicator of unknown height.
   */
  useEffect(() => {
    const el = dock.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`)
    publish()
    // border-box, not the default content-box: the safe-area inset is the
    // dock's padding, and a padding change leaves the content box the same
    // size — so the default would sleep through exactly the case this exists
    // for. Rotating a phone changes that inset.
    const observer = new ResizeObserver(publish)
    observer.observe(el, { box: 'border-box' })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <Outlet />
      <Toast />
      {/* One stack, so the capture bar sits on the tab bar rather than being
          positioned at a hard-coded guess of where its top edge lands. */}
      <div className="dock" ref={dock}>
        {/* Reachable from every screen, above the tab bar — capture is never a trip. */}
        <CaptureBar />
        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="icon">
                <Icon name={t.icon} />
              </span>
              {t.label}
              {t.to === '/inbox' && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  )
}
