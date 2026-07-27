import { describe, it, expect } from 'vitest'
import { describeRecurrence, parseCapture } from './capture'

const NOW = new Date(2026, 6, 27, 9, 0) // Monday 27 July 2026, 09:00 local

const KNOWN = {
  projects: ['Groceries', 'Wishlist', 'Chores', 'Maintenance', 'Kitchen reno'],
  areas: ['Work', 'Home', 'Car', 'Health', 'Money', 'Personal', 'Dates'],
}

describe('parseCapture — plain text', () => {
  it('keeps an unadorned line as the title and guesses nothing', () => {
    const r = parseCapture('call the plumber', NOW, KNOWN)
    expect(r.title).toBe('call the plumber')
    expect(r.priority).toBe(0)
    expect(r.tags).toEqual([])
    expect(r.projectHint).toBeNull()
    expect(r.areaHint).toBeNull()
    expect(r.confidence).toBe('high')
  })

  it('always keeps the raw input so nothing parsed is unrecoverable', () => {
    const r = parseCapture('  call the plumber  ', NOW, KNOWN)
    expect(r.captureText).toBe('  call the plumber  ')
    expect(r.title).toBe('call the plumber')
  })

  it('treats an empty or whitespace-only string as empty, not an error', () => {
    expect(parseCapture('   ', NOW, KNOWN).title).toBe('')
  })

  it('works with no known projects or areas supplied', () => {
    expect(parseCapture('buy milk', NOW).title).toBe('buy milk')
  })
})

describe('parseCapture — priority', () => {
  it('maps the word forms', () => {
    expect(parseCapture('fix tap !high', NOW, KNOWN).priority).toBe(3)
    expect(parseCapture('fix tap !med', NOW, KNOWN).priority).toBe(2)
    expect(parseCapture('fix tap !medium', NOW, KNOWN).priority).toBe(2)
    expect(parseCapture('fix tap !low', NOW, KNOWN).priority).toBe(1)
  })

  it('maps the p-number forms, p1 being the most urgent', () => {
    expect(parseCapture('fix tap !p1', NOW, KNOWN).priority).toBe(3)
    expect(parseCapture('fix tap !p2', NOW, KNOWN).priority).toBe(2)
    expect(parseCapture('fix tap !p3', NOW, KNOWN).priority).toBe(1)
  })

  it('maps bare !! to the highest priority', () => {
    expect(parseCapture('fix tap !!', NOW, KNOWN).priority).toBe(3)
  })

  it('is case-insensitive', () => {
    expect(parseCapture('fix tap !HIGH', NOW, KNOWN).priority).toBe(3)
  })

  it('strips the token from the title', () => {
    expect(parseCapture('fix tap !high', NOW, KNOWN).title).toBe('fix tap')
    expect(parseCapture('!high fix tap', NOW, KNOWN).title).toBe('fix tap')
    expect(parseCapture('fix !high tap', NOW, KNOWN).title).toBe('fix tap')
  })

  it('leaves an exclamation that is part of the text alone', () => {
    const r = parseCapture('do it!', NOW, KNOWN)
    expect(r.title).toBe('do it!')
    expect(r.priority).toBe(0)
  })
})

describe('parseCapture — tags', () => {
  it('collects #tags, lowercased, and strips them from the title', () => {
    const r = parseCapture('email the agent #rental #urgent', NOW, KNOWN)
    expect(r.tags).toEqual(['rental', 'urgent'])
    expect(r.title).toBe('email the agent')
  })

  it('does not duplicate a repeated tag', () => {
    expect(parseCapture('thing #a #a', NOW, KNOWN).tags).toEqual(['a'])
  })

  it('allows hyphens inside a tag', () => {
    expect(parseCapture('thing #deep-work', NOW, KNOWN).tags).toEqual(['deep-work'])
  })
})

