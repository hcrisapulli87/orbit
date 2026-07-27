import { describe, it, expect } from 'vitest'
import { parseCapture } from './capture'

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

describe('parseCapture — combinations', () => {
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
