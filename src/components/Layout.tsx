import { NavLink, Outlet } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { isInbox } from '../data/tasks'
import { CaptureBar } from './CaptureBar'
import { Icon } from './Icon'
import type { IconName } from './Icon'

// The five daily surfaces. Project detail, task detail, templates, settings and
// search are reached from within these rather than from the bar.
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

  return (
    <>
      <Outlet />
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
    </>
  )
}
