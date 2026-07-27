import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { describeRecurrence, parseCapture } from '../domain/capture'
import { formatTime, relativeLabel, todayISO } from '../domain/day'

const PRIORITY_LABEL = ['', 'low', 'med', 'high']

/**
 * The single way into the app. There is no new-task form: one text box, live
 * preview of what was understood, Enter to commit, keyboard stays open.
 *
 * The preview is the honesty mechanism. Everything the parser inferred is shown
 * as a chip before it is saved, and a low-confidence parse is drawn dotted and
 * labelled "guess" rather than presented as fact.
 */
export function CaptureBar() {
  const { projects, areas, addTask, addSeries } = useData()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const known = useMemo(
    () => ({ projects: projects.map((p) => p.name), areas: areas.map((a) => a.name) }),
    [projects, areas],
  )

  const parsed = useMemo(() => parseCapture(text, new Date(), known), [text, known])
  const today = todayISO()
  const guessing = parsed.confidence === 'low'

  // PWA share target: Android hands us ?title=&text=&url= on a GET share.
  // Pre-fill and open rather than saving silently, so a share is still a
  // deliberate capture and the parse preview is visible.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const shared = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (!shared) return
    setText(shared)
    setOpen(true)
    setParams({}, { replace: true })
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [params, setParams])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.title) return

    const project = projects.find((p) => p.name === parsed.projectHint)
    const area = areas.find((a) => a.name === parsed.areaHint)
    // A project implies its area, so an explicit area only applies on its own.
    const areaId = area?.id ?? project?.area_id ?? null

    // Something that repeats becomes a rule, not a task. The engine then
    // materialises its occurrences — the parser never invents the first one.
    if (parsed.recurrence) {
      const hint = parsed.recurrence
      await addSeries({
        title: parsed.title,
        notes: '',
        project_id: project?.id ?? null,
        area_id: areaId,
        kind: 'task',
        priority: parsed.priority,
        tags: parsed.tags,
        estimate_min: null,
        due_time: parsed.dueTime,
        rule_type: hint.rule_type,
        step: hint.step,
        weekdays: hint.weekdays,
        // Left null so the engine reads them off the anchor — one source of
        // truth for "which day of the month" rather than two that can drift.
        month_day: null,
        nth: hint.nth,
        month: null,
        after_n: hint.after_n,
        after_unit: hint.after_unit,
        // An explicit date means "start from here"; otherwise today.
        anchor_on: parsed.dueOn ?? today,
        until_on: null,
        lead_days: 0,
        active: true,
      })
      setText('')
      inputRef.current?.focus()
      return
    }

    await addTask({
      title: parsed.title,
      due_on: parsed.dueOn,
      due_time: parsed.dueTime,
      priority: parsed.priority,
      tags: parsed.tags,
      project_id: project?.id ?? null,
      area_id: areaId,
      source: 'capture',
      capture_text: parsed.captureText,
      parse_confidence: parsed.confidence,
    })

    // Clear but stay open and focused — capture comes in bursts.
    setText('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setText('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <div className="capture">
        <button
          className="capture__pill"
          onClick={() => {
            setOpen(true)
            // The input mounts this render; focus on the next tick.
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          <span className="capture__plus" aria-hidden="true">
            +
          </span>
          Add anything…
        </button>
      </div>
    )
  }

  return (
    <div className="capture">
      <form className="capture__panel" onSubmit={submit}>
        <input
          ref={inputRef}
          className="capture__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => !text && setOpen(false)}
          placeholder="pay rego fri 3pm !high @car"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
        />

        {text.trim() !== '' && (
          <div className="capture__chips">
            <span className="chip">{parsed.title || '(no title yet)'}</span>

            {parsed.dueOn && (
              <span className={`chip${guessing ? ' chip--guess' : ' chip--today'}`}>
                {relativeLabel(parsed.dueOn, today)}
                {parsed.dueTime && ` · ${formatTime(parsed.dueTime)}`}
              </span>
            )}

            {parsed.recurrence && (
              <span className="chip">🔁 {describeRecurrence(parsed.recurrence)}</span>
            )}

            {parsed.priority > 0 && <span className="chip">{PRIORITY_LABEL[parsed.priority]}</span>}
            {parsed.projectHint && <span className="chip">{parsed.projectHint}</span>}
            {parsed.areaHint && <span className="chip">{parsed.areaHint}</span>}
            {parsed.tags.map((t) => (
              <span className="chip" key={t}>
                #{t}
              </span>
            ))}
            {guessing && <span className="chip chip--guess">guess</span>}
          </div>
        )}

        {guessing && (
          <p className="capture__hint">
            That date could be read two ways — Orbit took the Australian one. The time was
            dropped rather than guessed.
          </p>
        )}
      </form>
    </div>
  )
}
