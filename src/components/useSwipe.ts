import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { classifyGesture, rowOffset, swipeOutcome } from '../domain/swipe'

/**
 * Swipe a row sideways to act on it.
 *
 * Touch and pen only. With a mouse, dragging across a row is how you select
 * its text, and the checkbox and the task screen are a click away anyway.
 *
 * The axis is decided once, a few pixels in (domain/swipe.ts), and then held,
 * so scrolling a list never nudges a row sideways. The container needs
 * `touch-action: pan-y` for the browser to hand horizontal movement to us at
 * all; vertical stays the browser's.
 */
export function useSwipe({
  onRight,
  onLeft,
}: {
  onRight?: () => void
  onLeft?: () => void
}) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const axis = useRef<'pending' | 'horizontal' | 'vertical'>('pending')
  // A swipe ends with the finger lifting over a link, which the browser then
  // reports as a click. This swallows that one click.
  const swallowClick = useRef(false)

  const allowRight = onRight !== undefined
  const allowLeft = onLeft !== undefined
  const enabled = allowRight || allowLeft

  const reset = () => {
    start.current = null
    axis.current = 'pending'
    setDragging(false)
    setDx(0)
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || e.pointerType === 'mouse' || !e.isPrimary) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    axis.current = 'pending'
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = start.current
    if (!s || e.pointerId !== s.id) return
    const moveX = e.clientX - s.x
    const moveY = e.clientY - s.y

    if (axis.current === 'pending') {
      axis.current = classifyGesture(moveX, moveY)
      if (axis.current === 'vertical') {
        start.current = null
        return
      }
      if (axis.current === 'horizontal') {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }
    }
    if (axis.current === 'horizontal') setDx(moveX)
  }

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const s = start.current
    if (!s || e.pointerId !== s.id) return
    if (axis.current === 'horizontal') {
      swallowClick.current = true
      const outcome = swipeOutcome(e.clientX - s.x, allowRight, allowLeft)
      if (outcome === 'right') onRight?.()
      if (outcome === 'left') onLeft?.()
    }
    reset()
  }

  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const offset = rowOffset(dx, allowRight, allowLeft)

  return {
    offset,
    dragging,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset, onClickCapture }
      : {},
  }
}
