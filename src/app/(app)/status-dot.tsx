type StatusDotColor = 'jade-bright' | 'brass-bright' | 'clay-bright' | 'slate-bright'

export function StatusDot({ color, label, pulse }: { color: StatusDotColor; label: string; pulse?: boolean }) {
  return (
    <span className="status-dot-row" style={{ color: `var(--color-${color})` }}>
      <span className={`status-dot ${pulse ? 'pulse' : ''}`} style={{ background: `var(--color-${color})` }} />
      {label}
    </span>
  )
}
