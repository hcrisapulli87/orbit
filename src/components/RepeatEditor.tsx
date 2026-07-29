import { useMemo } from 'react'
import { SegmentedControl } from './ui/SegmentedControl'
import { describeRule, nextOccurrenceAfter, nthOccurrenceDate } from '../domain/recurrence'
import type { Rule, RuleType } from '../domain/recurrence'
import { addDays, relativeLabel, todayISO } from '../domain/day'

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The five shapes worth offering. The stored RuleType has seven values because
 * "monthly" is really three different questions; the picker asks the plain
 * question and MONTHLY_SHAPES below asks the follow-up.
 */
const CADENCES: { value: RuleType; label: string }[] = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly_day', label: 'Month' },
  { value: 'yearly', label: 'Year' },
  { value: 'after_completion', label: 'After done' },
]

const MONTHLY_SHAPES: { value: RuleType; label: string }[] = [
  { value: 'monthly_day', label: 'On a date' },
  { value: 'monthly_nth', label: 'Nth weekday' },
  { value: 'monthly_last', label: 'Last day' },
]

const UNITS = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
]

const NTH_OPTIONS = [
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '-1', label: 'Last' },
]

/** How a series ends. Stored as a date either way — see nthOccurrenceDate. */
export type EndMode = 'never' | 'on' | 'after'

const isMonthly = (t: RuleType) =>
  t === 'monthly_day' || t === 'monthly_nth' || t === 'monthly_last'

/** The unit "every N" counts in, for the label beside the number. */
const stepUnit = (t: RuleType) =>
  t === 'daily' ? 'days' : t === 'weekly' ? 'weeks' : isMonthly(t) ? 'months' : 'years'

/**
 * One editor for every repeat in the app: the Habits screen, and the "Repeats"
 * row on a task that doesn't repeat yet.
 *
 * It edits a Rule — the recurrence half of a series — and nothing else, so the
 * two callers can wrap it in whatever else they own. Every control has a
 * working default taken from the anchor date: "every month" with no further
 * answers means the anchor's day of the month, which is what someone who
 * stopped after choosing "Month" meant.
 *
 * The next three dates are shown live, because a rule you can't check is a rule
 * you don't trust. That preview is the same nextOccurrenceAfter the engine uses
 * — it can't disagree with what actually gets generated.
 */
