import { describe, it, expect } from 'vitest'
import { readRecoveryLink, LINK_ALREADY_USED } from './recovery-link'

// The fragments below are copied from live responses off the production
// project, not from the docs — the reason this file exists is that the page was
// written against what the docs implied and met something else.
const USED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='
const GOOD = '#access_token=eyJhbG.aaa.bbb&expires_at=1786043200&expires_in=3600&refresh_token=r3fr3sh&sb=&token_type=bearer&type=recovery'

describe('readRecoveryLink', () => {
  it('reads the session a working link carries', () => {
    const out = readRecoveryLink(GOOD, '')
    expect(out).toEqual({ kind: 'session', accessToken: 'eyJhbG.aaa.bbb', refreshToken: 'r3fr3sh' })
  })

  it('reads a PKCE code from the query string', () => {
    expect(readRecoveryLink('', '?code=abc123')).toEqual({ kind: 'code', code: 'abc123' })
  })

  it('names a used link as used rather than as expired', () => {
    // The whole point. "Expired" sent someone to look at the clock, when what
    // had happened was that something opened the link before they did.
    const out = readRecoveryLink(USED, '')
    expect(out).toEqual({ kind: 'failed', failure: LINK_ALREADY_USED })
    expect(out.kind === 'failed' && out.failure.title).toContain('already been opened')
    expect(out.kind === 'failed' && out.failure.detail).toContain('only once')
  })

  it('does not blame the link when the fault is ours', () => {
    const out = readRecoveryLink('#error=server_error&error_code=unexpected_failure&error_description=Error+sending+recovery+email', '')
    expect(out.kind).toBe('failed')
    if (out.kind !== 'failed') return
    expect(out.failure.title).toBe('We could not open that link.')
    expect(out.failure.detail).toContain('our side')
    expect(out.failure.code).toBe('unexpected_failure')
  })

  it('handles access_denied that arrives without a code', () => {
    const out = readRecoveryLink('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired', '')
    expect(out.kind).toBe('failed')
    if (out.kind !== 'failed') return
    expect(out.failure.title).toBe('That link is no longer valid.')
    expect(out.failure.code).toBe('access_denied')
  })

  it('finds an error in the query string as well as the fragment', () => {
    // PKCE redirects put it there instead, and which flow produced a given
    // link is not something this page gets to know.
    const out = readRecoveryLink('', '?error=access_denied&error_code=otp_expired')
    expect(out).toEqual({ kind: 'failed', failure: LINK_ALREADY_USED })
  })

  it('treats an error as an error even when a token is also present', () => {
    // Order matters: a redirect carrying both is not a working link, and
    // reading the token first would hand setSession something already refused.
    const out = readRecoveryLink(`${USED}&access_token=eyJ.x.y&refresh_token=r`, '')
    expect(out.kind).toBe('failed')
  })

  it('says nothing arrived when nothing arrived', () => {
    expect(readRecoveryLink('', '')).toEqual({ kind: 'absent' })
    expect(readRecoveryLink('#', '?')).toEqual({ kind: 'absent' })
  })

  it('does not mistake half a session for a session', () => {
    // setSession needs both. Passing one and a null would fail deeper in, with
    // a message written for a library rather than for a person.
    expect(readRecoveryLink('#access_token=eyJ.x.y&token_type=bearer', '').kind).toBe('absent')
    expect(readRecoveryLink('#refresh_token=r3fr3sh', '').kind).toBe('absent')
  })

  it('every failure it can produce offers a way forward', () => {
    const fragments = [USED, '#error=access_denied', '#error=server_error&error_code=unexpected_failure', '#error_description=something+new']
    for (const f of fragments) {
      const out = readRecoveryLink(f, '')
      expect(out.kind).toBe('failed')
      if (out.kind !== 'failed') continue
      expect(out.failure.offerNewLink).toBe(true)
      expect(out.failure.title.length).toBeGreaterThan(0)
      expect(out.failure.detail.length).toBeGreaterThan(0)
    }
  })
})
