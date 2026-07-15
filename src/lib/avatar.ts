const AVATAR_COLORS = ['jade', 'brass', 'clay', 'slate'] as const

// Deterministic per-name color so lists read less like a spreadsheet — same
// idea as Tekion's avatar photos, minus the photos we don't have.
export function avatarColor(name: string): (typeof AVATAR_COLORS)[number] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
