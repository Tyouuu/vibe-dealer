// Solid fill for the avatar badge, keyed by package — same colors as the
// Package pill (pill-neutral/pill-jade/pill-brass) so the avatar reinforces
// what the Package column already says instead of adding an unrelated
// per-name color that doesn't mean anything.
const PACKAGE_HEX: Record<string, string> = {
  A: '#54565f',
  B: '#14803f',
  C: '#8a5d08',
}
const NO_PACKAGE_HEX = '#54565f'

export function avatarHex(pkg?: string | null): string {
  if (pkg && pkg in PACKAGE_HEX) return PACKAGE_HEX[pkg]
  return NO_PACKAGE_HEX
}

// First letter of the first two words — "Jaya Telecom Sdn Bhd" -> "JT".
export function avatarInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}
