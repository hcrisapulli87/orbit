export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <p style={{ margin: 0, fontWeight: 700 }}>{title}</p>
      {hint && <p style={{ margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}
