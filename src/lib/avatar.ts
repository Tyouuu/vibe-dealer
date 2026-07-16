const AVATAR_COLORS = ['jade', 'brass', 'clay', 'slate'] as const

// Solid fill for the avatar badge — the app's existing *-bright text tokens,
// reused as backgrounds instead of new one-off hex values.
const AVATAR_HEX: Record<(typeof AVATAR_COLORS)[number], string> = {
  jade: '#14803f',
  brass: '#8a5d08',
  clay: '#c02329',
  slate: '#54565f',
}

// Deterministic per-name color so lists read less like a spreadsheet — same
// idea as Tekion's avatar photos, minus the photos we don't have.
export function avatarColor(name: string): (typeof AVATAR_COLORS)[number] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function avatarHex(name: string): string {
  return AVATAR_HEX[avatarColor(name)]
}
