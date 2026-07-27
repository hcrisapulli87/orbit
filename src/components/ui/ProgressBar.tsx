export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="row" style={{ gap: 10 }}>
      <div className="meter" style={{ flex: 1 }}>
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="muted" style={{ fontSize: '0.72rem', minWidth: 42, textAlign: 'right' }}>
        {done}/{total}
      </span>
    </div>
  )
}
