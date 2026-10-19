# Orbit

Everything you have to do, in one place — work, home, and the rest. A private,
single-user PWA: React + Vite + TypeScript on Supabase, installed to the home
screen.

## What it does

- **One capture box.** No new-task form anywhere in the app. Type
  `pay rego fri 3pm !high @car` and it parses the date, time, priority and
  project. Anything it doesn't understand stays in the title and lands in the
  Inbox, undated.
- **Today.** Four sections, each decided by a task's date rather than by
  leftover capacity: **Must** (overdue, plus today's flagged work), **Should**
  (the rest of today), **Coming up** (the next seven days, and birthdays inside
  their notice period), **If there's time** (no date at all). The capacity bar
  says how big today is; when the day is over-committed it says by how much
  rather than hiding anything.
- **Calendar.** Month, week and day. Tasks, important dates and time blocks in
  one grid. Tap an empty half-hour to name an event, invent a task or hold the
  slot for something already on the list; tap anything on the grid to edit it,
  or hold and drag it to a new time. "Auto-plan my day" pins today's timed work
  where you put it and fills the gaps around it. When the day runs late, it offers to
  re-plan from now, keeping what's done.
- **Recurrence that actually covers real life.** Every Tuesday, every second
  Tuesday, last day of the month, second Tuesday of the month, yearly — and
  "six months after I last did it", for the car service. Editable after the
  fact: changing a rule reaches every future occurrence and leaves the ones
  you've already done as they happened.
- **Habits** with streaks that count scheduled days, so a Mon/Wed/Fri habit
  isn't broken by Tuesday.
- **Undo, swipe and reschedule.** Swipe a task right to tick it, left to push
  it to tomorrow; ticking, moving, deleting and rescheduling all leave an undo
  toast behind. Today's overdue banner moves the whole pile in one tap, and
  skips a missed repeat rather than stacking it on the next one.
- **Your other calendars, read-only.** Paste the private iCal address of a
  Google, Outlook or iCloud calendar and its meetings appear on Today and in
  the grid, shrink the day's capacity to what they leave free, and are kept
  clear by auto-plan. A task pinned to a time that a meeting or a
  hand-placed block already occupies says so on its row. Repeat rules, exceptions, moved occurrences and time
  zones are read in the browser (`domain/ical.ts`); the `calendar-feed` Edge
  Function only relays the text, because the providers send no CORS headers.
- **Capture works offline.** Anything added without a connection is queued on
  the device with the id it will keep, shown with a *waiting to save* chip,
  and sent in order when the connection returns — safely, if it's sent twice.
  Edits to rows already on the server still need the network.
- **A focus timer** on any task, for the task's own estimate — nothing to set.
  It lives in the dock on every screen, survives a reload, and when time is up
  offers Done, five more minutes, or stop.
- **Wrap-up and weekly review.** Two screens, offered on Today when they
  make sense (late afternoon; Friday to Monday) and never required. The
  wrap-up shows what got done, takes a one-tap decision on each thing still
  open, and says how full tomorrow already is. The review covers what you
  finished and where, how each habit went, which of the next seven days are
  over capacity, and the undated work that's been sitting a month.
- **Search and a Logbook.** Search covers titles, notes, tags and projects
  from memory, one row per repeating task, and opens with `/`. The Logbook
  shows everything you've finished, by day, paging further back on request.
- **Lists and projects.** Groceries and Wishlist are lists; anything with steps
  is a project, with subtasks and a progress bar. Make your own of either.
- **Templates.** Save a project you've just finished as a template, then
  re-run it anchored to a new date.
- **Birthdays** that repeat yearly, cost nothing against the day, and warn you
  far enough ahead to buy something.
- **Reminders** by web push, plus a morning digest posted to Discord.
- **A help screen** at `/help` that explains all of the above in the app.

## Design rules

Two ideas run through the whole thing.

**Nothing depends on a field you have to remember to fill in.** No energy
picker, no context tag, no manual estimate, no "is this a habit?" toggle.
Optional fields go unfilled, and features built on them become dead weight.
Estimates come from kind and priority; habits are identified by cadence;
important dates are recognised from the words you typed. Where a form does
exist — the repeat editor, a new list, a birthday — every control on it starts
at a working default, so stopping halfway still gives you the right thing.

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
value. Only *Today* differs between themes: Terrain folds everything below Must
behind a summary line, and Transit swaps the list for a timeline
(`screens/TodaySpine.tsx`) built from the same `buildToday()` plan and the same
`HOUR_PX` the calendar uses.

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
contrast, search ranking, overdue rescheduling, Logbook paging, the swipe
gesture, iCal parsing and time-zone conversion. All pure, `now` always injected, no clock mocking.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `supabase/schema.sql` in the Supabase SQL editor. It's idempotent —
   running it twice is a clean no-op, which is the proof it worked, and it's
   also how an existing database picks up a new version.
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

### Calendar feeds (optional)

1. Run `supabase/schema.sql` again — v10 adds `task_calendars`.
2. `supabase functions deploy calendar-feed` (JWT verification stays on).
3. Settings → Calendars → paste the calendar's private iCal address.

The function fetches only addresses saved on the caller's own rows, refuses
anything that isn't public https, and stores nothing.

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

Writing back to Google Calendar (feeds are read-only) · bills and spending (they live in Tally) · multi-user
sharing · offline edits to already-saved rows (new captures do queue) · attachments · sub-subtasks · iCal
export · natural-language *editing* ("move everything to next week") ·
location reminders · time tracking · server-side full-text search (search runs
over the in-memory working set: everything open and the last month of done).