describe('parseCapture — project hints', () => {
  it('matches a known project exactly, case-insensitively', () => {
    const r = parseCapture('milk @groceries', NOW, KNOWN)
    expect(r.projectHint).toBe('Groceries')
    expect(r.title).toBe('milk')
  })

  it('matches a known project by prefix', () => {
    expect(parseCapture('bin night @chore', NOW, KNOWN).projectHint).toBe('Chores')
  })

  it('matches a multi-word project by its first word', () => {
    expect(parseCapture('order tiles @kitchen', NOW, KNOWN).projectHint).toBe('Kitchen reno')
  })

  it('falls back to an area when no project matches', () => {
    const r = parseCapture('standup notes @work', NOW, KNOWN)
    expect(r.projectHint).toBeNull()
    expect(r.areaHint).toBe('Work')
  })

  // The pressure valve: an unknown @word is never lost, it just becomes a tag.
  it('turns an unrecognised @word into a tag rather than dropping it', () => {
    const r = parseCapture('pay rego @errands', NOW, KNOWN)
    expect(r.projectHint).toBeNull()
    expect(r.areaHint).toBeNull()
    expect(r.tags).toEqual(['errands'])
    expect(r.title).toBe('pay rego')
  })

  it('prefers a project over an area when both could match', () => {
    // "Home" is an area; there is no Home project, so this resolves to the area.
    // "Chores" is a project inside Home and must win when named directly.
    expect(parseCapture('vacuum @chores', NOW, KNOWN).projectHint).toBe('Chores')
    expect(parseCapture('vacuum @home', NOW, KNOWN).areaHint).toBe('Home')
  })

  it('keeps the first @word when several are given', () => {
    const r = parseCapture('thing @groceries @chores', NOW, KNOWN)
    expect(r.projectHint).toBe('Groceries')
    expect(r.tags).toEqual(['chores'])
  })
})

describe('parseCapture — relative dates', () => {
  const due = (text: string) => parseCapture(text, NOW, KNOWN).dueOn

  it('handles today and tomorrow', () => {
    expect(due('bins today')).toBe('2026-07-27')
    expect(due('bins tod')).toBe('2026-07-27')
    expect(due('bins tomorrow')).toBe('2026-07-28')
    expect(due('bins tmr')).toBe('2026-07-28')
  })

  it('reads tonight as today at 7pm', () => {
    const r = parseCapture('take the bins out tonight', NOW, KNOWN)
    expect(r.dueOn).toBe('2026-07-27')
    expect(r.dueTime).toBe('19:00')
    expect(r.title).toBe('take the bins out')
  })

  it('handles end of month', () => {
    expect(due('rent eom')).toBe('2026-07-31')
    expect(due('rent end of month')).toBe('2026-07-31')
  })

  it('handles next week and next month', () => {
    expect(due('review next week')).toBe('2026-08-03') // Monday of next week
    expect(due('review next month')).toBe('2026-08-27')
  })

  it('handles "in N days/weeks/months"', () => {
    expect(due('chase invoice in 3 days')).toBe('2026-07-30')
    expect(due('chase invoice in 2 weeks')).toBe('2026-08-10')
    expect(due('chase invoice in 6 months')).toBe('2027-01-27')
    expect(due('chase invoice in 1 day')).toBe('2026-07-28')
  })
})

describe('parseCapture — weekdays', () => {
  const due = (text: string) => parseCapture(text, NOW, KNOWN).dueOn

  it('picks the coming occurrence of a bare weekday', () => {
    expect(due('pay rego fri')).toBe('2026-07-31')
    expect(due('pay rego friday')).toBe('2026-07-31')
    expect(due('pay rego wed')).toBe('2026-07-29')
  })

  it('accepts "this <weekday>" as the same thing', () => {
    expect(due('pay rego this friday')).toBe('2026-07-31')
  })

  it('reads "next <weekday>" as that day in the FOLLOWING week', () => {
    expect(due('pay rego next friday')).toBe('2026-08-07')
    expect(due('pay rego next monday')).toBe('2026-08-03')
    expect(due('pay rego next sunday')).toBe('2026-08-09')
  })

  // "monday" said on a Monday is genuinely ambiguous — today or next week?
  it('marks a bare weekday matching today as a low-confidence guess a week out', () => {
    const r = parseCapture('standup monday', NOW, KNOWN)
    expect(r.dueOn).toBe('2026-08-03')
    expect(r.confidence).toBe('low')
  })
})

