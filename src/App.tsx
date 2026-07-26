import { todayISO, relativeLabel, addDays } from './domain/day'

// Scaffold shell. The auth gate lands in the next commit, the tab bar after it.
export default function App() {
  const today = todayISO()

  return (
    <div className="screen screen--center">
      <h1 className="brand">Orbit</h1>
      <p className="muted">Everything you have to do, in one place.</p>
      <p className="muted">
        {relativeLabel(today, today)} · {relativeLabel(addDays(today, 1), today)}
      </p>
    </div>
  )
}
