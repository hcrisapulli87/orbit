import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { DataProvider } from './data/DataProvider'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'
import Login from './screens/Login'
import Today from './screens/Today'
import Calendar from './screens/Calendar'
import Inbox from './screens/Inbox'
import Lists from './screens/Lists'
import Habits from './screens/Habits'
import Settings from './screens/Settings'
import Appearance from './screens/Appearance'
import ProjectDetail from './screens/ProjectDetail'
import TaskDetail from './screens/TaskDetail'
import Templates from './screens/Templates'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <div className="spinner-wrap">Loading…</div>

  // Rendered bare rather than as a route, so the URL is preserved through
  // sign-in and a deep link still lands where it was aimed.
  if (!session) return <Login />

  // DataProvider sits inside the gate, so every data hook can assume a user.
  // The boundary wraps the routes rather than the whole tree, so a throw in a
  // screen still leaves the app shell and the reload button standing.
  return (
    <DataProvider>
      <OfflineBanner />
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Today />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/lists" element={<Lists />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/appearance" element={<Appearance />} />
            <Route path="/project/:id" element={<ProjectDetail />} />
            <Route path="/task/:id" element={<TaskDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="*" element={<Today />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </DataProvider>
  )
}
