// Deterministic per-name background, not tied to package or status — jade/
// brass/clay already mean verified/pending/flagged elsewhere in this app, so
// reusing them here would make an avatar's color look like a status. This
// palette exists purely so adjacent rows in a long list read as distinct at
// a glance, same idea as Gmail/Slack/Linear's hashed contact-avatar colors.
const AVATAR_PALETTE = ['#3b6ea5', '#278282', '#8449a8', '#b8477a', '#5c6b8a', '#2f6fb0', '#6b4a8a', '#3f7d7a']

export function avatarHex(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
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
