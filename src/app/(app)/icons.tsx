type IconProps = { className?: string }

const base = 'h-5 w-5'

// The brand mark — a circle split by the same dashed tear-perforation used
// everywhere money faces points (`.docket-row`, `.docket-hero`). One motif,
// every scale: the logo IS the business rule, not a stamped-on initial.
export function LogoMark({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="16" cy="16" r="16" fill="var(--color-jade)" />
      <line
        x1="16"
        y1="7.5"
        x2="16"
        y2="24.5"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeDasharray="2.4 2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconTrendUp({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 13l4.5-4.5L11 12l6-6" />
      <path d="M13 6h4v4" />
    </svg>
  )
}

export function IconCoin({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.2v7.6" />
      <path d="M12.1 8.1c-.3-.9-1.1-1.4-2.1-1.4-1.3 0-2.3.7-2.3 1.7 0 2.4 4.5 1.1 4.5 3.4 0 1-1 1.7-2.3 1.7-1 0-1.8-.4-2.1-1.3" />
    </svg>
  )
}

export function IconUsers({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.5 16c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="14.3" cy="7.5" r="2" />
      <path d="M14 11.5c1.9.1 3.5 1.9 3.5 4" />
    </svg>
  )
}

export function IconAlertCircle({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v4" />
      <circle cx="10" cy="13.4" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconTruck({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2.3 6h8.2v7h-8.2z" />
      <path d="M10.5 9h3.6l2.6 2.6V13h-6.2z" />
      <circle cx="6" cy="14.6" r="1.3" />
      <circle cx="14.3" cy="14.6" r="1.3" />
    </svg>
  )
}

export function IconCheckCircle({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.2l2 2 4-4.4" />
    </svg>
  )
}