describe('parseCapture — numeric dates (AU day-first)', () => {
  it('reads DD/MM in Australian order', () => {
    const r = parseCapture('rego due 15/8', NOW, KNOWN)
    expect(r.dueOn).toBe('2026-08-15')
    expect(r.confidence).toBe('high')
    expect(r.title).toBe('rego due')
  })

  it('accepts hyphens as the separator', () => {
    expect(parseCapture('rego due 15-8', NOW, KNOWN).dueOn).toBe('2026-08-15')
  })

  it('rolls a date already past into next year', () => {
    expect(parseCapture('mum bday 5/1', NOW, KNOWN).dueOn).toBe('2027-01-05')
  })

  it('accepts a 2- or 4-digit year', () => {
    expect(parseCapture('rego 15/8/27', NOW, KNOWN).dueOn).toBe('2027-08-15')
    expect(parseCapture('rego 15/08/2027', NOW, KNOWN).dueOn).toBe('2027-08-15')
  })

  // Both halves ≤ 12, so DD/MM vs MM/DD can't be told apart. We commit to the
  // Australian reading but say out loud that it's a guess.
  it('marks an ambiguous numeric pair as low confidence', () => {
    const r = parseCapture('call bank 3/8', NOW, KNOWN)
    expect(r.dueOn).toBe('2026-08-03')
    expect(r.confidence).toBe('low')
  })

  it('ignores an impossible date rather than guessing at it', () => {
    const r = parseCapture('order 40/13 widgets', NOW, KNOWN)
    expect(r.dueOn).toBeNull()
    expect(r.title).toBe('order 40/13 widgets')
  })
})

describe('parseCapture — month names', () => {
  it('reads "3 mar" and "mar 3" the same way', () => {
    expect(parseCapture('tax 3 mar', NOW, KNOWN).dueOn).toBe('2027-03-03')
    expect(parseCapture('tax mar 3', NOW, KNOWN).dueOn).toBe('2027-03-03')
  })

  it('accepts the full month name', () => {
    expect(parseCapture('tax 3 march', NOW, KNOWN).dueOn).toBe('2027-03-03')
  })

  it('keeps a date later this year in this year', () => {
    expect(parseCapture('trip 14 aug', NOW, KNOWN).dueOn).toBe('2026-08-14')
  })

  it('accepts an explicit year', () => {
    expect(parseCapture('trip 14 aug 2028', NOW, KNOWN).dueOn).toBe('2028-08-14')
  })
})

describe('parseCapture — times', () => {
  const at = (text: string) => parseCapture(text, NOW, KNOWN).dueTime

  it('reads am/pm with and without minutes', () => {
    expect(at('call bank tomorrow 3pm')).toBe('15:00')
    expect(at('call bank tomorrow 3:30pm')).toBe('15:30')
    expect(at('gym tomorrow 6am')).toBe('06:00')
    expect(at('midday thing tomorrow 12pm')).toBe('12:00')
    expect(at('late thing tomorrow 12am')).toBe('00:00')
  })

  it('reads 24-hour times', () => {
    expect(at('call bank tomorrow 15:30')).toBe('15:30')
    expect(at('call bank tomorrow 08:05')).toBe('08:05')
  })

  it('reads "at N" with a daytime bias', () => {
    expect(at('call bank tomorrow at 3')).toBe('15:00')
    expect(at('call bank tomorrow at 9')).toBe('09:00')
  })

  it('reads the named times of day', () => {
    expect(at('call bank tomorrow noon')).toBe('12:00')
    expect(at('call bank tomorrow midday')).toBe('12:00')
    expect(at('call bank tomorrow midnight')).toBe('00:00')
    expect(at('call bank tomorrow morning')).toBe('09:00')
  })

  it('assumes today when a time is given with no date', () => {
    const r = parseCapture('call bank 3pm', NOW, KNOWN)
    expect(r.dueOn).toBe('2026-07-27')
    expect(r.dueTime).toBe('15:00')
  })

  it('strips the time token from the title', () => {
    expect(parseCapture('call bank tomorrow 3pm', NOW, KNOWN).title).toBe('call bank')
  })

  // A guess we are not sure of must never sharpen into a specific time.
  it('drops the time entirely when the date is only a guess', () => {
    const r = parseCapture('call bank 3/8 at 5pm', NOW, KNOWN)
    expect(r.confidence).toBe('low')
    expect(r.dueOn).toBe('2026-08-03')
    expect(r.dueTime).toBeNull()
  })
})

