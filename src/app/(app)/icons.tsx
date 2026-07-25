type IconProps = { className?: string }

const base = 'h-5 w-5'

// The reference's brand mark exactly: rounded-square purple gradient tile
// with a white lightning-bolt glyph — not a custom redesign.
export function LogoMark({ className = 'h-8 w-8' }: IconProps) {
  return (
    <span
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-[28%] bg-gradient-to-br from-primary to-primary-deep shadow-[0_4px_10px_-2px_rgba(108,92,231,0.5)]`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[55%] w-[55%]">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    </span>
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

// Small (3.5-4 units) table-column-header icons — same idea as Attio's
// icon-before-label headers ("🌐 Company", "◎ Owner"): a tiny bit of visual
// texture on a plain-text row so the eye has something to anchor on.
const th = 'h-3.5 w-3.5'

export function IconBuilding({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 17V4.5h7V17" />
      <path d="M12 9h3v8" />
      <path d="M7 7h1M7 10h1M7 13h1" />
    </svg>
  )
}

export function IconMapPin({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 17.5S16 12.6 16 8a6 6 0 1 0-12 0c0 4.6 6 9.5 6 9.5z" />
      <circle cx="10" cy="8" r="2" />
    </svg>
  )
}

export function IconPhone({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 3.5h3l1.3 3.6-1.8 1.4a9 9 0 0 0 4.5 4.5l1.4-1.8 3.6 1.3v3a1.3 1.3 0 0 1-1.4 1.3A13 13 0 0 1 3.2 4.9a1.3 1.3 0 0 1 1.3-1.4z" />
    </svg>
  )
}

// The bold move: an actual ink-stamp graphic for the one truly ceremonial
// state in a ledger app — "the books are closed and verified." No CRM or
// DMS template has this, because it only makes sense for a business that
// deals in dockets and receipts, which is exactly what this one does.
export function ReconciledStamp({ label = 'RECONCILED', sub }: { label?: string; sub?: string }) {
  return (
    <svg viewBox="0 0 100 100" className="stamp-mark h-16 w-16 text-jade">
      <defs>
        <path id="stamp-arc-top" d="M 12,58 A 38,38 0 1 1 88,58" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 2.2" />
      <text fontSize="10.5" fontWeight="800" letterSpacing="2.2" fill="currentColor">
        <textPath href="#stamp-arc-top" startOffset="50%" textAnchor="middle">
          {label}
        </textPath>
      </text>
      <text x="50" y="55" textAnchor="middle" fontSize="17" fontWeight="800" fill="currentColor">
        ✓
      </text>
      {sub && (
        <text x="50" y="73" textAnchor="middle" fontSize="7.5" fontWeight="700" letterSpacing="1" fill="currentColor">
          {sub}
        </text>
      )}
    </svg>
  )
}

export function IconTag({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 3.5h4.5V8L7 16.5l-4.5-4.5L11 3.5z" />
      <circle cx="13" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconInfo({ className = 'h-[15px] w-[15px]' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9.25v4.25" />
      <circle cx="10" cy="6.75" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function IconDocument({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11.5 2H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5z" />
      <path d="M11.5 2v4.5H16" />
    </svg>
  )
}

export function IconLock({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  )
}

export function IconMail({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="m3 5.5 7 5.5 7-5.5" />
    </svg>
  )
}

export function IconEye({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  )
}

export function IconEyeOff({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2.5 2.5l15 15" />
      <path d="M8.3 4.2A8.4 8.4 0 0 1 10 4c5.5 0 8.5 6 8.5 6a14.5 14.5 0 0 1-3.15 3.9M5.2 5.7C3 7.2 1.5 10 1.5 10s3 6 8.5 6a8 8 0 0 0 2.75-.5" />
      <path d="M8.1 8.1a2.25 2.25 0 0 0 3.18 3.18" />
    </svg>
  )
}

export function IconPaperclip({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

export function IconUpload({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13V4M10 4L6.5 7.5M10 4l3.5 3.5" />
      <path d="M4 13v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
    </svg>
  )
}

export function IconDevices({ className = th }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.5" y="3.5" width="12.5" height="9" rx="1.2" />
      <path d="M6.5 15.5h4.5" />
      <path d="M8.75 12.5v3" />
      <rect x="13.5" y="9" width="4" height="6.5" rx="0.8" />
    </svg>
  )
}

export function IconBell({ className = 'h-[17px] w-[17px]' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 7.5a5 5 0 0 1 10 0c0 5.8 2.5 7.5 2.5 7.5H2.5s2.5-1.7 2.5-7.5Z" />
      <path d="M11.4 17.5a1.7 1.7 0 0 1-2.8 0" />
    </svg>
  )
}

export function IconHelp({ className = 'h-[17px] w-[17px]' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="8.3" />
      <path d="M7.6 7.5a2.5 2.5 0 0 1 4.8.83c0 1.67-2.5 1.67-2.5 3.34" />
      <path d="M10 14.2h.01" />
    </svg>
  )
}

export function IconChevronDown({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 8 5 5 5-5" />
    </svg>
  )
}

export function IconSearch({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="9" r="6.5" />
      <path d="m18 18-3.6-3.6" />
    </svg>
  )
}

export function IconLogout({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.5 17.5h-3a1.7 1.7 0 0 1-1.7-1.7v-11.6a1.7 1.7 0 0 1 1.7-1.7h3" />
      <path d="M13.3 14.2 17.5 10l-4.2-4.2" />
      <path d="M17.5 10h-10" />
    </svg>
  )
}
