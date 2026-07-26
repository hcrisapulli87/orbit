import { useAuth } from './auth/AuthProvider'
import Login from './screens/Login'

export default function App() {
  const { session, loading, signOut } = useAuth()

  if (loading) return <div className="spinner-wrap">Loading…</div>

  // Rendered bare rather than as a route, so the URL is preserved through
  // sign-in and a deep link still lands where it was aimed.
  if (!session) return <Login />

  // Placeholder shell. The tab bar and screens land in the next commits.
  return (
    <main className="screen screen--center">
      <h1 className="brand">Orbit</h1>
      <p className="muted">Signed in as {session.user.email}</p>
      <button className="btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}
