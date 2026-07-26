import { NavLink, Outlet } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { isInbox } from '../data/tasks'

// The five daily surfaces. Project detail, task detail, templates, settings and
// search are reached from within these rather than from the bar.
const TABS = [
  { to: '/', label: 'Today', icon: '🌅' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/inbox', label: 'Inbox', icon: '📥' },
  { to: '/lists', label: 'Lists', icon: '🧺' },
  { to: '/habits', label: 'Habits', icon: '🔁' },
]

export function Layout() {
  const { tasks } = useData()
  const inboxCount = tasks.filter(isInbox).length

  return (
    <>
      <Outlet />
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
            {t.to === '/inbox' && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
