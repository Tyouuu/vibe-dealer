// Sign a session out after a stretch of doing nothing.
//
// "Remember me" already decides whether the session survives closing the
// browser, but nothing ever ended a session that was simply left open. The
// office this runs in shares machines: the accountant — who can see every
// figure and verify every entry — goes to lunch with the ledger on screen, and
// until now it was still there when anyone else sat down.
//
// Fifteen minutes because the threat is measured in lunch breaks, not minutes.
// General B2B SaaS guidance lands at 30–60 minutes idle; the same guidance
// halves it for anything holding money. Lunch is longer than either, so the
// shorter band is the one that actually covers the case, and the cost of being
// wrong is retyping a password.
export const IDLE_LIMIT_MS = 15 * 60 * 1000

// How often the browser is allowed to tell the server someone is still there.
// Typing does not reach the server, so without this a person carefully filling
// in a long entry looks identical to an empty chair, and would be signed out
// mid-form. One ping a minute is enough to tell the two apart and cheap enough
// not to matter.
export const KEEPALIVE_INTERVAL_MS = 60 * 1000

// httpOnly, so page scripts cannot read or extend it. That does not make it
// unforgeable — someone with devtools can still set it by hand — and it is not
// meant to. The threat here is the person who sits down at an unattended
// machine, not one who crafts a cookie; for them the session is simply gone.
export const LAST_SEEN_COOKIE = 'vibe_last_seen'
