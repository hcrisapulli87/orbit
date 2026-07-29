import { Link, useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'

/**
 * How Orbit works, on screen.
 *
 * Until now the entire documentation was one capture-bar placeholder, six
 * empty-state hints and a handful of muted paragraphs — which is fine while
 * you still remember writing it and no use six months later. The wording here
 * is taken from the README so the two can't drift into disagreeing.
 *
 * Deliberately plain markup: nothing here has state, and a page you can read
 * top to bottom beats a set of expanders that hide the answer you want.
 */
export default function Help() {
  const navigate = useNavigate()

  return (
    <main className="screen">
      <ScreenHeader
        title="How Orbit works"
        action={
          <button className="gear" onClick={() => navigate(-1)} aria-label="Back">
            ✕
          </button>
        }
      />

      <div className="card">
        <h2>Adding anything</h2>
        <p className="hint">
          There is no new-task form. The bar at the bottom of every screen is
          the only way in, and it reads what you type.
        </p>
        <Example
          input="pay rego fri 3pm !high @car"
          rows={[
            ['pay rego', 'the title — whatever is left over'],
            ['fri 3pm', 'due Friday, at 3pm'],
            ['!high', 'priority · !low !med !high'],
            ['@car', 'a project, a list or an area'],
            ['#tax', 'a tag, if it matches nothing else'],
          ]}
        />
        <p className="hint" style={{ marginTop: 12 }}>
          Chips appear above the bar as it understands you. Anything it doesn't
          understand stays in the title and lands undated in the Inbox, so
          nothing is ever lost to a failed parse.
        </p>
        <p className="hint">
          A dotted chip is a guess. <code>3/8</code> could be 3 August or 8
          March; Orbit takes the Australian reading, marks it low-confidence,
          and refuses to invent a time. What you typed is always kept.
        </p>
      </div>

      <div className="card">
        <h2>Today</h2>
        <p className="hint">
          Four sections, each decided by the task's date — not by how much room
          is left in the day.
        </p>
        <Rows
          rows={[
            ['Must', 'Overdue, plus anything due today you marked Med or High.'],
            ['Should', 'The rest of what is due today.'],
            ['Coming up', 'Dated in the next seven days, and birthdays inside their notice period.'],
            ['If there’s time', 'Open work with no date at all.'],
          ]}
        />
        <p className="hint" style={{ marginTop: 12 }}>
          The bar at the top is how much today's work adds up to against how
          long your day is (Settings → capacity). When it doesn't fit it says by
          how much. It never drops anything to make the day look tidy.
        </p>
      </div>

      <div className="card">
        <h2>The calendar, and blocking out time</h2>
        <Rows
          rows={[
            ['Tap an empty half-hour', 'Name it and add it as an event or a task, or hold the slot for something already on your list.'],
            ['Tap anything on the grid', 'Opens it — a task goes to its detail screen, a block to its editor.'],
            ['Hold and drag', 'Moves it to a new time, snapping to fifteen minutes.'],
          ]}
        />
        <p className="hint" style={{ marginTop: 12 }}>
          An event is just a named block of time — no checkbox, nothing on
          Today. A task gets both. Use whichever the thing actually is.
        </p>
      </div>

      <div className="card">
        <h2>Auto-plan my day</h2>
        <p className="hint">
          Lays today's work onto the calendar, and only today's. Anything that
          already has a time is pinned exactly where you put it; the rest fills
          the gaps around it in urgency order. Undated work is never placed, and
          nor is anything due another day.
        </p>
        <p className="hint">
          It rewrites only its own suggestions, so a block you placed by hand
          survives. Edit a suggestion and it becomes yours — the next auto-plan
          will leave it alone.
        </p>
      </div>

      <div className="card">
        <h2>Repeating things</h2>
        <p className="hint">
          Type the cadence and it becomes a rule rather than a task:{' '}
          <code>stretch every day</code>, <code>bins every tue</code>,{' '}
          <code>rent last day of month</code>,{' '}
          <code>car service 6 months after done</code>. Or open any task and tap
          “Make this repeat”.
        </p>
        <p className="hint">
          A rule and its occurrences are separate. Moving one Tuesday changes
          that Tuesday only. Changing the rule — on{' '}
          <Link to="/habits">Habits</Link> — changes every future one and leaves
          the ones you've already done exactly as they happened, which is what
          the streak counts.
        </p>
        <p className="hint">
          Something that comes round at least weekly gets a streak. Anything
          rarer is upkeep, because a streak on a six-monthly car service would
          mean nothing.
        </p>
      </div>

      <div className="card">
        <h2>Lists, projects and areas</h2>
        <Rows
          rows={[
            ['An area', 'A coarse bucket — Work, Home, Car. Everything else lives in one.'],
            ['A list', 'A rolling tally you never finish. One field: type and press enter.'],
            ['A project', 'Something with steps and an end. Subtasks, dates, a progress bar.'],
          ]}
        />
        <p className="hint" style={{ marginTop: 12 }}>
          Make either from <Link to="/lists">Lists</Link>. Capture picks it up
          straight away — a list called Hardware answers to <code>@hardware</code>.
        </p>
      </div>

      <div className="card">
        <h2>Templates</h2>
        <p className="hint">
          You don't build a template up front — you save one from a project you
          have just finished, on the project's own screen. Running it again
          anchors every step to a new date, so a step saved as “the night
          before” stays the night before.
        </p>
      </div>

      <div className="card">
        <h2>Important dates</h2>
        <p className="hint">
          Birthdays and anniversaries live on{' '}
          <Link to="/habits">Habits</Link>. They repeat yearly, cost nothing
          against your day and carry no checkbox — and they tell you a set
          number of days beforehand, so there is still time to buy something.
        </p>
      </div>

      <div className="card">
        <h2>The Inbox</h2>
        <p className="hint">
          Not a folder — anything open with no date, no project and no area is
          in it, and filing it anywhere takes it out. There is nothing to
          remember to clear.
        </p>
      </div>

      <div className="card">
        <h2>Reminders</h2>
        <p className="hint">
          Turn on notifications in <Link to="/settings">Settings</Link>. You'll
          get overdue and due-today nudges, a warning before anything with a
          time, one when a blocked-out slot is about to start, and one before a
          birthday.
        </p>
        <p className="hint">
          On iPhone, add Orbit to the home screen first — Safari won't allow
          notifications otherwise, and deleting it from the home screen throws
          the permission away.
        </p>
      </div>
    </main>
  )
}

/** A worked example of the capture syntax, part by part. */
function Example({ input, rows }: { input: string; rows: [string, string][] }) {
  return (
    <>
      <p className="example">{input}</p>
      <Rows rows={rows} mono />
    </>
  )
}

function Rows({ rows, mono = false }: { rows: [string, string][]; mono?: boolean }) {
  return (
    <dl className="deflist">
      {rows.map(([term, meaning]) => (
        <div key={term}>
          <dt>{mono ? <code>{term}</code> : term}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
