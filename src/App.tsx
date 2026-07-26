import { useAuth } from './auth/AuthProvider'
import { DataProvider, useData } from './data/DataProvider'
import Login from './screens/Login'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <div className="spinner-wrap">Loading…</div>

  // Rendered bare rather than as a route, so the URL is preserved through
  // sign-in and a deep link still lands where it was aimed.
  if (!session) return <Login />

  // DataProvider sits inside the gate, so every data hook can assume a user.
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

// Placeholder shell proving the data layer round-trips. The tab bar and real
// screens land in the next commits.
function Shell() {
  const { areas, projects, tasks, loading, error } = useData()
  const { signOut } = useAuth()

  if (loading) return <div className="spinner-wrap">Loading…</div>

  return (
    <main className="screen">
      <h1 className="brand">Orbit</h1>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <h2>Connected</h2>
        <p className="muted">
          {areas.length} areas · {projects.length} projects · {tasks.length} tasks
        </p>
      </div>
      <button className="btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}
