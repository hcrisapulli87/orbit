import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { deleteTemplate, instantiate } from '../data/templates'
import { todayISO } from '../domain/day'

export default function Templates() {
  const { user } = useAuth()
  const { templates, templateItems, areas, reload } = useData()
  const [using, setUsing] = useState<string | null>(null)
  const [anchor, setAnchor] = useState(todayISO())

  const template = templates.find((t) => t.id === using)
  const itemsFor = (id: string) => templateItems.filter((i) => i.template_id === id)

  const run = async () => {
    if (!user || !template) return
    await instantiate(user.id, template, itemsFor(template.id), anchor)
    setUsing(null)
    reload()
  }

  return (
    <main className="screen">
      <ScreenHeader
        title="Templates"
        action={
          <Link className="gear" to="/lists" aria-label="Back">
            ✕
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon="🧩"
          title="No templates yet"
          hint="Open a project and tap “Save as template” once you’ve done it once — that’s how these get made."
        />
      ) : (
        templates.map((t) => {
          const items = itemsFor(t.id)
          const area = areas.find((a) => a.id === t.area_id)
          return (
            <div className="card" key={t.id}>
              <div className="row--between">
                <strong>
                  {t.icon} {t.name}
                </strong>
                <button
                  className="btn btn--small"
                  onClick={() => {
                    setAnchor(todayISO())
                    setUsing(t.id)
                  }}
                >
                  Use
                </button>
              </div>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>
                {items.length} step{items.length === 1 ? '' : 's'}
                {area && ` · ${area.icon} ${area.name}`}
                {t.use_count > 0 && ` · used ${t.use_count}×`}
              </p>
              <div className="triage">
                {items.slice(0, 6).map((i) => (
                  <span className="chip" key={i.id}>
                    {i.parent_index !== null && '↳ '}
                    {i.title}
                    {i.offset_days !== null && (
                      <em style={{ fontStyle: 'normal', opacity: 0.7 }}>
                        {' '}
                        {i.offset_days === 0 ? 'day 0' : `${i.offset_days > 0 ? '+' : ''}${i.offset_days}d`}
                      </em>
                    )}
                  </span>
                ))}
                {items.length > 6 && <span className="chip">+{items.length - 6}</span>}
              </div>
              <button
                className="btn btn--small"
                style={{ marginTop: 10, color: 'var(--danger-strong)' }}
                onClick={async () => {
                  await deleteTemplate(t.id)
                  reload()
                }}
              >
                Delete
              </button>
            </div>
          )
        })
      )}

      {template && (
        <div className="sheet" role="dialog" aria-label="Use template">
          <div className="sheet__panel">
            <div className="row--between">
              <strong>{template.name}</strong>
              <button className="btn btn--small" onClick={() => setUsing(null)}>
                Cancel
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Every step is dated relative to this day — a step saved as “the night before” stays
              the night before.
            </p>
            <label className="row--between setting-row">
              <span>Anchor date</span>
              <input
                className="input input--num"
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </label>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => void run()}>
              Create {itemsFor(template.id).length} task
              {itemsFor(template.id).length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
