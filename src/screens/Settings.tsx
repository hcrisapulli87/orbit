import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { calendarUrlProblem } from '../data/calendars'
import { addDays, todayISO } from '../domain/day'
import { PALETTES, THEMES } from '../domain/appearance'
import { DEMO } from '../lib/supabase'
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
        <h2>How Orbit works</h2>
        <Link className="choice" to="/help">
          <span className="choice__body">
            <span className="choice__name">Capture, Today, the calendar, repeats</span>
            <span className="choice__sub">Every feature, and what decides what</span>
          </span>
          <span className="muted" aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="card">
        <h2>Appearance</h2>
        <Link className="choice" to="/appearance">
          <span className="choice__body">
            <span className="choice__name">
              {THEMES[settings.ui_theme].name} · {PALETTES[settings.ui_palette].name}
            </span>
            <span className="choice__sub">
              {settings.ui_mode === 'system' ? 'Following the system' : `Always ${settings.ui_mode}`}
            </span>
          </span>
          {/* A typographic mark rather than an eighth glyph: it takes
              currentColor and the palette for free, same as the icons do. */}
          <span className="muted" aria-hidden="true">›</span>
        </Link>
      </div>

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
            className="input input--time"
            type="time"
            value={settings.day_start.slice(0, 5)}
            onChange={(e) => void saveSettings({ day_start: e.target.value })}
          />
        </label>
        <label className="row--between setting-row">
          <span>Ends</span>
          <input
            className="input input--time"
            type="time"
            value={settings.day_end.slice(0, 5)}
            onChange={(e) => void saveSettings({ day_end: e.target.value })}
          />
        </label>
      </div>

      <CalendarsCard />

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
        <h2>{DEMO ? 'Demo' : 'Account'}</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>
          {DEMO
            ? 'Every task, project and streak here is invented, and it all lives in memory — reload and it comes back exactly as it started.'
            : user?.email}
        </p>
        <button className="btn" onClick={() => void signOut()}>
          {DEMO ? 'Reset the demo data' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}

/** "just now", "12 min ago", "3 h ago". */
function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  return `${Math.round(min / 60)} h ago`
}

/**
 * Calendars kept elsewhere, shown in Orbit and kept clear by auto-plan.
 *
 * One form, two fields, both needed — a name so the event list can say where
 * a meeting came from, and the address. The address is checked for the usual
 * wrong link before it's saved, because Google's page and embed links look
 * right and return a web page instead of a calendar.
 */
function CalendarsCard() {
  const { calendars, calendarSlices, feedStatus, addCalendar, patchCalendar, removeCalendar, refreshFeeds } = useData()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  const today = todayISO()
  const weekAhead = addDays(today, 7)
  const upcoming = (id: string) =>
    new Set(
      calendarSlices
        .filter((s) => s.calendarId === id && s.day >= today && s.day <= weekAhead)
        .map((s) => s.key),
    ).size

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const issue = calendarUrlProblem(url)
    if (issue) {
      setProblem(issue)
      return
    }
    setSaving(true)
    const ok = await addCalendar({ name: name.trim() || 'Calendar', url: url.trim() })
    setSaving(false)
    if (ok) {
      setName('')
      setUrl('')
      setProblem('')
    }
  }

  return (
    <div className="card">
      <h2>Calendars</h2>
      <p className="hint">
        Show meetings from Google, Outlook or iCloud on Today and the calendar.
        They count against the day, and auto-plan works around them. Orbit only
        reads them — nothing is ever written back.
      </p>

      {calendars.map((c) => {
        const status = feedStatus.get(c.id)
        return (
          <div className="setting-row" key={c.id}>
            <div className="row--between">
              <strong>{c.name}</strong>
              <span className="row">
                <button
                  className="btn btn--small"
                  aria-pressed={c.enabled}
                  onClick={() => void patchCalendar(c.id, { enabled: !c.enabled })}
                >
                  {c.enabled ? 'Hide' : 'Show'}
                </button>
                <button className="btn btn--small" onClick={() => void removeCalendar(c.id)}>
                  Remove
                </button>
              </span>
            </div>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              {!c.enabled ? 'Hidden. Its events aren’t shown or counted.'
                : status?.state === 'error' ? <span className="error">{status.message}</span>
                : status?.state === 'loading' && !status.at ? 'Reading…'
                : status?.at ? `${upcoming(c.id)} in the next week · read ${ago(status.at)}`
                : 'Waiting to be read'}
            </p>
          </div>
        )
      })}

      {calendars.some((c) => c.enabled) && (
        <button className="btn btn--small" style={{ margin: '10px 0 4px' }} onClick={() => void refreshFeeds()}>
          Read them again now
        </button>
      )}

      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <input
          id="calendar-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. Work"
          aria-label="Calendar name"
        />
        <input
          id="calendar-url"
          className="input"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setProblem('')
          }}
          placeholder="https://… or webcal://… (.ics)"
          aria-label="Calendar address"
        />
        {problem && <p className="error" style={{ margin: 0, fontSize: '0.8rem' }}>{problem}</p>}
        <button className="btn" type="submit" disabled={saving || !url.trim()}>
          {saving ? 'Adding…' : 'Add calendar'}
        </button>
      </form>

      <p className="hint" style={{ margin: '12px 0 4px' }}>Where to find the address:</p>
      <p className="hint" style={{ margin: '0 0 4px' }}>
        <strong>Google</strong> — on a computer, Settings → your calendar → Integrate
        calendar → <em>Secret address in iCal format</em>.
      </p>
      <p className="hint" style={{ margin: '0 0 4px' }}>
        <strong>Outlook</strong> — Settings → Calendar → Shared calendars → Publish a
        calendar → copy the <em>ICS</em> link.
      </p>
      <p className="hint" style={{ margin: 0 }}>
        <strong>iCloud</strong> — in Calendar, share the calendar as a <em>Public
        Calendar</em> and copy the webcal:// link.
      </p>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Treat the address like a password: anyone who has it can read that calendar.
      </p>
    </div>
  )
}
