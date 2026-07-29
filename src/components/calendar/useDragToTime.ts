import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { HOUR_PX } from './DayColumn'

/** Minutes a dragged item snaps to. Fine enough to be useful, coarse enough
    to be hittable with a thumb. */
export const SNAP_MIN = 15

/** How long to hold before a drag starts, in ms. */
const HOLD_MS = 350

/** How far a finger may wander during the hold before it counts as a scroll. */
const SLOP_PX = 10

export interface DragState {
  id: string
  /** Minutes the item has moved from where it started, already snapped. */
  deltaMin: number
}

/**
 * Long-press an item on the hour grid, then drag it to a new time.
 *
 * Pointer events rather than a gesture library, because this is a web app and
 * the two behaviours that actually matter — capturing the pointer so the drag
 * survives leaving the element, and suppressing the page scroll only once a
 * drag has really begun — are both one line each here.
 *
 * The hold is what makes it safe on a phone: a straight drag scrolls the day,
 * and only a press that stays put for HOLD_MS turns into a move. A tap shorter
 * than that falls through to onClick, so tap-to-edit and drag-to-move can share
 * the same element without competing.
 */
export function useDragToTime(onCommit: (id: string, deltaMin: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const origin = useRef<{ id: string; y: number; timer: number } | null>(null)
  // Held in a ref as well as state: pointerup needs the final value, and the
  // state update from the last pointermove hasn't been applied yet.
  const latest = useRef(0)

  const cancelHold = () => {
    if (origin.current) window.clearTimeout(origin.current.timer)
    origin.current = null
  }

  const onPointerDown = (id: string) => (e: ReactPointerEvent) => {
    // Secondary buttons and multi-touch are somebody else's gesture.
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.currentTarget as HTMLElement
    latest.current = 0

    const timer = window.setTimeout(() => {
      target.setPointerCapture(e.pointerId)
      setDrag({ id, deltaMin: 0 })
    }, HOLD_MS)

    origin.current = { id, y: e.clientY, timer }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const start = origin.current
    if (!start) return

    const moved = e.clientY - start.y

    // Still waiting on the hold: a finger that travels is scrolling, not
    // dragging, so let the page have it.
    if (!drag) {
      if (Math.abs(moved) > SLOP_PX) cancelHold()
      return
    }

    const snapped = Math.round((moved / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN
    latest.current = snapped
    setDrag({ id: start.id, deltaMin: snapped })
  }

  const onPointerUp = () => {
    const start = origin.current
    cancelHold()
    if (!drag || !start) return
    setDrag(null)
    if (latest.current !== 0) onCommit(start.id, latest.current)
  }

  return {
    /** The item currently being dragged, for the live offset on screen. */
    drag,
    handlers: (id: string) => ({
      onPointerDown: onPointerDown(id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // Only while dragging, so an ordinary press can still scroll the day.
      style: drag?.id === id ? ({ touchAction: 'none' } as const) : undefined,
    }),
  }
}
