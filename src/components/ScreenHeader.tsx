import type { ReactNode } from 'react'

/** Large native-feeling screen title with an optional trailing control. */
export function ScreenHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="row--between" style={{ margin: '4px 0 14px' }}>
      <div>
        <h1 className="greeting">{title}</h1>
        {sub && <p className="muted" style={{ margin: '2px 0 0' }}>{sub}</p>}
      </div>
      {action}
    </header>
  )
}
