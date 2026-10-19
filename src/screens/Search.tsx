import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useData } from '../data/DataProvider'
import { searchNamed, searchTasks } from '../domain/search'

/** Enough to scan; a query that needs more than this needs another word. */
const MAX_RESULTS = 50

/**
 * Find anything: open work, the last month of finished work, and the lists
 * and projects themselves. Answers on every keystroke from what's already in
 * memory (domain/search.ts), so there is no search button to press.
 */
export default function Search() {
  const navigate = useNavigate()
  const { tasks, projects } = useData()
  const [query, setQuery] = useState('')

  const names = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  const found = useMemo(() => searchTasks(query, tasks, names), [query, tasks, names])
  const lists = useMemo(() => searchNamed(query, projects), [query, projects])
  const blank = query.trim() === ''

  return (
    <main className="screen">
      <ScreenHeader
        title="Search"
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <input
        id="search-query"
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Titles, notes, #tags, projects…"
        aria-label="Search"
        autoFocus
        enterKeyHint="search"
        style={{ marginBottom: 14 }}
      />

      {blank ? (
        <p className="hint">
          Every word has to match somewhere. Covers everything open and the
          last month of finished work; older history is in the{' '}
          <Link to="/logbook">Logbook</Link>.
        </p>
      ) : found.length === 0 && lists.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches" hint="Try fewer words, or part of a word." />
      ) : (
        <>
          {lists.length > 0 && (
            <div className="card">
              <h2>Lists and projects</h2>
              {lists.map((p) => (
                <Link key={p.id} className="blockrow" to={`/project/${p.id}`}>
                  <span className="blockrow__what">
                    {p.icon} {p.name}
                  </span>
                  <span className="muted">{p.kind}</span>
                </Link>
              ))}
            </div>
          )}
          {found.length > 0 && (
            <div className="card">
              <h2>
                Tasks · {found.length > MAX_RESULTS ? `first ${MAX_RESULTS} of ${found.length}` : found.length}
              </h2>
              {found.slice(0, MAX_RESULTS).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