describe('parseCapture — recurrence', () => {
  const rule = (text: string) => parseCapture(text, NOW, KNOWN).recurrence

  it('returns null when nothing repeats', () => {
    expect(rule('call the plumber tomorrow')).toBeNull()
  })

  it('reads daily rules', () => {
    expect(rule('vitamins every day')).toMatchObject({ rule_type: 'daily', step: 1 })
    expect(rule('vitamins daily')).toMatchObject({ rule_type: 'daily', step: 1 })
    expect(rule('water plants every 3 days')).toMatchObject({ rule_type: 'daily', step: 3 })
  })

  it('reads weekday-only rules as Mon–Fri', () => {
    expect(rule('standup every weekday')).toMatchObject({
      rule_type: 'weekly',
      step: 1,
      weekdays: [1, 2, 3, 4, 5],
    })
  })

  it('reads weekly rules', () => {
    expect(rule('review every week')).toMatchObject({ rule_type: 'weekly', step: 1, weekdays: [] })
    expect(rule('review weekly')).toMatchObject({ rule_type: 'weekly', step: 1 })
    expect(rule('pay cleaner every 2 weeks')).toMatchObject({ rule_type: 'weekly', step: 2 })
  })

  it('reads a named weekday', () => {
    expect(rule('bins every tue')).toMatchObject({ rule_type: 'weekly', step: 1, weekdays: [2] })
    expect(rule('bins every tuesday')).toMatchObject({ rule_type: 'weekly', weekdays: [2] })
  })

  it('reads a list of weekdays, however it is punctuated', () => {
    expect(rule('gym every mon, wed, fri')?.weekdays).toEqual([1, 3, 5])
    expect(rule('gym every mon/wed/fri')?.weekdays).toEqual([1, 3, 5])
    expect(rule('gym every mon and fri')?.weekdays).toEqual([1, 5])
  })

  it('reads an every-N-weeks rule pinned to a weekday', () => {
    expect(rule('bins every 2 weeks on tue')).toMatchObject({
      rule_type: 'weekly',
      step: 2,
      weekdays: [2],
    })
  })

  it('reads monthly rules', () => {
    expect(rule('rent every month')).toMatchObject({ rule_type: 'monthly_day', step: 1 })
    expect(rule('rent monthly')).toMatchObject({ rule_type: 'monthly_day', step: 1 })
    expect(rule('filter every 3 months')).toMatchObject({ rule_type: 'monthly_day', step: 3 })
  })

  it('reads last-day-of-month', () => {
    expect(rule('rent last day of month')).toMatchObject({ rule_type: 'monthly_last', step: 1 })
  })

  it('reads an nth weekday of the month', () => {
    expect(rule('bins 2nd tuesday of the month')).toMatchObject({
      rule_type: 'monthly_nth',
      nth: 2,
      weekdays: [2],
    })
    expect(rule('report last friday of the month')).toMatchObject({
      rule_type: 'monthly_nth',
      nth: -1,
      weekdays: [5],
    })
  })

  it('reads yearly rules', () => {
    expect(rule('rego every year')).toMatchObject({ rule_type: 'yearly', step: 1 })
    expect(rule('rego yearly')).toMatchObject({ rule_type: 'yearly' })
    expect(rule('rego annually')).toMatchObject({ rule_type: 'yearly' })
  })

  // The car-service case: the interval runs from when it was last DONE, not
  // from a fixed calendar date.
  it('reads an after-completion rule', () => {
    expect(rule('car service every 6 months after done')).toMatchObject({
      rule_type: 'after_completion',
      after_n: 6,
      after_unit: 'month',
    })
    expect(rule('car service 6 months after completion')).toMatchObject({
      rule_type: 'after_completion',
      after_n: 6,
      after_unit: 'month',
    })
    expect(rule('rotate tyres 10 weeks after done')).toMatchObject({
      after_n: 10,
      after_unit: 'week',
    })
  })

  it('strips the recurrence phrase from the title', () => {
    expect(parseCapture('bins every tue', NOW, KNOWN).title).toBe('bins')
    expect(parseCapture('car service every 6 months after done @car', NOW, KNOWN).title)
      .toBe('car service')
    expect(parseCapture('gym every mon, wed, fri', NOW, KNOWN).title).toBe('gym')
  })

  it('does not let a recurrence weekday leak into a one-off due date', () => {
    // "every tue" is a rule; the first occurrence is the engine's job, not the
    // parser's, so no due date is invented here.
    expect(parseCapture('bins every tue', NOW, KNOWN).dueOn).toBeNull()
  })

  it('still reads a start date alongside a rule', () => {
    const r = parseCapture('bins every tue from 4/8', NOW, KNOWN)
    expect(r.recurrence).toMatchObject({ rule_type: 'weekly', weekdays: [2] })
    expect(r.dueOn).toBe('2026-08-04')
  })
})

