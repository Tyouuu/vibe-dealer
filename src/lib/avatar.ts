// Deterministic per-name background, not tied to package or status — jade/
// brass/clay already mean verified/pending/flagged elsewhere in this app, so
// reusing them here would make an avatar's color look like a status. This
// palette exists purely so adjacent rows in a long list read as distinct at
// a glance, same idea as Gmail/Slack/Linear's hashed contact-avatar colors.
// All eight now sit in the navy/teal family the rest of the palette belongs
// to. Three of the previous eight were purple or magenta (#8449a8, #6b4a8a,
// #b8477a) — survivors of the purple accent, and with a hashed palette that
// meant roughly three dealers in eight rendered in a hue that appears
// nowhere else in the product. Varying lightness and a little hue drift is
// enough to tell adjacent rows apart; it does not need a colour wheel.
// Every value carries white text at 6:1 or better.
const AVATAR_PALETTE = ['#1e3a5f', '#2b6a63', '#2f5d8a', '#4a5f7d', '#17415c', '#37697f', '#26506e', '#3f5570']

export function avatarHex(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

// First letter of the first two words — "Jaya Telecom Sdn Bhd" -> "JT".
//
// Words that don't start with a letter or digit are skipped rather than
// counted: "CK & WYNN GADGET" was rendering "C&" and "EXCLUSIVE - STATION 18"
// was rendering "E-". Two of 291 dealers, which is exactly the sort of thing
// that survives because nobody scrolls to it — found by running this over the
// real names rather than by reading the function.
export function avatarInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      // Leading punctuation is stripped rather than the word dropped, so a
      // parenthesised word still contributes its letter: "CS (test)" gives
      // "CT", while "CK & WYNN GADGET" gives "CW" because "&" strips to
      // nothing and falls out below.
      .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  )
}
