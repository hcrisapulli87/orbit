// The arithmetic behind swiping a task row, kept away from the pointer events
// so it can be tested without a DOM.

/** How far a finger travels before the gesture commits to an axis. */
export const SWIPE_SLOP = 10

/** How far a row has to travel before letting go triggers its action. */
export const SWIPE_TRIGGER = 72

/**
 * Which way is this finger going?
 *
 * Decided once, early, and then held: a row that starts sliding while you
 * meant to scroll the list is the classic swipe bug. Horizontal has to clearly
 * win, so a diagonal drag stays a scroll.
 */
export function classifyGesture(dx: number, dy: number, slop = SWIPE_SLOP): 'pending' | 'horizontal' | 'vertical' {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < slop && ay < slop) return 'pending'
  return ax > ay * 1.5 ? 'horizontal' : 'vertical'
}

/**
 * Where to draw the row for a finger at `dx`. It follows the finger up to the
 * trigger point and then drags, so the row tells you when you've gone far
 * enough without anything having to light up. A direction with no action
 * doesn't move at all.
 */
export function rowOffset(dx: number, allowRight: boolean, allowLeft: boolean, trigger = SWIPE_TRIGGER): number {
  if ((dx > 0 && !allowRight) || (dx < 0 && !allowLeft)) return 0
  const ax = Math.abs(dx)
  const travelled = ax <= trigger ? ax : trigger + (ax - trigger) * 0.3
  return Math.sign(dx) * travelled
}

/** What letting go at `dx` does. */
export function swipeOutcome(dx: number, allowRight: boolean, allowLeft: boolean, trigger = SWIPE_TRIGGER): 'right' | 'left' | null {
  if (dx >= trigger && allowRight) return 'right'
  if (dx <= -trigger && allowLeft) return 'left'
  return null
}