describe('describeRecurrence', () => {
  const describe_ = (text: string) => {
    const r = parseCapture(text, NOW, KNOWN).recurrence
    return r ? describeRecurrence(r) : null
  }

  it('echoes each rule type in plain English', () => {
    expect(describe_('vitamins every day')).toBe('every day')
    expect(describe_('water every 3 days')).toBe('every 3 days')
    expect(describe_('standup every weekday')).toBe('every weekday')
    expect(describe_('review every week')).toBe('every week')
    expect(describe_('bins every tue')).toBe('every week on Tuesday')
    expect(describe_('gym every mon, wed, fri')).toBe('every week on Monday, Wednesday, Friday')
    expect(describe_('cleaner every 2 weeks')).toBe('every 2 weeks')
    expect(describe_('rent every month')).toBe('every month')
    expect(describe_('rent last day of month')).toBe('last day of the month')
    expect(describe_('bins 2nd tuesday of the month')).toBe('2nd Tuesday of the month')
    expect(describe_('report last friday of the month')).toBe('last Friday of the month')
    expect(describe_('rego every year')).toBe('every year')
    expect(describe_('car service every 6 months after done')).toBe("6 months after it's done")
    expect(describe_('rotate tyres 1 month after done')).toBe("1 month after it's done")
  })
})

describe('parseCapture — combinations', () => {
  // The spec's worked example, verbatim.
  it('parses "pay rego fri 3pm !high @errands"', () => {
    const r = parseCapture('pay rego fri 3pm !high @errands', NOW, KNOWN)
    expect(r).toMatchObject({
      title: 'pay rego',
      dueOn: '2026-07-31',
      dueTime: '15:00',
      priority: 3,
      tags: ['errands'],
      confidence: 'high',
    })
  })

  it('is order-independent', () => {
    const a = parseCapture('!high @groceries milk #dairy', NOW, KNOWN)
    const b = parseCapture('milk #dairy @groceries !high', NOW, KNOWN)
    expect(a.title).toBe('milk')
    expect(b.title).toBe('milk')
    expect(a.priority).toBe(b.priority)
    expect(a.projectHint).toBe(b.projectHint)
    expect(a.tags).toEqual(b.tags)
  })

  it('collapses the whitespace left behind by stripped tokens', () => {
    expect(parseCapture('pay   the   !high   rent', NOW, KNOWN).title).toBe('pay the rent')
  })

  it('leaves an email address alone rather than reading it as a project', () => {
    const r = parseCapture('reply to sam@example.com', NOW, KNOWN)
    expect(r.title).toBe('reply to sam@example.com')
    expect(r.projectHint).toBeNull()
    expect(r.tags).toEqual([])
  })
})
