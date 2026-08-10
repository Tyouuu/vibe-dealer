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

// Set when "Remember me on this device" was ticked, and the thing that
// switches the idle clock off.
//
// The checkbox used to control one axis only — whether the session survived
// closing the browser — while the fifteen minutes above applied either way.
// So someone who ticked it, and reasonably read it as "keep me signed in",
// was signed out over lunch anyway and had no way to tell why. A control that
// says "remember me" and then does not is worse than no control.
//
// The 15 minutes still exists, and still covers the case it was written for:
// a shared or borrowed machine, where nobody ticks the box. Ticking it is the
// owner saying this device is theirs, which is exactly the judgement the rule
// could not make on its own.
//
// Not httpOnly, so signing out can clear it in the browser. Forgeable with
// devtools either way, like LAST_SEEN_COOKIE beside it, and for the same
// reason that is acceptable: the threat is the person who sits down at an
// unattended screen, not one who crafts a cookie. Someone able to set this by
// hand could equally set the timestamp it would have to beat. Its absence is
// always the stricter reading, so a lost or blocked cookie shortens a session
// rather than extending one.
export const REMEMBER_COOKIE = 'vibe_remember'
export const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
