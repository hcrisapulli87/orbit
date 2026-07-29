import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/**
 * `icon` is a glyph name rather than an emoji: an empty state is chrome, and
 * chrome has to take the palette. The icon inherits the block's --dim colour
 * through currentColor, so it stays quieter than the words under it.
 *
 * `action` is the way out of the empty state, for the cases where there is one
 * — an empty screen that only describes the problem leaves you to work out the
 * fix yourself.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: IconName
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} />
      </span>
      <p style={{ margin: 0, fontWeight: 700 }}>{title}</p>
      {hint && <p style={{ margin: '4px 0 0' }}>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}
