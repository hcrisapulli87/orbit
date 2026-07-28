// The line-icon set.
//
// Seven glyphs, one 24px grid, drawn in currentColor. Emoji couldn't do that:
// they carry their own colour, so a tab bar of them stays amber-and-violet no
// matter which palette is on, and they render as four different sets of
// artwork across Windows, iOS, Android and a Mac.
//
// Emoji used as *data* are untouched — a project's 🧺, an area's icon, the 🎂
// on an event checkbox. Those are the user's content, not the app's chrome.

const PATHS = {
  // sunrise: the horizon, the sun coming over it, two rays
  today: 'M3 18h18 M7 18a5 5 0 0 1 10 0 M12 4v2 M5 9l1.4 1.4 M19 9l-1.4 1.4',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M8 2.5V6 M16 2.5V6 M4 10h16',
  // a tray with a dip in its lip, so it reads as "things land here"
  inbox: 'M3.5 13h4l1.5 2.5h6L16.5 13h4 M3.5 13l2.6-7.2A2 2 0 0 1 8 4.5h8a2 2 0 0 1 1.9 1.3L20.5 13v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  lists: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  // two arrows chasing each other — a rule, not a single event
  habits: 'M17 2.5l3 3-3 3 M20 5.5H8.5a4.5 4.5 0 0 0-4.5 4.5v1 M7 21.5l-3-3 3-3 M4 18.5h11.5a4.5 4.5 0 0 0 4.5-4.5v-1',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19.3 14.2l1.7 1.3-1.9 3.3-2-.8a7.7 7.7 0 0 1-2 1.2l-.3 2.1h-3.8l-.3-2.1a7.7 7.7 0 0 1-2-1.2l-2 .8-1.9-3.3 1.7-1.3a7.8 7.8 0 0 1 0-2.4L2.8 10.5l1.9-3.3 2 .8a7.7 7.7 0 0 1 2-1.2L9 4.7h3.8l.3 2.1c.72.28 1.39.69 2 1.2l2-.8 1.9 3.3-1.7 1.3c.1.79.1 1.6 0 2.4z',
  plus: 'M12 5v14 M5 12h14',
  // layers: a thing assembled from parts you've stacked up before
  templates: 'M12 3l8.5 4.75L12 12.5 3.5 7.75z M3.5 12.25L12 17l8.5-4.75 M3.5 16.5L12 21.25l8.5-4.75',
  // struck-through circle: the thing you asked for isn't here
  missing: 'M12 21.2a9.2 9.2 0 1 0 0-18.4 9.2 9.2 0 0 0 0 18.4z M8.5 8.5l7 7',
} as const

export type IconName = keyof typeof PATHS

/**
 * `title` is what a screen reader gets. Leave it off for an icon that merely
 * repeats a label sitting next to it — the tab bar writes "Today" in words
 * underneath, so announcing the glyph as well would say everything twice.
 */
export function Icon({
  name,
  title,
  small = false,
}: {
  name: IconName
  title?: string
  small?: boolean
}) {
  return (
    <svg
      className={`ico${small ? ' ico--sm' : ''}`}
      viewBox="0 0 24 24"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}
