# Orbit

Everything you have to do, in one place — work, home, and the rest. A private,
single-user PWA: React + Vite + TypeScript on Supabase, installed to the home
screen.

## What it does

- **One capture box.** No new-task form anywhere in the app. Type
  `pay rego fri 3pm !high @car` and it parses the date, time, priority and
  project. Anything it doesn't understand stays in the title and lands in the
  Inbox, undated.
- **Today.** An auto-built plan: overdue first, then what fits the day's
  capacity, then what doesn't. When the day is over-committed it says by how
  much rather than hiding anything.
- **Calendar.** Month, week and day. Tasks, important dates and time blocks in
  one grid. Tap an empty hour to block it out; "Auto-plan my day" fills the
  gaps.
- **Recurrence that actually covers real life.** Every Tuesday, every second
  Tuesday, last day of the month, second Tuesday of the month, yearly — and
  "six months after I last did it", for the car service.
- **Habits** with streaks that count scheduled days, so a Mon/Wed/Fri habit
  isn't broken by Tuesday.
- **Lists and projects.** Groceries and Wishlist are lists; anything with steps
  is a project, with subtasks and a progress bar.
- **Templates.** Save a project you've just finished as a template, then
  re-run it anchored to a new date.
- **Reminders** by web push, plus a morning digest posted to Discord.

## Design rules

Two ideas run through the whole thing.

**Nothing depends on a field you have to remember to fill in.** No energy
picker, no context tag, no manual estimate, no "is this a habit?" toggle.
Optional fields go unfilled, and features built on them become dead weight.
Estimates come from kind and priority; habits are identified by cadence;
important dates are recognised from the words you typed.

**A guess is labelled as a guess.** `3/8` could be 3 August or 8 March, so the
capture bar commits to the Australian reading, marks the parse low-confidence,
draws the chip dotted, and *refuses to invent a time*. The raw text you typed
is always kept.

## Appearance

Three independent axes, stored as three columns on the settings row and applied
as three attributes on `<html>`:

| Axis | Values | Owns |
| --- | --- | --- |
| **Theme** | Halo · Telemetry · Terrain · Transit | typeface, shape, elevation, density — **never a hue** |
| **Palette** | Indigo · Lagoon · Ember · Orchid · Phosphor | hue, and the same set of hues in every theme |
| **Mode** | System · Light · Dark | surface polarity |

Four × five × two = 40 combinations that all work, because the three CSS layers
in `styles/theme.css` own disjoint sets of tokens and every single-attribute
selector has the same specificity — source order decides, so nothing needs
`!important`. `domain/appearance.ts` holds the hues as data; `appearance.test.ts`
checks every combination against WCAG AA on seven text roles, reads the
stylesheet back to prove the two copies agree, and fails if a theme ever
declares a colour of its own.

Halo · Indigo · Dark is the app as it was before any of this existed, value for
value. Only *Today* differs between themes: Terrain folds Should and
If-there's-time behind a summary line, and Transit swaps the list for a
timeline (`screens/TodaySpine.tsx`) built from the same `buildToday()` plan and
the same `HOUR_PX` the calendar uses.

Postgres is the source of truth. `localStorage` mirrors the three values for one
reason: `main.tsx` applies them before React mounts, so a cold start doesn't
flash the default theme for a beat.

## Stack

React 19, Vite, TypeScript, `@supabase/supabase-js`, `react-router-dom`,
`vite-plugin-pwa`, Vitest. **No date library and no chart library** — the
recurrence rules Orbit needs (nth-weekday, interval-after-completion) aren't
RRULE concepts, so the arithmetic is owned here, on `YYYY-MM-DD` strings that
are immune to daylight saving. Two tests bracket the Melbourne DST transitions
to prove it.

```
src/
  domain/     pure logic, no React, no network — where the tests live
  data/       Supabase I/O, one file per table
  demo/       the in-memory stand-in behind `npm run demo`
  components/ shared UI
  screens/    one per route
supabase/
  schema.sql  one idempotent file, safe to re-run
  cron.sql    the notifier schedule (fill in locally, don't commit secrets)
  functions/notify/  the push Edge Function
```

`domain/` is the heavy-tested half: recurrence, capture parsing, planner
scoring, streaks, calendar geometry, template instantiation, appearance
contrast. 298 tests, all pure, `now` always injected, no clock mocking.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `supabase/schema.sql` in the Supabase SQL editor. It's idempotent —
   running it twice is a clean no-op, which is the proof it worked.
4. `npm run dev`

The publishable key is a public browser key; security lives in Row-Level
Security, not in hiding it. Every Orbit table is owner-only.

### Demo mode

```
npm run demo
```

Orbit with no backend, no account and no keys: `VITE_DEMO=1` swaps the Supabase
client (`src/lib/supabase.ts`) for an in-memory fake in `src/demo/`, seeded with
an invented but plausible week — overdue work, an over-committed day, a project
mid-flight, habits with live streaks and a broken one, a low-confidence parse.
Sign-in is bypassed; Settings offers "Reset the demo data" in place of Sign out.

Only the I/O boundary is faked. Every screen, the provider, the planner, the
recurrence engine and the optimistic writes are the real ones, so the demo can't
drift away from the app that ships — recurring occurrences, for instance, are
seeded as *rules* and materialised on load by the same engine as production.
Everything is held in memory: writes work, and a reload restores the same
curated day.

Dates are relative to today, so the demo doesn't rot. `npm run demo:build`
produces a static bundle in `dist-demo/` if it ever needs hosting.

### Notifications (optional)

1. `npx web-push generate-vapid-keys`
2. Public key → `VITE_VAPID_PUBLIC_KEY` in `.env` and in the host's env vars.
3. Private key → Supabase Edge Function secrets, with `VAPID_SUBJECT` and a
   `NOTIFY_SECRET` you invent.
4. Deploy `supabase/functions/notify`, then run `supabase/cron.sql`.
5. Settings → Enable notifications.

**iOS caveat:** web push only works once Orbit is on the home screen, and
permission is lost if you delete it. The Discord digest is the deliberate
second channel, not redundancy for its own sake.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run demo` | dev server with fake data and no backend |
| `npm test` | Vitest, once |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | typecheck + production build |
| `npm run icons` | regenerate PWA icons from `public/favicon.svg` |

## Not in v1

Google Calendar sync · bills and spending (they live in Tally) · multi-user
sharing · an offline write queue · attachments · sub-subtasks · iCal import
or export · natural-language *editing* ("move everything to next week") ·
location reminders · time tracking · full-text search.