export function RepeatEditor({
  rule,
  onChange,
  endMode,
  endCount,
  onEndChange,
}: {
  rule: Rule
  onChange: (patch: Partial<Rule>) => void
  endMode: EndMode
  endCount: number
  onEndChange: (mode: EndMode, count: number) => void
}) {
  const today = todayISO()

  // Three dates, walked forward one at a time. Cheap, and it exercises exactly
  // the function the materialiser calls.
  const preview = useMemo(() => {
    const out: string[] = []
    let cursor = addDays(rule.anchor_on, -1)
    for (let i = 0; i < 3; i++) {
      const next = nextOccurrenceAfter(rule, cursor)
      if (!next) break
      out.push(next)
      cursor = next
    }
    return out
  }, [rule])

  const setCadence = (value: RuleType) => {
    // Clear the fields the old shape owned. Leaving them set means a weekly
    // rule quietly carrying an nth from the monthly rule it used to be, which
    // describeRule would then read back at you.
    onChange({
      rule_type: value,
      step: 1,
      weekdays: value === 'weekly' ? rule.weekdays : [],
      nth: value === 'monthly_nth' ? (rule.nth ?? 1) : null,
      month_day: null,
      month: null,
      after_n: value === 'after_completion' ? (rule.after_n ?? 1) : null,
      after_unit: value === 'after_completion' ? (rule.after_unit ?? 'month') : null,
    })
  }

  const toggleWeekday = (day: number) => {
    const next = rule.weekdays.includes(day)
      ? rule.weekdays.filter((d) => d !== day)
      : [...rule.weekdays, day].sort()
    onChange({ weekdays: next })
  }

  return (
    <>
      <h2>Repeats</h2>
      <p className="hint">
        Every occurrence is its own row, so you can move one Tuesday without
        touching the rest.
      </p>

      <SegmentedControl
        value={isMonthly(rule.rule_type) ? 'monthly_day' : rule.rule_type}
        options={CADENCES}
        onChange={(v) => setCadence(v as RuleType)}
      />

      {rule.rule_type === 'after_completion' ? (
        <>
          <label className="row--between setting-row" style={{ marginTop: 12 }}>
            <span>Wait</span>
            <input
              className="input input--time"
              type="number"
              min={1}
              value={rule.after_n ?? 1}
              onChange={(e) => onChange({ after_n: Math.max(1, Number(e.target.value) || 1) })}
              aria-label="How long to wait"
            />
          </label>
          <SegmentedControl
            value={rule.after_unit ?? 'month'}
            options={UNITS}
            onChange={(v) => onChange({ after_unit: v as 'day' | 'week' | 'month' })}
          />
          <p className="hint" style={{ marginTop: 10 }}>
            Measured from the day you actually tick it off, not from a date in
            the calendar. The next one doesn't exist until then.
          </p>
        </>
      ) : (
        <>
          <label className="row--between setting-row" style={{ marginTop: 12 }}>
            <span>Every</span>
            <span className="row">
              <input
                className="input input--number"
                type="number"
                min={1}
                value={rule.step}
                onChange={(e) => onChange({ step: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Every how many"
              />
              <span className="muted">{stepUnit(rule.rule_type)}</span>
            </span>
          </label>

          {rule.rule_type === 'weekly' && (
            <>
              <div className="daypicker" role="group" aria-label="Days of the week">
                {DAY_INITIALS.map((initial, day) => (
                  <button
                    key={day}
                    type="button"
                    className={`daypicker__day${rule.weekdays.includes(day) ? ' daypicker__day--on' : ''}`}
                    aria-pressed={rule.weekdays.includes(day)}
                    aria-label={DAY_NAMES[day]}
                    onClick={() => toggleWeekday(day)}
                  >
                    {initial}
                  </button>
                ))}
              </div>
              {rule.weekdays.length === 0 && (
                <p className="hint">Pick none and it uses the day the series starts on.</p>
              )}
            </>
          )}

          {isMonthly(rule.rule_type) && (
            <div style={{ marginTop: 10 }}>
              <SegmentedControl
                value={rule.rule_type}
                options={MONTHLY_SHAPES}
                onChange={(v) =>
                  onChange({
                    rule_type: v as RuleType,
                    nth: v === 'monthly_nth' ? (rule.nth ?? 1) : null,
                  })
                }
              />
              {rule.rule_type === 'monthly_nth' && (
                <div style={{ marginTop: 10 }}>
                  <SegmentedControl
                    value={String(rule.nth ?? 1)}
                    options={NTH_OPTIONS}
                    onChange={(v) => onChange({ nth: Number(v) })}
                  />
                  <div className="daypicker" role="group" aria-label="Which weekday">
                    {DAY_INITIALS.map((initial, day) => (
                      <button
                        key={day}
                        type="button"
                        className={`daypicker__day${rule.weekdays[0] === day ? ' daypicker__day--on' : ''}`}
                        aria-pressed={rule.weekdays[0] === day}
                        aria-label={DAY_NAMES[day]}
                        onClick={() => onChange({ weekdays: [day] })}
                      >
                        {initial}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <label className="row--between setting-row">
        <span>Starts</span>
        <input
          className="input input--time"
          type="date"
          value={rule.anchor_on}
          onChange={(e) => e.target.value && onChange({ anchor_on: e.target.value })}
        />
      </label>

      <h2 style={{ marginTop: 16 }}>Ends</h2>
      <SegmentedControl
        value={endMode}
        options={[
          { value: 'never', label: 'Never' },
          { value: 'on', label: 'On a date' },
          { value: 'after', label: 'After N' },
        ]}
        onChange={(v) => onEndChange(v as EndMode, endCount)}
      />

      {endMode === 'on' && (
        <label className="row--between setting-row">
          <span>Last day</span>
          <input
            className="input input--time"
            type="date"
            value={rule.until_on ?? ''}
            onChange={(e) => onChange({ until_on: e.target.value || null })}
          />
        </label>
      )}

      {endMode === 'after' && (
        <>
          <label className="row--between setting-row">
            <span>How many times</span>
            <input
              className="input input--number"
              type="number"
              min={1}
              value={endCount}
              onChange={(e) => onEndChange('after', Math.max(1, Number(e.target.value) || 1))}
              aria-label="How many times"
            />
          </label>
          <p className="hint">
            Stored as the date the last one falls on
            {nthOccurrenceDate(rule, endCount) && ` — ${nthOccurrenceDate(rule, endCount)}`}.
          </p>
        </>
      )}

      <div className="preview">
        <strong>{describeRule(rule)}</strong>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {preview.length === 0
            ? rule.rule_type === 'after_completion'
              ? 'Next one appears when you tick this one off.'
              : 'This rule has no dates left.'
            : `Next: ${preview.map((d) => relativeLabel(d, today)).join(' · ')}`}
        </p>
      </div>
    </>
  )
}
