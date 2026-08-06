'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { readRecoveryLink, LINK_ABSENT, LINK_NOT_ACCEPTED, type LinkFailure } from '@/lib/recovery-link'

// The reset link's session isn't visible to the server on first load, and
// @supabase/ssr's browser client — unlike the plain supabase-js client —
// doesn't auto-detect either shape it can arrive in, so both are handled by
// hand: a #access_token=...&refresh_token=... fragment (the shape
// admin.generateLink and, empirically, this project's resetPasswordForEmail
// both produce) is exchanged via setSession; a ?code=... query param (the
// PKCE shape some Supabase configurations use instead) via
// exchangeCodeForSession. Whichever it is, the token is single-use — a page
// refresh after this runs would just find no fragment/code left and no
// session at all.
//
// It can also arrive carrying nothing but an error, and for a long time this
// page had one sentence for that and for everything else. Which failure it
// was, and what to say about each, is in lib/recovery-link.ts with its tests.
export function ResetPasswordForm() {
  const router = useRouter()
  // null while still checking; a LinkFailure once it has failed.
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState<LinkFailure | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const settle = (f: LinkFailure | null) => {
      if (cancelled) return
      if (f) setFailure(f)
      else setReady(true)
    }

    async function establishSession() {
      const link = readRecoveryLink(window.location.hash, window.location.search)

      if (link.kind === 'failed') {
        settle(link.failure)
        return
      }

      if (link.kind === 'session') {
        const { error } = await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        })
        settle(error ? LINK_NOT_ACCEPTED : null)
        return
      }

      if (link.kind === 'code') {
        const { error } = await supabase.auth.exchangeCodeForSession(link.code)
        settle(error ? LINK_NOT_ACCEPTED : null)
        return
      }

      // No token in the URL at all — check for an existing session before
      // giving up, in case this page was reached some other way. Someone
      // already signed in can set a password here, which is how a recovery
      // link that landed on the wrong path still gets its owner home.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      settle(session ? null : LINK_ABSENT)
    }

    establishSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // 10, matching what Supabase Auth itself now enforces (password_min_length)
    // and what the Staff screen requires for a temporary password. At 8 this
    // check passed and the server rejected it a moment later in its own words,
    // which is the worst of both: the form said yes, then something else said
    // no in language nobody wrote for this screen.
    if (password.length < 10) {
      setError('Password must be at least 10 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setPending(false)
      setError(updateError.message)
      return
    }

    // The recovery link leaves the browser signed in as this user — sign out
    // so they land back on Sign In and prove the new password works, rather
    // than silently trusting a session someone else's mail client prefetched.
    await supabase.auth.signOut()
    router.push('/login?reset=1')
  }

  if (failure) {
    return (
      <div className="flex flex-col gap-4" data-reset-failure={failure.code ?? 'none'}>
        {/* The alert carries the one line that is true. The reason it happened
            and what to do about it go below it, because an alert sized to hold
            a paragraph stops reading as an alert. */}
        <div className={`alert mb-0 ${failure.tone === 'bad' ? 'alert-bad' : 'alert-neutral'}`}>{failure.title}</div>
        <p className="info-strip mb-0" data-reset-hint>
          {failure.detail}
        </p>
        {failure.offerNewLink && (
          <Link href="/forgot-password" className="text-center text-[12px] text-primary-deep">
            Request a new link
          </Link>
        )}
        {failure.code && (
          <p className="text-center text-[12px] text-paper-dim">
            If you need to ask about this, the code is <span className="font-mono">{failure.code}</span>.
          </p>
        )}
      </div>
    )
  }

  if (!ready) {
    return <p className="text-center text-sm text-paper-dim">Verifying your reset link…</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="alert alert-bad">{error}</div>}

      <div>
        <label htmlFor="password" className="field-label">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field-input"
        />
      </div>
      <span className="hint">Must be at least 10 characters.</span>

      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full py-2.5">
        {pending ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
