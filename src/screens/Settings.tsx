import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { disablePush, enablePush, isInstalled, pushState } from '../lib/push'
import type { PushState } from '../lib/push'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PUSH_COPY: Record<PushState, string> = {
  unsupported: 'This browser can’t do web push.',
  'not-configured': 'No VAPID key set — add VITE_VAPID_PUBLIC_KEY and redeploy.',
  denied: 'Notifications are blocked. Turn them back on in browser settings first.',
  off: 'Off. The Discord digest still runs regardless.',
  on: 'On for this device. Each device has to be turned on separately.',
}

export default function Settings() {
  const { user, signOut } = useAuth()
  const { settings, saveSettings } = useData()
  const [push, setPush] = useState<PushState>('off')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    void pushState().then(setPush)
  }, [])

  const togglePush = async () => {
    if (!user) return
    setPushBusy(true)
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush(user.id))
    } finally {
      setPushBusy(false)
    }
  }

  const setCapacity = (index: number, value: number) => {
    const next = [...settings.weekday_capacity]
    next[index] = Math.max(0, value)
    void saveSettings({ weekday_capacity: next })
  }

  return (
    <main className="screen">
      <ScreenHeader
        title="Settings"
        action={
          <Link className="gear" to="/" aria-label="Back">
            ✕
          </Link>
        }
      />

      <div className="card">
        <h2>Daily capacity</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.8rem' }}>
          Minutes of task time per day. The Today plan fills up to this and then says how far
          over you are — it never drops anything to make the day look tidy.
        </p>
        {settings.weekday_capacity.map((min, i) => (
          <label className="row--between setting-row" key={WEEKDAYS[i]}>
            <span>{WEEKDAYS[i]}</span>
            <span className="row">
              <input
                className="input input--num"
                type="number"
                inputMode="numeric"
                min={0}
                step={15}
                value={min}
                onChange={(e) => setCapacity(i, Number(e.target.value))}
              />
              <span className="muted">min</span>
            </span>
          </label>
        ))}
      </div>

      <div className="card">
        <h2>Day</h2>
        <label className="row--between setting-row">
          <span>Starts</span>
          <input
            className="input input--num"
            type="time"
            value={settings.day_start.slice(0, 5)}
            onChange={(e) => void saveSettings({ day_start: e.target.value })}
          />
        </label>
        <label className="row--between setting-row">
          <span>Ends</span>
          <input
            className="input input--num"
            type="time"
            value={settings.day_end.slice(0, 5)}
            onChange={(e) => void saveSettings({ day_end: e.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <h2>Notifications</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.8rem' }}>
          {PUSH_COPY[push]}
        </p>
        {/* iOS only allows push for a PWA that's been added to the home screen,
            and drops permission if you delete it — worth saying before the tap
            rather than after it silently fails. */}
        {!isInstalled() && push !== 'on' && (
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.78rem' }}>
            On iPhone, add Orbit to your home screen first — Safari won’t allow
            notifications otherwise.
          </p>
        )}
        <button
          className="btn"
          disabled={pushBusy || push === 'unsupported' || push === 'not-configured' || push === 'denied'}
          onClick={() => void togglePush()}
        >
          {push === 'on' ? 'Turn off on this device' : 'Enable notifications'}
        </button>
      </div>

      <div className="card">
        <h2>Account</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>{user?.email}</p>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}
