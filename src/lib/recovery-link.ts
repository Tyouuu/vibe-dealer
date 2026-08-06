// What a recovery link is carrying, and what to say when it is carrying bad news.
//
// The reset page used to answer every failure with one sentence — "That reset
// link is invalid or has expired" — which is what a master read after clicking
// a link that had arrived ninety seconds earlier. It had not expired. Something
// had opened it first: these links are single-use, and a browser extension or a
// mail scanner that follows the URL burns the token before the person does.
//
// Supabase says which it is. The fragment comes back with
// error_code=otp_expired, or access_denied, or server_error, and the page threw
// all of that away. Five different failures, one sentence, and the one piece of
// advice that would have helped — ask for another and open it in a private
// window — was in none of them.
//
// Kept out of the component because this is the part worth testing: it is a
// string table keyed on someone else's error codes, and the failure mode is
// silent drift, where a code changes and every branch quietly funnels back into
// the same unhelpful sentence it started as.

export type LinkFailure = {
  /** The thing that is true, in one line. */
  title: string
  /** Why it happened and what to do about it. */
  detail: string
  /** Supabase's own code. Shown small, so a screenshot is enough to help someone. */
  code: string | null
  /** Whether asking for another link is the fix. It usually is; it is not when there was never a link. */
  offerNewLink: boolean
  /**
   * 'bad' for something that went wrong, 'neutral' for a page reached with no
   * link at all. Painting the second one red says a failure happened when none
   * did, and red that does not mean failure is red that stops meaning anything.
   */
  tone: 'bad' | 'neutral'
}

export type RecoveryLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'failed'; failure: LinkFailure }
  | { kind: 'absent' }

// A link only works once, and that is the fact behind most of these. Said in
// full because "invalid or has expired" reads as "you were too slow", which
// sends someone to look at the clock instead of at the thing that opened it.
const SINGLE_USE_ADVICE =
  'A reset link works only once. If you did not open it yourself, something else did first — a browser extension ' +
  'or a mail scanner following the link will use it up. Ask for a new one and open it in a private window.'

export const LINK_ALREADY_USED: LinkFailure = {
  title: 'That link has already been opened, or it is over an hour old.',
  detail: SINGLE_USE_ADVICE,
  code: 'otp_expired',
  offerNewLink: true,
  tone: 'bad',
}

// Reached when setSession or the code exchange rejects a token the URL did
// carry. Different from an expired link: the link arrived, and it still did not
// work, so saying "expired" would be a guess presented as a fact.
export const LINK_NOT_ACCEPTED: LinkFailure = {
  title: 'That link could not be verified.',
  detail:
    'The link arrived, but signing in with it did not work. This is usually a link that has been opened once ' +
    'already. Ask for a new one — and if the next one does the same, tell whoever set this up.',
  code: null,
  offerNewLink: true,
  tone: 'bad',
}

// Someone typed the address, or followed a bookmark. Nothing is broken, and an
// error the colour of a problem would be a lie.
export const LINK_ABSENT: LinkFailure = {
  title: 'This page needs a link from a reset email.',
  detail: 'Nothing is wrong. Setting a new password starts from the email we send you.',
  code: null,
  offerNewLink: true,
  tone: 'neutral',
}

function failureFor(error: string | null, errorCode: string | null): LinkFailure {
  if (errorCode === 'otp_expired') return LINK_ALREADY_USED

  if (error === 'access_denied') {
    return {
      title: 'That link is no longer valid.',
      detail: SINGLE_USE_ADVICE,
      code: errorCode ?? error,
      offerNewLink: true,
      tone: 'bad',
    }
  }

  // server_error and anything new Supabase starts sending. Naming it as ours
  // matters: telling someone their link expired when the mail service fell over
  // sends them to fix something that was never theirs.
  return {
    title: 'We could not open that link.',
    detail: 'This one is a fault on our side, not with your link. Asking for a new one usually clears it.',
    code: errorCode ?? error,
    offerNewLink: true,
    tone: 'bad',
  }
}

/**
 * Read a recovery redirect.
 *
 * Both halves of the URL are inspected. The implicit redirect puts everything
 * in the fragment; the PKCE one uses the query string; an error can arrive in
 * either, and which one is not worth depending on.
 */
export function readRecoveryLink(hash: string, search: string): RecoveryLink {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''))
  const fromSearch = new URLSearchParams(search.replace(/^\?/, ''))
  const get = (key: string) => fromHash.get(key) || fromSearch.get(key) || null

  const error = get('error')
  const errorCode = get('error_code')
  const errorDescription = get('error_description')
  if (error || errorCode || errorDescription) {
    return { kind: 'failed', failure: failureFor(error, errorCode) }
  }

  const accessToken = get('access_token')
  const refreshToken = get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken }

  const code = get('code')
  if (code) return { kind: 'code', code }

  return { kind: 'absent' }
}
