import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { DataProvider } from './data/DataProvider'
import { Layout } from './components/Layout'
import Login from './screens/Login'
import Today from './screens/Today'
import Calendar from './screens/Calendar'
import Inbox from './screens/Inbox'
import Lists from './screens/Lists'
import Habits from './screens/Habits'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <div className="spinner-wrap">Loading…</div>

  // Rendered bare rather than as a route, so the URL is preserved through
  // sign-in and a deep link still lands where it was aimed.
  if (!session) return <Login />

  // DataProvider sits inside the gate, so every data hook can assume a user.
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Today />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="*" element={<Today />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}
